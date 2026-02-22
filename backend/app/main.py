from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from app.config import settings
from app.core.events.emitter import bus_drain_loop

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────────────
    if settings.is_production and not settings.vault_enabled:
        raise RuntimeError("VAULT_ENABLED must be true in production")

    if settings.is_production and "change-me" in settings.secret_key:
        raise RuntimeError("SECRET_KEY must be changed from the default in production")

    if not settings.vault_enabled:
        logger.warning(
            "VAULT DISABLED — credentials will be read from environment variables. "
            "Never use this in production!"
        )

    # Load hunt module registry
    from app.hunt.loader import module_registry
    module_registry.load_all()

    # Start bus drain background task
    drain_task = asyncio.create_task(bus_drain_loop())

    # Start stale session reaper (runs every 5 minutes)
    async def _session_reaper():
        from app.core.session.manager import session_manager
        while True:
            try:
                await asyncio.sleep(300)
                await session_manager.reap_stale_sessions()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.warning("Session reaper error: %s", exc)

    reaper_task = asyncio.create_task(_session_reaper(), name="session-reaper")

    logger.info("AI Hunter backend started (env=%s)", settings.app_env)

    yield

    # ── Shutdown ─────────────────────────────────────────────────────────────
    reaper_task.cancel()
    drain_task.cancel()

    # Gracefully terminate all active sessions
    from app.core.session.manager import session_manager
    await session_manager.shutdown_all()

    try:
        await drain_task
    except asyncio.CancelledError:
        pass
    logger.info("AI Hunter backend shutdown")


# ── FastAPI app ───────────────────────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])

app = FastAPI(
    title="AI Hunter",
    description="AI-assisted SSH threat hunting platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Auth routes ───────────────────────────────────────────────────────────────

from app.core.db.models import User, UserRole
from app.core.db.engine import get_async_session
from app.core.security.auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    verify_refresh_token,
)
from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import CurrentUser


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RegisterRequest(BaseModel):
    username: str
    password: str
    role: str = "analyst"


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@app.post("/auth/login", response_model=TokenResponse, tags=["auth"])
async def login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_async_session),
):
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account inactive")

    return TokenResponse(
        access_token=create_access_token(user.username, user.role.value),
        refresh_token=create_refresh_token(user.username, user.role.value),
    )


@app.post("/auth/refresh", response_model=TokenResponse, tags=["auth"])
async def refresh_token(body: dict, db: AsyncSession = Depends(get_async_session)):
    token = body.get("refresh_token", "")
    try:
        payload = verify_refresh_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    result = await db.execute(select(User).where(User.username == payload["sub"]))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return TokenResponse(
        access_token=create_access_token(user.username, user.role.value),
        refresh_token=create_refresh_token(user.username, user.role.value),
    )


@app.post("/auth/register", response_model=dict, tags=["auth"])
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_async_session)):
    from sqlalchemy import func as sa_func

    # Check if any users exist (first-run bootstrap mode)
    user_count = (await db.execute(select(sa_func.count(User.id)))).scalar() or 0

    if user_count > 0:
        # After first user exists, registration requires admin authentication
        # This is enforced by checking for a valid admin Bearer token
        from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
        from app.core.security.auth import verify_access_token

        auth_header = None
        # Registration after bootstrap requires Authorization header
        # We check manually since this endpoint can't use Depends() conditionally
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration requires admin authorization. Use POST /api/v1/admin/register instead.",
        )

    # First-run: allow first user creation as admin
    role = UserRole.admin  # First user is always admin
    result = await db.execute(select(User).where(User.username == body.username))
    if result.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="Username already taken")

    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        role=role,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return {"ok": True, "username": user.username, "role": user.role.value}


@app.post("/auth/change-password", status_code=status.HTTP_200_OK, tags=["auth"])
async def change_password(
    body: ChangePasswordRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_async_session),
):
    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid current password")

    user.password_hash = hash_password(body.new_password)
    await db.flush()
    await db.commit()
    return {"ok": True}


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health", tags=["system"])
async def health():
    from app.core.session.manager import session_manager
    from app.core.events.bus import event_bus
    from app.hunt.loader import module_registry

    return {
        "status": "ok",
        "env": settings.app_env,
        "active_sessions": session_manager.active_count,
        "event_bus_depth": event_bus.qsize,
        "hunt_modules_loaded": len(module_registry.list_modules()),
    }


@app.get("/api/v1/system/status", tags=["system"])
async def system_status(db: AsyncSession = Depends(get_async_session)):
    from app.core.session.manager import session_manager
    from app.core.events.bus import event_bus
    from app.hunt.loader import module_registry
    from sqlalchemy import func, select as sa_select
    from app.core.db.models import Finding, Asset

    # Count findings
    finding_count = (await db.execute(sa_select(func.count(Finding.id)))).scalar() or 0
    asset_count = (await db.execute(sa_select(func.count(Asset.id)))).scalar() or 0

    # Session breakdown
    sessions_by_state: dict[str, int] = {}
    for ctx in session_manager.get_all():
        sessions_by_state[ctx.state] = sessions_by_state.get(ctx.state, 0) + 1

    return {
        "active_sessions": session_manager.active_count,
        "max_sessions": settings.max_sessions,
        "sessions_by_state": sessions_by_state,
        "event_bus_depth": event_bus.qsize,
        "event_bus_limit": settings.event_queue_max,
        "hunt_modules_loaded": len(module_registry.list_modules()),
        "total_assets": asset_count,
        "total_findings": finding_count,
    }


# ── API routers ───────────────────────────────────────────────────────────────

from app.api.assets import router as assets_router
from app.api.sessions import router as sessions_router
from app.api.hunts import router as hunts_router
from app.api.intelligence import router as intelligence_router
from app.api.admin import router as admin_router

app.include_router(assets_router, prefix="/api/v1")
app.include_router(sessions_router, prefix="/api/v1")
app.include_router(hunts_router, prefix="/api/v1")
app.include_router(intelligence_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")

# ── Socket.IO ASGI wrap ───────────────────────────────────────────────────────

_fastapi_app = app  # capture before 'app' is shadowed by package import

# Import handlers to register event handlers on sio
import app.transport.handlers  # noqa: F401, E402

from app.transport.socketio import create_asgi_app

# This is the ASGI app that uvicorn should serve
asgi_app = create_asgi_app(_fastapi_app)
