from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ThreatIndicator(BaseModel):
    type: str  # ip, domain, hash, file_path, user, process
    value: str
    context: str = ""


class AiFinding(BaseModel):
    title: str
    severity: str  # critical, high, medium, low, info
    confidence: float = Field(ge=0.0, le=1.0)
    description: str
    technique_ids: list[str] = Field(default_factory=list)  # MITRE ATT&CK IDs
    indicators: list[ThreatIndicator] = Field(default_factory=list)
    remediation_steps: list[str] = Field(default_factory=list)
    raw_evidence: str = ""


class AiAnalysisResult(BaseModel):
    summary: str
    findings: list[AiFinding] = Field(default_factory=list)
    overall_risk: str = "low"  # critical, high, medium, low, info
