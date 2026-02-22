---
id: linux_users
name: Linux User & Authentication Hunting
description: Detect unauthorized accounts, privilege escalation, and authentication anomalies
os_types: [linux]
tags: [credential-access, T1078, T1136, T1098, T1087, privilege-escalation]
severity_hint: high
---

## Steps

### check_passwd_file
**description**: Enumerate all system accounts from /etc/passwd
**command**: `cat /etc/passwd 2>/dev/null`
**timeout**: 5
**requires_sudo**: false

### check_uid_zero_accounts
**description**: Find all accounts with UID 0 (root equivalent)
**command**: `awk -F: '($3=="0"){print}' /etc/passwd 2>/dev/null`
**timeout**: 5
**requires_sudo**: false

### check_sudo_config
**description**: Review sudoers configuration for dangerous rules
**command**: `cat /etc/sudoers 2>/dev/null; ls -la /etc/sudoers.d/ 2>/dev/null`
**timeout**: 10
**requires_sudo**: false

### check_sudo_group
**description**: List members of sudo and wheel groups
**command**: `getent group sudo wheel admin 2>/dev/null`
**timeout**: 5
**requires_sudo**: false

### check_login_history
**description**: Review successful login history
**command**: `last -n 50 2>/dev/null`
**timeout**: 10
**requires_sudo**: false

### check_failed_logins
**description**: Review failed authentication attempts
**command**: `lastb -n 50 2>/dev/null || journalctl _SYSTEMD_UNIT=sshd.service -n 50 --no-pager 2>/dev/null | grep "Failed\|Invalid"`
**timeout**: 10
**requires_sudo**: false

### check_ssh_authorized_keys
**description**: Find all SSH authorized_keys files
**command**: `find /home /root -name "authorized_keys" 2>/dev/null | head -20`
**timeout**: 10
**requires_sudo**: false

### check_ssh_config
**description**: Review SSH daemon configuration
**command**: `cat /etc/ssh/sshd_config 2>/dev/null | grep -v "^#" | grep -v "^$"`
**timeout**: 5
**requires_sudo**: false

### check_logged_in_users
**description**: Show currently logged-in users
**command**: `w 2>/dev/null; who 2>/dev/null`
**timeout**: 5
**requires_sudo**: false

### check_recent_account_changes
**description**: Find recently modified account-related files
**command**: `find /etc -name "passwd" -o -name "shadow" -o -name "group" 2>/dev/null | head -10`
**timeout**: 10
**requires_sudo**: false

### check_home_dir_permissions
**description**: Check home directory permissions for security issues
**command**: `ls -la /home/ 2>/dev/null; ls -la /root/ 2>/dev/null`
**timeout**: 5
**requires_sudo**: false
