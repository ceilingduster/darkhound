from __future__ import annotations

import json
import logging

logger = logging.getLogger(__name__)


class StixValidationError(Exception):
    pass


def validate_bundle(bundle: dict) -> None:
    """
    Validate a STIX 2.1 bundle dict.

    Uses the stix2 library for full validation.
    Raises StixValidationError on failure.
    """
    if bundle.get("type") != "bundle":
        raise StixValidationError("Bundle must have type='bundle'")

    if bundle.get("spec_version") != "2.1":
        raise StixValidationError("Bundle must have spec_version='2.1'")

    if not isinstance(bundle.get("objects"), list):
        raise StixValidationError("Bundle must have 'objects' list")

    try:
        import stix2
        bundle_str = json.dumps(bundle)
        stix2.parse(bundle_str, allow_custom=True)
        logger.debug("STIX bundle validated: %s", bundle.get("id"))
    except ImportError:
        logger.warning("stix2 library not available — skipping deep validation")
    except Exception as exc:
        raise StixValidationError(f"STIX validation failed: {exc}") from exc
