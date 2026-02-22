from __future__ import annotations

import hashlib
import re
from enum import Enum
from functools import lru_cache


class CommandClass(str, Enum):
    SAFE = "SAFE"
    SUSPECT = "SUSPECT"
    BLOCKED = "BLOCKED"


# Maximum command length (bytes) — prevents abuse via oversized payloads
MAX_COMMAND_LENGTH = 4096

# ── Blocklist patterns ────────────────────────────────────────────────────────

_BLOCKED_PATTERNS: list[re.Pattern] = [
    # Destructive filesystem
    re.compile(r"\brm\s+-[rRf]", re.IGNORECASE),
    re.compile(r"\bmkfs\b", re.IGNORECASE),
    re.compile(r"\bdd\b.*\bof=/dev/", re.IGNORECASE),
    re.compile(r"\bshred\b", re.IGNORECASE),
    re.compile(r"\btruncate\b.*\b/", re.IGNORECASE),
    # Privilege escalation bypass
    re.compile(r"chmod\s+[0-7]*7[0-7]*\s+/etc/sudoers", re.IGNORECASE),
    re.compile(r"chmod\s+[0-7]*7[0-7]*\s+/etc/shadow", re.IGNORECASE),
    re.compile(r"chmod\s+[0-7]*7[0-7]*\s+/etc/passwd", re.IGNORECASE),
    re.compile(r"visudo\b", re.IGNORECASE),
    # Data exfiltration via execution
    re.compile(r"\bcurl\b.*\|\s*bash\b", re.IGNORECASE),
    re.compile(r"\bwget\b.*\|\s*bash\b", re.IGNORECASE),
    re.compile(r"\bcurl\b.*\|\s*sh\b", re.IGNORECASE),
    re.compile(r"\bwget\b.*\|\s*sh\b", re.IGNORECASE),
    # Crypto miners
    re.compile(r"\bxmrig\b", re.IGNORECASE),
    re.compile(r"\bminerd\b", re.IGNORECASE),
    re.compile(r"stratum\+tcp://", re.IGNORECASE),
    # Kernel / system destruction
    re.compile(r"echo\s+[01]\s+>\s*/proc/sys/kernel/panic", re.IGNORECASE),
    re.compile(r"\bsysrq\b", re.IGNORECASE),
    # Fork bomb pattern
    re.compile(r":\(\)\s*\{.*:\|:&\s*\}", re.IGNORECASE),
    # Reverse shells
    re.compile(r"bash\s+-i\s+>(&|\|)\s*/dev/tcp/", re.IGNORECASE),
    re.compile(r"/dev/tcp/\d", re.IGNORECASE),
    re.compile(r"/dev/udp/\d", re.IGNORECASE),
    re.compile(r"\bpython[23]?\b.*\bsocket\b.*\bconnect\b", re.IGNORECASE),
    re.compile(r"\bperl\b.*\bsocket\b.*\bINET\b", re.IGNORECASE),
    re.compile(r"\bphp\b.*\bfsockopen\b", re.IGNORECASE),
    re.compile(r"\bruby\b.*\bTCPSocket\b", re.IGNORECASE),
    re.compile(r"\bnc\b.*-e\s+/bin/(ba)?sh", re.IGNORECASE),
    re.compile(r"\bncat\b.*-e\s+/bin/(ba)?sh", re.IGNORECASE),
    re.compile(r"\bsocat\b.*\bexec\b", re.IGNORECASE),
    # History / log tampering
    re.compile(r"\bhistory\s+-[cdw]", re.IGNORECASE),
    re.compile(r"\bunset\s+HISTFILE\b", re.IGNORECASE),
    re.compile(r"\bunset\s+HISTSIZE\b", re.IGNORECASE),
    re.compile(r"export\s+HISTSIZE=0\b", re.IGNORECASE),
    re.compile(r"export\s+HISTFILESIZE=0\b", re.IGNORECASE),
    re.compile(r">\s*/var/log/", re.IGNORECASE),
    re.compile(r"\btruncate\b.*\b/var/log/", re.IGNORECASE),
    re.compile(r"\brm\b.*\b/var/log/", re.IGNORECASE),
    # Kernel module loading (could be rootkit)
    re.compile(r"\binsmod\b", re.IGNORECASE),
    re.compile(r"\bmodprobe\b", re.IGNORECASE),
    # Disk wipe
    re.compile(r"\bwipefs\b", re.IGNORECASE),
    re.compile(r"\bsgdisk\b.*-Z", re.IGNORECASE),
]

_SUSPECT_PATTERNS: list[re.Pattern] = [
    re.compile(r"\bchmod\b", re.IGNORECASE),
    re.compile(r"\bchown\b", re.IGNORECASE),
    re.compile(r"\bpasswd\b", re.IGNORECASE),
    re.compile(r"\buseradd\b|\busermod\b|\buserdel\b", re.IGNORECASE),
    re.compile(r"\biptables\b|\bnftables\b|\bufw\b", re.IGNORECASE),
    re.compile(r"\bcrontab\s+-[er]\b", re.IGNORECASE),
    re.compile(r"\bsystemctl\s+(start|stop|disable|enable|mask)\b", re.IGNORECASE),
    re.compile(r"\bscp\b|\brsync\b", re.IGNORECASE),
    re.compile(r"\bnc\b|\bnetcat\b|\bncat\b", re.IGNORECASE),
    re.compile(r"\bkill\b|\bkillall\b|\bpkill\b", re.IGNORECASE),
    re.compile(r"\bmount\b|\bumount\b", re.IGNORECASE),
    re.compile(r"\bchattr\b", re.IGNORECASE),
    re.compile(r"\bsetenforce\b", re.IGNORECASE),
]

# Known-safe read-only / forensic commands prefix allowlist
_SAFE_PREFIXES: list[str] = [
    "ls", "cat", "less", "more", "head", "tail", "find", "locate",
    "grep", "awk", "sed", "sort", "uniq", "wc", "cut", "echo",
    "ps", "top", "htop", "lsof", "netstat", "ss", "ip", "ifconfig",
    "uname", "hostname", "id", "whoami", "w", "who", "last", "lastb",
    "history", "env", "printenv", "df", "du", "free", "uptime",
    "dmesg", "journalctl", "systemctl list", "systemctl status",
    "crontab -l", "stat", "file", "strings", "hexdump", "xxd",
    "md5sum", "sha256sum", "sha1sum", "ldd", "readelf", "objdump",
    "strace", "ltrace", "lsmod", "modinfo", "rpm", "dpkg", "apt list",
    "yum list", "pip list", "gem list", "docker ps", "docker inspect",
    "kubectl get", "kubectl describe",
    "getent", "timedatectl", "hostnamectl", "loginctl",
    "ausearch", "aureport",
    "pstree",
]


def _command_hash(command: str) -> str:
    return hashlib.sha256(command.encode()).hexdigest()


@lru_cache(maxsize=4096)
def classify_command(command: str) -> tuple[CommandClass, str]:
    """
    Returns (CommandClass, reason).
    Result is cached by command hash (via lru_cache on the string itself).
    """
    stripped = command.strip()

    # Length check
    if len(stripped) > MAX_COMMAND_LENGTH:
        return CommandClass.BLOCKED, f"Command exceeds maximum length ({MAX_COMMAND_LENGTH} bytes)"

    # Empty command
    if not stripped:
        return CommandClass.BLOCKED, "Empty command"

    # Blocklist check (fast path — regex)
    for pattern in _BLOCKED_PATTERNS:
        if pattern.search(stripped):
            return CommandClass.BLOCKED, f"Matched blocklist pattern: {pattern.pattern}"

    # Allowlist prefix check
    lower = stripped.lower()
    for prefix in _SAFE_PREFIXES:
        if lower.startswith(prefix):
            return CommandClass.SAFE, f"Matches safe prefix: {prefix}"

    # Suspect check
    for pattern in _SUSPECT_PATTERNS:
        if pattern.search(stripped):
            return CommandClass.SUSPECT, f"Matched suspect pattern: {pattern.pattern}"

    return CommandClass.SUSPECT, "Unknown command — requires analyst approval"


def is_command_allowed(command: str) -> bool:
    cls, _ = classify_command(command)
    return cls == CommandClass.SAFE


# ── Sudo Policy ──────────────────────────────────────────────────────────────

class SudoPolicy:
    """
    Determines whether and how sudo should be prepended to a hunt step command.

    sudo_method values (from Asset):
      - None          → never prepend sudo
      - "nopasswd"    → use ``sudo -n`` (non-interactive, fail if prompted)
      - "ssh_password" → use ``sudo -S`` (password piped via stdin)
      - "custom_password" → use ``sudo -S`` (password piped via stdin)
    """

    def __init__(self, sudo_method: str | None = None) -> None:
        self.sudo_method = sudo_method

    def wrap_command(self, command: str, requires_sudo: bool) -> str:
        """Wrap command with the appropriate sudo invocation."""
        if not requires_sudo:
            return command
        if self.sudo_method is None:
            return command
        if command.strip().startswith("sudo "):
            return command

        if self.sudo_method == "nopasswd":
            return f"sudo -n {command}"
        # "ssh_password" and "custom_password" both pipe via stdin
        return f"sudo -S {command}"
