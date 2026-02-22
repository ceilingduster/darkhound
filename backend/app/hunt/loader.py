from __future__ import annotations

import logging
import os
import re
from pathlib import Path

import yaml

from .models import HuntModule, HuntStep

logger = logging.getLogger(__name__)

HUNT_MODULES_PATH = os.environ.get("HUNT_MODULES_PATH", str(Path(__file__).parent.parent.parent.parent / "hunt_modules"))

# Regex to detect shell metacharacters in step command definitions
_SHELL_META = re.compile(r"[;&|`$(){}!]")


def _parse_frontmatter(content: str) -> tuple[dict, str]:
    """Split YAML frontmatter from body."""
    if not content.startswith("---"):
        return {}, content
    parts = content.split("---", 2)
    if len(parts) < 3:
        return {}, content
    fm = yaml.safe_load(parts[1]) or {}
    return fm, parts[2]


def _parse_steps(body: str) -> list[HuntStep]:
    """
    Parse step blocks from markdown body.
    Format:
    ### step_id
    **description**: ...
    **command**: `cmd`
    **timeout**: N
    **requires_sudo**: true/false
    """
    steps: list[HuntStep] = []
    # Split on ### headings
    raw_steps = re.split(r"\n###\s+", body)

    for block in raw_steps[1:]:  # skip preamble before first ###
        lines = block.strip().splitlines()
        if not lines:
            continue

        step_id = lines[0].strip()
        attrs: dict = {}

        for line in lines[1:]:
            m = re.match(r"\*\*(\w+)\*\*:\s*(.*)", line.strip())
            if m:
                key, val = m.group(1).lower(), m.group(2).strip()
                # Strip backtick code spans
                val = val.strip("`").strip()
                attrs[key] = val

        command = attrs.get("command", "")
        if not command:
            logger.warning("Hunt step %s has no command — skipping", step_id)
            continue

        # Validate: no shell metacharacters in step definition
        if _SHELL_META.search(command) and not _is_safe_shell_construct(command):
            logger.warning("Hunt step %s command contains potential metacharacters: %s", step_id, command)

        try:
            timeout = int(attrs.get("timeout", 30))
        except (ValueError, TypeError):
            timeout = 30

        requires_sudo_raw = attrs.get("requires_sudo", "false")
        requires_sudo = str(requires_sudo_raw).lower() in ("true", "yes", "1")

        steps.append(
            HuntStep(
                id=step_id,
                description=attrs.get("description", step_id),
                command=command,
                timeout=timeout,
                requires_sudo=requires_sudo,
            )
        )

    return steps


def _is_safe_shell_construct(cmd: str) -> bool:
    """Allow certain controlled constructs like 2>/dev/null redirects."""
    safe_patterns = [
        r"2>/dev/null",
        r"\|\s*sort",
        r"\|\s*grep",
        r"\|\s*awk",
        r"\|\s*head",
        r"\|\s*tail",
        r"\|\s*wc",
        r";.*2>/dev/null",
    ]
    for p in safe_patterns:
        if re.search(p, cmd):
            return True
    return False


def load_module(path: Path) -> HuntModule | None:
    try:
        content = path.read_text(encoding="utf-8")
        fm, body = _parse_frontmatter(content)

        module = HuntModule(
            id=fm.get("id", path.stem),
            name=fm.get("name", path.stem),
            description=fm.get("description", ""),
            os_types=fm.get("os_types", ["linux"]),
            tags=fm.get("tags", []),
            severity_hint=fm.get("severity_hint", "medium"),
            steps=_parse_steps(body),
        )
        logger.info("Loaded hunt module: %s (%d steps)", module.id, len(module.steps))
        return module
    except Exception as exc:
        logger.error("Failed to load hunt module %s: %s", path, exc)
        return None


class HuntModuleRegistry:
    def __init__(self) -> None:
        self._modules: dict[str, HuntModule] = {}
        self._directory: str = HUNT_MODULES_PATH
        self._dir_mtime: float = 0.0
        self._file_mtimes: dict[str, float] = {}

    def load_all(self, directory: str | None = None) -> None:
        self._directory = directory or HUNT_MODULES_PATH
        self._do_load()

    def _do_load(self) -> None:
        path = Path(self._directory)
        if not path.exists():
            logger.warning("Hunt modules directory not found: %s", self._directory)
            return

        self._modules.clear()
        self._file_mtimes.clear()
        for md_file in sorted(path.glob("*.md")):
            module = load_module(md_file)
            if module:
                self._modules[module.id] = module
                self._file_mtimes[str(md_file)] = md_file.stat().st_mtime

        self._dir_mtime = path.stat().st_mtime
        logger.info("Hunt module registry loaded: %d modules", len(self._modules))

    def _check_reload(self) -> None:
        """Auto-reload when directory contents or files have changed on disk."""
        path = Path(self._directory)
        if not path.exists():
            return

        # Fast check: directory mtime changes when files are added/removed/renamed
        try:
            current_dir_mtime = path.stat().st_mtime
        except OSError:
            return

        if current_dir_mtime != self._dir_mtime:
            logger.info("Hunt modules directory changed — reloading")
            self._do_load()
            return

        # Slower check: individual file mtimes for in-place edits
        for filepath, mtime in self._file_mtimes.items():
            try:
                if Path(filepath).stat().st_mtime != mtime:
                    logger.info("Hunt module file changed (%s) — reloading", filepath)
                    self._do_load()
                    return
            except OSError:
                # File deleted — directory mtime should have caught this,
                # but reload to be safe
                logger.info("Hunt module file removed (%s) — reloading", filepath)
                self._do_load()
                return

    def get(self, module_id: str) -> HuntModule | None:
        self._check_reload()
        return self._modules.get(module_id)

    def list_modules(self) -> list[HuntModule]:
        self._check_reload()
        return list(self._modules.values())

    def reload(self) -> None:
        self._do_load()


module_registry = HuntModuleRegistry()


def serialize_module(module: HuntModule) -> str:
    """Convert a HuntModule back to markdown with YAML frontmatter."""
    fm = {
        "id": module.id,
        "name": module.name,
        "description": module.description,
        "os_types": module.os_types,
        "tags": module.tags,
        "severity_hint": module.severity_hint,
    }
    lines = ["---", yaml.dump(fm, default_flow_style=None, sort_keys=False).strip(), "---", "", "## Steps"]
    for step in module.steps:
        lines.append("")
        lines.append(f"### {step.id}")
        lines.append(f"**description**: {step.description}")
        lines.append(f"**command**: `{step.command}`")
        lines.append(f"**timeout**: {step.timeout}")
        lines.append(f"**requires_sudo**: {'true' if step.requires_sudo else 'false'}")
    lines.append("")
    return "\n".join(lines)
