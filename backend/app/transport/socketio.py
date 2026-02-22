from __future__ import annotations

import logging

import socketio

from app.config import settings
from app.core.events.emitter import init_emitter

logger = logging.getLogger(__name__)

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=settings.cors_origin_list or "*",
    logger=False,
    engineio_logger=False,
)

# Inject sio into emitter so it can route events
init_emitter(sio)


def create_asgi_app(fastapi_app):
    """Wrap FastAPI app with Socket.IO ASGI mount."""
    return socketio.ASGIApp(sio, other_asgi_app=fastapi_app)
