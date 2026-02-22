from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)


class ReasoningState(str, Enum):
    ANALYZING = "analyzing"
    CONCLUDING = "concluding"
    GENERATING = "generating"


@dataclass
class ReasoningAssembler:
    """
    Accumulates streaming chunks from Claude API into a coherent response.
    Tracks state transitions based on content heuristics.
    """
    _chunks: list[str] = field(default_factory=list)
    _state: ReasoningState = ReasoningState.ANALYZING

    def add_chunk(self, chunk: str) -> ReasoningState:
        """Add a streamed chunk and return current reasoning state."""
        self._chunks.append(chunk)
        assembled = self.assembled_text

        # Heuristic state transitions
        if self._state == ReasoningState.ANALYZING:
            # Look for concluding markers
            if any(marker in assembled.lower() for marker in [
                "## remediation", "remediation summary",
                "in conclusion", "to summarize", "based on the evidence",
                "findings:", "## findings", "the following indicators",
                "## key findings", "## risk assessment",
            ]):
                self._state = ReasoningState.CONCLUDING
        elif self._state == ReasoningState.CONCLUDING:
            # Look for generation markers (JSON/structured output start)
            if "```json" in assembled or '"findings"' in assembled:
                self._state = ReasoningState.GENERATING

        return self._state

    @property
    def assembled_text(self) -> str:
        return "".join(self._chunks)

    @property
    def state(self) -> ReasoningState:
        return self._state

    def reset(self) -> None:
        self._chunks.clear()
        self._state = ReasoningState.ANALYZING

    def extract_json_block(self) -> str | None:
        """Extract the last JSON code block from assembled text.

        Uses the *last* ```json fence so the markdown report's own
        code blocks don't get picked up by mistake.
        """
        text = self.assembled_text
        start = text.rfind("```json")
        if start == -1:
            # Try bare JSON — find the last top-level { … }
            start = text.rfind('{"')
            if start == -1:
                start = text.rfind("{\n")
            end = text.rfind("}")
            if start != -1 and end != -1 and end > start:
                return text[start:end + 1]
            return None

        start += 7  # len("```json")
        end = text.find("```", start)
        if end == -1:
            # Fence was never closed — likely truncated by token limit
            raw = text[start:].strip()
            return self._repair_truncated_json(raw)
        return text[start:end].strip()

    @staticmethod
    def _repair_truncated_json(raw: str) -> str:
        """Best-effort repair of JSON truncated by token limits."""
        # Close any unclosed string
        if raw.count('"') % 2 != 0:
            raw += '"'

        # Close arrays / objects
        open_braces = raw.count("{") - raw.count("}")
        open_brackets = raw.count("[") - raw.count("]")
        # Strip trailing comma if present
        raw = raw.rstrip().rstrip(",")
        raw += "]" * max(open_brackets, 0)
        raw += "}" * max(open_braces, 0)
        return raw


_SEVERITY_VALUES = {"critical", "high", "medium", "low", "info"}


def extract_findings_from_markdown(text: str) -> list[dict]:
    """Fallback parser: extract findings from the markdown report when JSON is missing/malformed.

    Looks for ``### [Finding Title]`` sections and pulls out labelled fields
    (Severity, Confidence, MITRE ATT&CK, Description, Remediation).
    """
    findings: list[dict] = []

    # Split on ### headings (level 3)
    sections = re.split(r"\n###\s+", text)
    for section in sections[1:]:  # skip preamble before first ###
        lines = section.strip().splitlines()
        if not lines:
            continue

        title = lines[0].strip().strip("#").strip()
        # Skip non-finding headings
        if title.lower() in ("remediation summary", "risk assessment", "executive summary"):
            continue

        body = "\n".join(lines[1:])

        severity = _extract_field(body, "Severity")
        if severity:
            severity = severity.lower().strip()
        if severity not in _SEVERITY_VALUES:
            severity = "medium"

        confidence_raw = _extract_field(body, "Confidence")
        confidence = _parse_confidence(confidence_raw)

        technique_ids: list[str] = []
        mitre_raw = _extract_field(body, "MITRE ATT&CK")
        if mitre_raw:
            technique_ids = re.findall(r"T\d{4}(?:\.\d{3})?", mitre_raw)

        description = _extract_field(body, "Description") or title
        remediation_raw = _extract_field(body, "Remediation") or ""
        remediation_steps = [s.strip().lstrip("- ").lstrip("* ") for s in remediation_raw.splitlines() if s.strip()]
        if not remediation_steps and remediation_raw.strip():
            remediation_steps = [remediation_raw.strip()]

        findings.append({
            "title": title,
            "severity": severity,
            "confidence": confidence,
            "description": description,
            "technique_ids": technique_ids,
            "indicators": [],
            "remediation_steps": remediation_steps,
            "raw_evidence": "",
        })

    return findings


def _extract_field(body: str, label: str) -> str | None:
    """Extract the value after ``**Label**: value`` or ``**Label:** value``."""
    pattern = rf"\*\*{re.escape(label)}\*\*\s*:\s*(.+)"
    m = re.search(pattern, body, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return None


def _parse_confidence(raw: str | None) -> float:
    """Convert a confidence string like '85%' or '0.85' to a float 0.0–1.0."""
    if not raw:
        return 0.5
    raw = raw.strip().rstrip("%")
    try:
        val = float(raw)
        if val > 1.0:
            val = val / 100.0
        return max(0.0, min(1.0, val))
    except ValueError:
        return 0.5
