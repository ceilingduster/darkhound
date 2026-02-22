from __future__ import annotations

from pydantic import BaseModel


class EnrichmentResult(BaseModel):
    provider: str
    ioc_type: str
    ioc_value: str
    malicious: bool | None = None
    score: float | None = None  # 0.0 – 1.0
    tags: list[str] = []
    country: str | None = None
    asn: str | None = None
    isp: str | None = None
    last_seen: str | None = None
    raw: dict = {}
    error: str | None = None

    def summary(self) -> str:
        if self.error:
            return f"Error: {self.error}"
        parts = []
        if self.malicious is not None:
            parts.append("MALICIOUS" if self.malicious else "clean")
        if self.score is not None:
            parts.append(f"score={self.score:.2f}")
        if self.country:
            parts.append(f"country={self.country}")
        if self.asn:
            parts.append(f"ASN={self.asn}")
        if self.tags:
            parts.append(f"tags=[{','.join(self.tags[:3])}]")
        return "; ".join(parts) if parts else "no data"
