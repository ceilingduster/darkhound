from __future__ import annotations


def normalize_confidence(raw_confidence: float | str) -> float:
    """
    Normalize a confidence value to the [0.0, 1.0] range.

    Accepts:
    - float already in [0.0, 1.0]
    - float in [0, 100] (percentage) — divided by 100
    - string like "high", "medium", "low"
    """
    if isinstance(raw_confidence, str):
        mapping = {
            "critical": 0.95,
            "very_high": 0.90,
            "high": 0.80,
            "medium": 0.60,
            "moderate": 0.60,
            "low": 0.35,
            "very_low": 0.15,
            "info": 0.50,
        }
        return mapping.get(raw_confidence.lower(), 0.50)

    try:
        val = float(raw_confidence)
    except (TypeError, ValueError):
        return 0.50

    if val > 1.0:
        val = val / 100.0

    return max(0.0, min(1.0, val))


def severity_to_confidence_floor(severity: str) -> float:
    """Return minimum confidence floor for a given severity level."""
    floors = {
        "critical": 0.80,
        "high": 0.65,
        "medium": 0.45,
        "low": 0.25,
        "info": 0.10,
    }
    return floors.get(severity.lower(), 0.25)
