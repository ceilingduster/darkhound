from __future__ import annotations

import logging
import re

from .executor import execute_command

logger = logging.getLogger(__name__)


async def detect_os(session_id: str) -> dict:
    """
    Run a fingerprinting pipeline to determine OS type and version.
    Returns dict: { os_type, os_version, platform_metadata }
    """
    result = {
        "os_type": "unknown",
        "os_version": None,
        "platform_metadata": {},
    }

    # Step 1: uname
    try:
        stdout, _, exit_code = await execute_command(session_id, "uname -a", timeout=10)
        if exit_code == 0 and stdout:
            result["platform_metadata"]["uname"] = stdout.strip()
            uname_lower = stdout.lower()

            if "linux" in uname_lower:
                result["os_type"] = "linux"
            elif "darwin" in uname_lower:
                result["os_type"] = "macos"
            elif "freebsd" in uname_lower or "bsd" in uname_lower:
                result["os_type"] = "linux"  # treat as linux-like

    except Exception as exc:
        logger.warning("OS detect uname failed: %s", exc)

    # Step 2: /etc/os-release (Linux only)
    if result["os_type"] == "linux":
        try:
            stdout, _, exit_code = await execute_command(
                session_id, "cat /etc/os-release 2>/dev/null", timeout=10
            )
            if exit_code == 0 and stdout:
                parsed = _parse_os_release(stdout)
                result["platform_metadata"].update(parsed)
                if "PRETTY_NAME" in parsed:
                    result["os_version"] = parsed["PRETTY_NAME"]
                elif "VERSION_ID" in parsed:
                    result["os_version"] = f"{parsed.get('ID', 'linux')} {parsed['VERSION_ID']}"
        except Exception as exc:
            logger.warning("OS detect /etc/os-release failed: %s", exc)

    # Step 3: architecture
    try:
        stdout, _, _ = await execute_command(session_id, "uname -m", timeout=5)
        if stdout.strip():
            result["platform_metadata"]["arch"] = stdout.strip()
    except Exception:
        pass

    # Step 4: kernel version
    try:
        stdout, _, _ = await execute_command(session_id, "uname -r", timeout=5)
        if stdout.strip():
            result["platform_metadata"]["kernel"] = stdout.strip()
    except Exception:
        pass

    logger.info("OS detected for session %s: %s %s", session_id, result["os_type"], result["os_version"])
    return result


def _parse_os_release(content: str) -> dict:
    """Parse /etc/os-release key=value pairs."""
    data = {}
    for line in content.splitlines():
        line = line.strip()
        if "=" not in line or line.startswith("#"):
            continue
        key, _, value = line.partition("=")
        data[key.strip()] = value.strip().strip('"')
    return data
