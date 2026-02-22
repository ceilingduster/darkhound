from __future__ import annotations

from app.core.db.models import SessionState


class InvalidTransitionError(Exception):
    """Raised when a session FSM transition is invalid."""


# Allowed transitions: from_state -> set of valid to_states
_TRANSITIONS: dict[SessionState, set[SessionState]] = {
    SessionState.INITIALIZING: {SessionState.CONNECTING},
    SessionState.CONNECTING: {SessionState.CONNECTED, SessionState.FAILED},
    SessionState.CONNECTED: {SessionState.RUNNING, SessionState.TERMINATED},
    SessionState.RUNNING: {
        SessionState.PAUSED,
        SessionState.LOCKED,
        SessionState.DISCONNECTED,
        SessionState.TERMINATED,
    },
    SessionState.PAUSED: {SessionState.RUNNING, SessionState.DISCONNECTED, SessionState.TERMINATED},
    SessionState.LOCKED: {SessionState.RUNNING, SessionState.DISCONNECTED, SessionState.TERMINATED},
    SessionState.DISCONNECTED: {SessionState.CONNECTING, SessionState.TERMINATED},
    SessionState.FAILED: set(),       # terminal
    SessionState.TERMINATED: set(),   # terminal
}

# Any state can transition to TERMINATED via destroy
_DESTROY_ALLOWED = {
    SessionState.INITIALIZING,
    SessionState.CONNECTING,
    SessionState.CONNECTED,
    SessionState.RUNNING,
    SessionState.PAUSED,
    SessionState.LOCKED,
    SessionState.DISCONNECTED,
}


def validate_transition(from_state: SessionState, to_state: SessionState) -> None:
    """
    Raise InvalidTransitionError if the transition is not allowed.
    """
    if to_state == SessionState.TERMINATED and from_state in _DESTROY_ALLOWED:
        return
    allowed = _TRANSITIONS.get(from_state, set())
    if to_state not in allowed:
        raise InvalidTransitionError(
            f"Invalid session state transition: {from_state} → {to_state}"
        )
