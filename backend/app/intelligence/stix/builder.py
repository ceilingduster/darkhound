from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.ai.schema import AiFinding


def _now_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def build_stix_bundle(finding: AiFinding) -> dict:
    """
    Construct a STIX 2.1 bundle dict from an AiFinding.
    Returns raw dict (validated separately by validator.py).
    """
    bundle_id = f"bundle--{uuid.uuid4()}"
    indicator_id = f"indicator--{uuid.uuid4()}"
    report_id = f"report--{uuid.uuid4()}"
    now = _now_str()

    objects = []

    # ── Indicator object ──────────────────────────────────────────────────────
    # Build pattern from indicators
    patterns = []
    for ioc in finding.indicators:
        if ioc.type == "ip":
            patterns.append(f"[ipv4-addr:value = '{ioc.value}']")
        elif ioc.type == "domain":
            patterns.append(f"[domain-name:value = '{ioc.value}']")
        elif ioc.type == "hash":
            h = ioc.value
            if len(h) == 32:
                patterns.append(f"[file:hashes.MD5 = '{h}']")
            elif len(h) == 40:
                patterns.append(f"[file:hashes.SHA-1 = '{h}']")
            elif len(h) == 64:
                patterns.append(f"[file:hashes.SHA-256 = '{h}']")
        elif ioc.type == "file_path":
            patterns.append(f"[file:name = '{ioc.value}']")

    pattern = " OR ".join(patterns) if patterns else "[ipv4-addr:value = '0.0.0.0']"

    indicator = {
        "type": "indicator",
        "spec_version": "2.1",
        "id": indicator_id,
        "created": now,
        "modified": now,
        "name": finding.title,
        "description": finding.description,
        "indicator_types": ["malicious-activity"],
        "pattern": pattern,
        "pattern_type": "stix",
        "valid_from": now,
        "confidence": int(finding.confidence * 100),
        "labels": finding.technique_ids,
    }
    objects.append(indicator)

    # ── Attack Pattern objects (per MITRE technique) ──────────────────────────
    attack_pattern_ids = []
    for technique_id in finding.technique_ids:
        ap_id = f"attack-pattern--{uuid.uuid4()}"
        attack_pattern_ids.append(ap_id)
        objects.append({
            "type": "attack-pattern",
            "spec_version": "2.1",
            "id": ap_id,
            "created": now,
            "modified": now,
            "name": technique_id,
            "external_references": [
                {
                    "source_name": "mitre-attack",
                    "external_id": technique_id,
                    "url": f"https://attack.mitre.org/techniques/{technique_id.replace('.', '/')}",
                }
            ],
        })

    # ── Relationships ─────────────────────────────────────────────────────────
    for ap_id in attack_pattern_ids:
        rel_id = f"relationship--{uuid.uuid4()}"
        objects.append({
            "type": "relationship",
            "spec_version": "2.1",
            "id": rel_id,
            "created": now,
            "modified": now,
            "relationship_type": "indicates",
            "source_ref": indicator_id,
            "target_ref": ap_id,
        })

    # ── Report object ─────────────────────────────────────────────────────────
    object_refs = [obj["id"] for obj in objects]
    report = {
        "type": "report",
        "spec_version": "2.1",
        "id": report_id,
        "created": now,
        "modified": now,
        "name": finding.title,
        "description": finding.description,
        "published": now,
        "report_types": ["threat-report"],
        "object_refs": object_refs,
        "confidence": int(finding.confidence * 100),
        "labels": [finding.severity],
    }
    objects.append(report)

    return {
        "type": "bundle",
        "id": bundle_id,
        "spec_version": "2.1",
        "objects": objects,
    }
