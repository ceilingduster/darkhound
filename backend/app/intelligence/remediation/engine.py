from __future__ import annotations

from app.ai.schema import AiFinding


def structure_remediation(finding: AiFinding) -> dict:
    """
    Convert AiFinding remediation steps into a structured remediation guidance dict.
    """
    steps = finding.remediation_steps or []

    # Classify steps into categories
    immediate = []
    short_term = []
    long_term = []

    keywords_immediate = ["remove", "delete", "kill", "disable", "revoke", "block", "stop"]
    keywords_long = ["implement", "deploy", "configure", "monitor", "review policy", "audit"]

    for step in steps:
        lower = step.lower()
        if any(kw in lower for kw in keywords_immediate):
            immediate.append(step)
        elif any(kw in lower for kw in keywords_long):
            long_term.append(step)
        else:
            short_term.append(step)

    return {
        "immediate_actions": immediate,
        "short_term_actions": short_term,
        "long_term_actions": long_term,
        "all_steps": steps,
        "technique_references": finding.technique_ids,
        "severity": finding.severity,
    }
