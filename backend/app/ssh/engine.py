from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass, field

import asyncssh

from app.config import settings
from app.core.db.models import SessionState
from app.core.events.emitter import emit_event
from app.core.events.schema import (
    SshConnecting,
    SshConnected,
    SshDisconnected,
    SshError,
)
from app.core.security.vault import get_asset_credentials
from app.core.session.manager import session_manager

logger = logging.getLogger(__name__)

SSH_CONNECT_TIMEOUT = 30
SSH_KEEPALIVE_INTERVAL = 30
SSH_MAX_OUTPUT_BUFFER = 64 * 1024  # 64 KB
SSH_RECONNECT_MAX_ATTEMPTS = 3
SSH_RECONNECT_BASE_DELAY = 2  # seconds


class SshConnectionError(Exception):
    pass


import re as _re

_SUDO_PROMPT_RE = _re.compile(r"^\[sudo\] password for \S+:\s*", _re.MULTILINE)


def _strip_sudo_prompt(stderr: str) -> str:
    """Remove the '[sudo] password for user:' line from stderr."""
    return _SUDO_PROMPT_RE.sub("", stderr).lstrip("\n")


@dataclass
class SshConnection:
    """
    Wraps an asyncssh SSHClientConnection for a single session.
    Manages connection lifecycle, reconnect, and PTY channel.
    """
    session_id: str
    asset_id: str
    host: str
    port: int = 22
    username: str = "root"

    _conn: asyncssh.SSHClientConnection | None = field(default=None, repr=False, compare=False)
    _pty_channel: asyncssh.SSHClientProcess | None = field(default=None, repr=False, compare=False)
    _retry_count: int = field(default=0, repr=False, compare=False)
    _max_retries: int = field(default=3, repr=False, compare=False)
    _output_buffer: bytearray = field(default_factory=bytearray, repr=False, compare=False)
    _credentials: dict = field(default_factory=dict, repr=False, compare=False)
    _reconnect_task: asyncio.Task | None = field(default=None, repr=False, compare=False)
    _closed: bool = field(default=False, repr=False, compare=False)

    async def connect(self, credentials: dict) -> None:
        self._credentials = credentials
        await emit_event(SshConnecting(session_id=self.session_id, target_host=self.host))
        await session_manager.transition(self.session_id, SessionState.CONNECTING.value)

        connect_kwargs: dict = {
            "host": self.host,
            "port": self.port,
            "username": credentials.get("username", self.username),
            "connect_timeout": SSH_CONNECT_TIMEOUT,
            "keepalive_interval": SSH_KEEPALIVE_INTERVAL,
            "known_hosts": None,  # TOFU handled at application layer
        }

        if "ssh_key" in credentials:
            connect_kwargs["client_keys"] = [asyncssh.import_private_key(credentials["ssh_key"])]
        elif "ssh_password" in credentials:
            connect_kwargs["password"] = credentials["ssh_password"]

        try:
            self._conn = await asyncssh.connect(**connect_kwargs)
            fingerprint = self._get_fingerprint()
            logger.info("SSH connected: session=%s host=%s fp=%s", self.session_id, self.host, fingerprint)

            await session_manager.transition(self.session_id, SessionState.CONNECTED.value)
            await emit_event(SshConnected(session_id=self.session_id, server_fingerprint=fingerprint))
            self._retry_count = 0

        except (asyncssh.DisconnectError, asyncssh.ConnectionLost, OSError) as exc:
            self._retry_count += 1
            error_msg = str(exc)
            logger.error("SSH connect failed: session=%s error=%s retry=%d", self.session_id, error_msg, self._retry_count)
            await emit_event(SshError(session_id=self.session_id, error_code="CONNECT_FAILED", message=error_msg))
            await session_manager.transition(self.session_id, SessionState.FAILED.value, reason=error_msg)
            raise SshConnectionError(error_msg) from exc

        except Exception as exc:
            # Catch auth failures (PermissionDenied, KeyExchangeFailed, etc.)
            # and any other unexpected errors so the session never hangs.
            error_msg = str(exc)
            logger.error("SSH connect failed: session=%s error=%s", self.session_id, error_msg)
            await emit_event(SshError(session_id=self.session_id, error_code="CONNECT_FAILED", message=error_msg))
            await session_manager.transition(self.session_id, SessionState.FAILED.value, reason=error_msg)
            raise SshConnectionError(error_msg) from exc

    def _get_fingerprint(self) -> str:
        if self._conn is None:
            return "unknown"
        try:
            host_key = self._conn.get_server_host_key()
            return host_key.get_fingerprint() if host_key else "unknown"
        except Exception:
            return "unknown"

    async def run_command(
        self,
        command: str,
        timeout: int = 30,
        sudo_password: str | None = None,
    ) -> tuple[str, str, int]:
        """
        Execute a command non-interactively.
        If sudo_password is provided the command is expected to start with
        ``sudo -S`` and the password is piped via stdin.
        Returns (stdout, stderr, exit_code).
        """
        if self._conn is None:
            raise SshConnectionError("Not connected")

        try:
            if sudo_password is not None:
                result = await asyncio.wait_for(
                    self._conn.run(
                        command,
                        check=False,
                        input=sudo_password + "\n",
                    ),
                    timeout=timeout,
                )
            else:
                result = await asyncio.wait_for(
                    self._conn.run(command, check=False),
                    timeout=timeout,
                )
            stdout = result.stdout or ""
            stderr = result.stderr or ""
            exit_code = result.returncode or 0
            # Strip the sudo password prompt from stderr so it doesn't
            # pollute hunt observations or logs
            if sudo_password is not None:
                stderr = _strip_sudo_prompt(stderr)
            return stdout, stderr, exit_code
        except asyncio.TimeoutError:
            return "", f"Command timed out after {timeout}s", -1
        except asyncssh.DisconnectError as exc:
            raise SshConnectionError(str(exc)) from exc

    async def open_pty(
        self,
        cols: int = 80,
        rows: int = 24,
        data_callback=None,
    ) -> asyncssh.SSHClientProcess:
        """Open an interactive PTY channel."""
        if self._conn is None:
            raise SshConnectionError("Not connected")
        if self._pty_channel is not None:
            raise RuntimeError("PTY already open")

        process = await self._conn.create_process(
            request_pty="force",
            term_type="xterm-256color",
            term_size=(cols, rows),
            encoding=None,
        )
        self._pty_channel = process

        if data_callback:
            asyncio.create_task(self._read_pty(data_callback))

        return process

    async def _read_pty(self, callback) -> None:
        """Background task to read PTY output and invoke callback."""
        if self._pty_channel is None:
            return
        try:
            while True:
                chunk = await self._pty_channel.stdout.read(1024)
                if not chunk:
                    break
                if isinstance(chunk, str):
                    chunk = chunk.encode()
                # Rolling buffer
                self._output_buffer.extend(chunk)
                if len(self._output_buffer) > SSH_MAX_OUTPUT_BUFFER:
                    self._output_buffer = self._output_buffer[-SSH_MAX_OUTPUT_BUFFER:]
                await callback(chunk)
        except asyncssh.DisconnectError:
            pass

    async def write_pty(self, data: bytes) -> None:
        if self._pty_channel is None:
            raise RuntimeError("No PTY channel open")
        if isinstance(data, str):
            data = data.encode()
        self._pty_channel.stdin.write(data)

    async def resize_pty(self, cols: int, rows: int) -> None:
        if self._pty_channel is None:
            return
        self._pty_channel.change_terminal_size(cols, rows)

    async def close_pty(self, reason: str = "") -> None:
        if self._pty_channel is not None:
            self._pty_channel.close()
            self._pty_channel = None
        logger.info("PTY closed: session=%s reason=%s", self.session_id, reason)

    def close(self) -> None:
        self._closed = True
        if self._reconnect_task is not None:
            self._reconnect_task.cancel()
            self._reconnect_task = None
        if self._pty_channel is not None:
            try:
                self._pty_channel.close()
            except Exception:
                pass
        if self._conn is not None:
            try:
                self._conn.close()
            except Exception:
                pass
        self._conn = None
        self._pty_channel = None

    @property
    def is_connected(self) -> bool:
        return self._conn is not None and not self._conn.is_closed()

    async def _handle_disconnect(self) -> None:
        """Called when SSH connection drops unexpectedly. Attempts reconnection."""
        if self._closed:
            return

        await emit_event(SshDisconnected(session_id=self.session_id, reason="connection lost"))

        try:
            await session_manager.transition(
                self.session_id, SessionState.DISCONNECTED.value, reason="ssh connection lost"
            )
        except Exception:
            return

        for attempt in range(1, SSH_RECONNECT_MAX_ATTEMPTS + 1):
            delay = SSH_RECONNECT_BASE_DELAY * (2 ** (attempt - 1))
            logger.info(
                "SSH reconnect attempt %d/%d for session %s in %ds",
                attempt, SSH_RECONNECT_MAX_ATTEMPTS, self.session_id, delay,
            )
            await asyncio.sleep(delay)

            if self._closed:
                return

            try:
                await emit_event(SshConnecting(session_id=self.session_id, target_host=self.host))
                await session_manager.transition(
                    self.session_id, SessionState.CONNECTING.value, reason="reconnecting"
                )

                self._conn = await asyncssh.connect(
                    host=self.host,
                    port=self.port,
                    username=self._credentials.get("username", self.username),
                    connect_timeout=SSH_CONNECT_TIMEOUT,
                    keepalive_interval=SSH_KEEPALIVE_INTERVAL,
                    known_hosts=None,
                    **({"client_keys": [asyncssh.import_private_key(self._credentials["ssh_key"])]} if "ssh_key" in self._credentials else {}),
                    **({"password": self._credentials["ssh_password"]} if "ssh_password" in self._credentials else {}),
                )

                fingerprint = self._get_fingerprint()
                await session_manager.transition(
                    self.session_id, SessionState.CONNECTED.value, reason="reconnected"
                )
                await emit_event(SshConnected(session_id=self.session_id, server_fingerprint=fingerprint))
                await session_manager.transition(
                    self.session_id, SessionState.RUNNING.value, reason="reconnected"
                )
                logger.info("SSH reconnected: session=%s attempt=%d", self.session_id, attempt)
                return

            except (asyncssh.DisconnectError, asyncssh.ConnectionLost, OSError) as exc:
                logger.warning("SSH reconnect attempt %d failed: %s", attempt, exc)
                await emit_event(SshError(
                    session_id=self.session_id, error_code="RECONNECT_FAILED", message=str(exc)
                ))

        # All reconnect attempts exhausted
        logger.error("SSH reconnect failed after %d attempts for session %s", SSH_RECONNECT_MAX_ATTEMPTS, self.session_id)
        try:
            await session_manager.transition(
                self.session_id, SessionState.FAILED.value, reason="reconnect attempts exhausted"
            )
        except Exception:
            pass

    def start_connection_monitor(self) -> None:
        """Start a background task that monitors connection health."""
        if self._reconnect_task is not None:
            return

        async def _monitor():
            while not self._closed:
                await asyncio.sleep(5)
                if self._conn is not None and self._conn.is_closed() and not self._closed:
                    logger.warning("SSH connection lost detected for session %s", self.session_id)
                    await self._handle_disconnect()
                    break  # Reconnect handles its own lifecycle

        self._reconnect_task = asyncio.create_task(_monitor(), name=f"ssh-monitor-{self.session_id}")


async def create_ssh_connection(
    session_id: str,
    asset_id: str,
    host: str,
    port: int = 22,
    vault_path: str | None = None,
    asset=None,
) -> SshConnection:
    """
    Factory: build SshConnection, resolve credentials, connect.
    Injects the connection handle into the session context.
    """
    credentials = get_asset_credentials(asset_id, vault_path, asset=asset)
    conn = SshConnection(
        session_id=session_id,
        asset_id=asset_id,
        host=host,
        port=port,
        username=credentials.get("username", "root"),
    )
    await conn.connect(credentials)

    ctx = session_manager.get(session_id)
    if ctx is not None:
        ctx.ssh_connection = conn

    # Start background connection health monitor
    conn.start_connection_monitor()

    return conn
