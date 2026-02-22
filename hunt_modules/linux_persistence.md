---
id: linux_persistence
name: Linux Persistence Mechanisms
description: Detect common persistence techniques on Linux hosts including cron, systemd, init scripts, and shell profile hijacking
os_types: [linux]
tags: [persistence, T1053, T1543, T1037, T1546]
severity_hint: high
---

## Steps

### check_crontabs
**description**: Enumerate scheduled tasks for all users and system cron directories
**command**: `crontab -l 2>/dev/null; ls -la /etc/cron* /var/spool/cron/ 2>/dev/null`
**timeout**: 10
**requires_sudo**: false

### check_cron_files
**description**: Show content of all cron job files
**command**: `find /etc/cron.d /etc/cron.daily /etc/cron.hourly /etc/cron.weekly /etc/cron.monthly -type f 2>/dev/null | head -50`
**timeout**: 10
**requires_sudo**: false

### check_systemd_units
**description**: List all systemd unit files, highlighting non-standard units
**command**: `systemctl list-units --all --no-pager 2>/dev/null | head -100`
**timeout**: 15
**requires_sudo**: false

### check_systemd_unit_files
**description**: List systemd unit files not from standard packages
**command**: `systemctl list-unit-files --no-pager 2>/dev/null | grep -v disabled | grep -v static | head -80`
**timeout**: 15
**requires_sudo**: false

### check_init_scripts
**description**: Enumerate SysV init scripts and rc.local
**command**: `ls -la /etc/init.d/ 2>/dev/null; cat /etc/rc.local 2>/dev/null`
**timeout**: 10
**requires_sudo**: false

### check_shell_profiles
**description**: Check shell profile files for persistence hooks
**command**: `cat /etc/profile /etc/bash.bashrc /etc/environment 2>/dev/null; ls -la /etc/profile.d/ 2>/dev/null`
**timeout**: 10
**requires_sudo**: false

### check_user_profiles
**description**: Enumerate user home directory shell profile files
**command**: `find /home /root -maxdepth 2 -name ".bashrc" -o -name ".bash_profile" -o -name ".profile" -o -name ".zshrc" 2>/dev/null | head -20`
**timeout**: 10
**requires_sudo**: false

### check_xdg_autostart
**description**: Check XDG autostart directories for persistence
**command**: `find /etc/xdg/autostart /home -name "*.desktop" -path "*/autostart/*" 2>/dev/null | head -20`
**timeout**: 10
**requires_sudo**: false

### check_ld_preload
**description**: Check LD_PRELOAD and /etc/ld.so.preload for injection
**command**: `cat /etc/ld.so.preload 2>/dev/null; env | grep LD_PRELOAD 2>/dev/null`
**timeout**: 5
**requires_sudo**: false

### check_at_jobs
**description**: List scheduled at jobs
**command**: `atq 2>/dev/null`
**timeout**: 5
**requires_sudo**: false
