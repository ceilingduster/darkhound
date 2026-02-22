---
id: linux_scheduled_tasks
name: Linux Scheduled Task Abuse
description: Deep inspection of all scheduled task mechanisms — cron, systemd timers, at jobs, anacron, and incron for persistence and execution
os_types: [linux]
tags: [persistence, T1053, T1053.003, T1053.005, execution]
severity_hint: high
---

## Steps

### check_all_user_crontabs
**description**: Enumerate crontab entries for every user on the system
**command**: `for user in $(cut -f1 -d: /etc/passwd); do echo "=== $user ==="; crontab -l -u $user 2>/dev/null; done`
**timeout**: 15
**requires_sudo**: true

### check_system_cron_dirs
**description**: List all files in system cron directories with content
**command**: `find /etc/cron.d /etc/cron.daily /etc/cron.hourly /etc/cron.weekly /etc/cron.monthly -type f -exec sh -c 'echo "=== {} ==="; cat {}' \; 2>/dev/null`
**timeout**: 15
**requires_sudo**: false

### check_crontab_main
**description**: Review the main system crontab file
**command**: `cat /etc/crontab 2>/dev/null`
**timeout**: 5
**requires_sudo**: false

### check_systemd_timers
**description**: List all systemd timers including inactive ones
**command**: `systemctl list-timers --all --no-pager 2>/dev/null`
**timeout**: 10
**requires_sudo**: false

### check_custom_timer_units
**description**: Find user-created timer units outside standard packages
**command**: `find /etc/systemd /home -name "*.timer" 2>/dev/null | while read f; do echo "=== $f ==="; cat "$f"; done`
**timeout**: 15
**requires_sudo**: false

### check_at_queue
**description**: List all pending at jobs with their commands
**command**: `atq 2>/dev/null; for job in $(atq 2>/dev/null | awk '{print $1}'); do echo "=== Job $job ==="; at -c $job 2>/dev/null | tail -5; done`
**timeout**: 15
**requires_sudo**: true

### check_anacron
**description**: Review anacron configuration and job timestamps
**command**: `cat /etc/anacrontab 2>/dev/null; ls -la /var/spool/anacron/ 2>/dev/null`
**timeout**: 10
**requires_sudo**: false

### check_incron
**description**: Check for inotify-based cron (incron) jobs that trigger on file events
**command**: `cat /etc/incron.d/* 2>/dev/null; incrontab -l 2>/dev/null; find /var/spool/incron -type f 2>/dev/null | head -10`
**timeout**: 10
**requires_sudo**: true

### check_cron_suspicious_commands
**description**: Search all cron entries for suspicious commands (downloads, encoding, reverse shells)
**command**: `cat /etc/crontab /etc/cron.d/* /var/spool/cron/crontabs/* 2>/dev/null | grep -vE "^#|^$" | grep -iE "wget|curl|bash|python|perl|nc |base64|/dev/tcp|chmod"`
**timeout**: 10
**requires_sudo**: true
