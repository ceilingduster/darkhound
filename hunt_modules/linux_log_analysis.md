---
id: linux_log_analysis
name: Linux Log Analysis
description: Review system logs for signs of compromise — auth failures, service anomalies, and audit trail gaps
os_types: [linux]
tags: [logs, T1070, T1562, detection]
severity_hint: medium
---

## Steps

### check_auth_log
**description**: Review recent authentication events
**command**: `tail -100 /var/log/auth.log 2>/dev/null || tail -100 /var/log/secure 2>/dev/null`
**timeout**: 10
**requires_sudo**: true

### check_syslog_errors
**description**: Look for recent errors and warnings in syslog
**command**: `journalctl -p err -n 50 --no-pager 2>/dev/null || tail -100 /var/log/syslog 2>/dev/null | grep -iE "error|fail|denied|reject"`
**timeout**: 15
**requires_sudo**: true

### check_log_gaps
**description**: Check for suspicious gaps or truncated log files
**command**: `ls -la /var/log/ 2>/dev/null; find /var/log -empty -type f 2>/dev/null`
**timeout**: 10
**requires_sudo**: true

### check_log_tampering
**description**: Look for signs of log tampering — zero-byte logs, recent modification of old logs
**command**: `find /var/log -name "*.log" -size 0 2>/dev/null; stat /var/log/wtmp /var/log/btmp /var/log/lastlog 2>/dev/null`
**timeout**: 10
**requires_sudo**: true

### check_kernel_messages
**description**: Review kernel ring buffer for hardware/driver anomalies
**command**: `dmesg --level=err,warn 2>/dev/null | tail -30`
**timeout**: 10
**requires_sudo**: true

### check_audit_log
**description**: Review Linux audit log for security-relevant events
**command**: `ausearch -m execve -ts recent 2>/dev/null | tail -50 || tail -50 /var/log/audit/audit.log 2>/dev/null`
**timeout**: 15
**requires_sudo**: true

### check_journal_boots
**description**: List recent boot entries to detect unexpected reboots
**command**: `journalctl --list-boots 2>/dev/null | tail -10`
**timeout**: 10
**requires_sudo**: false
