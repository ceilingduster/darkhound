from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class HuntStep:
    id: str
    description: str
    command: str
    timeout: int = 30
    requires_sudo: bool = False


@dataclass
class HuntModule:
    id: str
    name: str
    description: str
    os_types: list[str]
    tags: list[str]
    severity_hint: str
    steps: list[HuntStep] = field(default_factory=list)
