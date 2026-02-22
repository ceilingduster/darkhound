from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db.models import HuntExecution, HuntState
from app.core.events.emitter import emit_event
from app.core.events.schema import (
    HuntCancelled,
    HuntCompleted,
    HuntFailed,
    HuntObservation,
    HuntStarted,
    HuntStepCompleted,
    HuntStepStarted,
)
from app.core.session.manager import session_manager
from app.ssh.executor import execute_command
from .loader import module_registry
from .models import HuntModule, HuntStep

logger = logging.getLogger(__name__)


class HuntOrchestrator:
    """
    Manages running hunt executions.
    Each hunt runs as a background asyncio Task.
    """

    def __init__(self) -> None:
        self._active: dict[str, asyncio.Task] = {}  # hunt_id -> task
        self._cancel_flags: dict[str, bool] = {}

    async def start(
        self,
        session_id: str,
        module_id: str,
        analyst_id: str,
        db: AsyncSession,
        run_ai: bool = True,
    ) -> str:
        ctx = session_manager.get(session_id)
        if ctx is None:
            raise ValueError(f"Session {session_id} not found")

        module = module_registry.get(module_id)
        if module is None:
            raise ValueError(f"Hunt module '{module_id}' not found")

        hunt_id = str(uuid.uuid4())

        # Persist initial record
        execution = HuntExecution(
            id=uuid.UUID(hunt_id),
            session_id=uuid.UUID(session_id),
            module_id=module_id,
            state=HuntState.PENDING,
            observations=[],
        )
        db.add(execution)
        await db.flush()

        self._cancel_flags[hunt_id] = False

        task = asyncio.create_task(
            self._run_hunt(hunt_id, session_id, module, execution, run_ai),
            name=f"hunt-{hunt_id}",
        )
        self._active[hunt_id] = task
        task.add_done_callback(lambda t: self._active.pop(hunt_id, None))

        return hunt_id

    async def cancel(self, hunt_id: str) -> None:
        self._cancel_flags[hunt_id] = True
        task = self._active.get(hunt_id)
        if task and not task.done():
            task.cancel()

    async def _run_hunt(
        self,
        hunt_id: str,
        session_id: str,
        module: HuntModule,
        execution: HuntExecution,
        run_ai: bool,
    ) -> None:
        from app.core.db.engine import AsyncSessionLocal

        await emit_event(HuntStarted(session_id=session_id, hunt_id=hunt_id, module_id=module.id))

        # Record timeline event for hunt start
        ctx = session_manager.get(session_id)
        if ctx:
            try:
                async with AsyncSessionLocal() as tl_db:
                    from app.intelligence.timeline.recorder import record_timeline_event
                    await record_timeline_event(
                        asset_id=ctx.asset_id,
                        event_type="hunt.started",
                        analyst_id=ctx.analyst_id,
                        payload={"hunt_id": hunt_id, "module_id": module.id, "module_name": module.name},
                        session_id=session_id,
                        db=tl_db,
                    )
                    await tl_db.commit()
            except Exception as tl_exc:
                logger.warning("Timeline record failed for hunt start: %s", tl_exc)

        all_observations: list[dict] = []
        findings_count = 0

        try:
            async with AsyncSessionLocal() as db:
                # Mark RUNNING
                from sqlalchemy import update
                await db.execute(
                    update(HuntExecution)
                    .where(HuntExecution.id == execution.id)
                    .values(state=HuntState.RUNNING)
                )
                await db.commit()

                # Resolve credentials for sudo support
                credentials: dict | None = None
                if ctx and ctx.ssh_connection:
                    credentials = ctx.ssh_connection._credentials

                for step in module.steps:
                    if self._cancel_flags.get(hunt_id):
                        await emit_event(HuntCancelled(session_id=session_id, hunt_id=hunt_id))
                        await db.execute(
                            update(HuntExecution)
                            .where(HuntExecution.id == execution.id)
                            .values(state=HuntState.CANCELLED)
                        )
                        await db.commit()
                        return

                    step_observations = await self._execute_step(
                        hunt_id, session_id, step, db, credentials=credentials,
                    )
                    all_observations.extend(step_observations)

                if run_ai:
                    # AI analysis (imported lazily to avoid circular imports)
                    try:
                        from app.ai.engine import analyze_hunt_results
                        findings_count = await analyze_hunt_results(
                            session_id=session_id,
                            hunt_id=hunt_id,
                            module=module,
                            observations=all_observations,
                            db=db,
                        )
                    except Exception as exc:
                        logger.error("AI analysis failed for hunt %s: %s", hunt_id, exc)
                        # Graceful degradation — complete hunt without AI analysis

                # Mark COMPLETED
                await db.execute(
                    update(HuntExecution)
                    .where(HuntExecution.id == execution.id)
                    .values(
                        state=HuntState.COMPLETED,
                        completed_at=datetime.now(timezone.utc),
                        observations=all_observations,
                    )
                )
                await db.commit()

            await emit_event(
                HuntCompleted(
                    session_id=session_id,
                    hunt_id=hunt_id,
                    findings_count=findings_count,
                )
            )

            # Record timeline event for hunt completion
            if ctx:
                try:
                    async with AsyncSessionLocal() as tl_db:
                        from app.intelligence.timeline.recorder import record_timeline_event
                        await record_timeline_event(
                            asset_id=ctx.asset_id,
                            event_type="hunt.completed",
                            analyst_id=ctx.analyst_id,
                            payload={"hunt_id": hunt_id, "module_id": module.id, "findings_count": findings_count},
                            session_id=session_id,
                            db=tl_db,
                        )
                        await tl_db.commit()
                except Exception as tl_exc:
                    logger.warning("Timeline record failed for hunt completed: %s", tl_exc)

        except asyncio.CancelledError:
            await emit_event(HuntCancelled(session_id=session_id, hunt_id=hunt_id))
        except Exception as exc:
            logger.error("Hunt %s failed: %s", hunt_id, exc, exc_info=True)
            await emit_event(HuntFailed(session_id=session_id, hunt_id=hunt_id, error=str(exc)))

            # Record timeline event for hunt failure
            if ctx:
                try:
                    async with AsyncSessionLocal() as tl_db:
                        from app.intelligence.timeline.recorder import record_timeline_event
                        await record_timeline_event(
                            asset_id=ctx.asset_id,
                            event_type="hunt.failed",
                            analyst_id=ctx.analyst_id,
                            payload={"hunt_id": hunt_id, "module_id": module.id, "error": str(exc)},
                            session_id=session_id,
                            db=tl_db,
                        )
                        await tl_db.commit()
                except Exception as tl_exc:
                    logger.warning("Timeline record failed for hunt failed: %s", tl_exc)

        finally:
            self._cancel_flags.pop(hunt_id, None)

    async def _execute_step(
        self,
        hunt_id: str,
        session_id: str,
        step: HuntStep,
        db: AsyncSession,
        credentials: dict | None = None,
    ) -> list[dict]:
        await emit_event(
            HuntStepStarted(
                session_id=session_id,
                hunt_id=hunt_id,
                step_id=step.id,
                description=step.description,
            )
        )

        observations: list[dict] = []
        try:
            # Apply sudo policy based on asset's sudo_method
            from app.core.security.classifier import SudoPolicy
            sudo_method = (credentials or {}).get("sudo_method")
            sudo_policy = SudoPolicy(sudo_method=sudo_method)
            command = sudo_policy.wrap_command(step.command, step.requires_sudo)

            # Only pass sudo_password when the command was actually wrapped with sudo -S
            sudo_pw = None
            if step.requires_sudo and sudo_method in ("ssh_password", "custom_password"):
                sudo_pw = (credentials or {}).get("sudo_password")

            stdout, stderr, exit_code = await execute_command(
                session_id=session_id,
                command=command,
                timeout=step.timeout,
                sudo_password=sudo_pw,
            )

            # Truncate output to prevent oversized payloads
            MAX_STDOUT = 32768  # 32KB per step
            MAX_STDERR = 8192   # 8KB per step
            truncated_stdout = stdout[:MAX_STDOUT] if stdout else ""
            truncated_stderr = stderr[:MAX_STDERR] if stderr else ""

            obs = {
                "step_id": step.id,
                "command": command,
                "stdout": truncated_stdout,
                "stderr": truncated_stderr,
                "exit_code": exit_code,
                "truncated": len(stdout) > MAX_STDOUT or len(stderr) > MAX_STDERR,
            }
            observations.append(obs)

            obs_id = str(uuid.uuid4())
            await emit_event(
                HuntObservation(
                    session_id=session_id,
                    hunt_id=hunt_id,
                    observation_id=obs_id,
                    data=obs,
                )
            )

        except Exception as exc:
            logger.warning("Step %s failed in hunt %s: %s", step.id, hunt_id, exc)
            observations.append({
                "step_id": step.id,
                "command": step.command,
                "error": str(exc),
                "exit_code": -1,
            })

        await emit_event(
            HuntStepCompleted(
                session_id=session_id,
                hunt_id=hunt_id,
                step_id=step.id,
                observations=observations,
            )
        )

        return observations


hunt_orchestrator = HuntOrchestrator()
