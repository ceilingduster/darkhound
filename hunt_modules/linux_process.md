---
id: linux_process
name: Linux Process Threat Hunting
description: Hunt for malicious processes, hidden executables, and process injection indicators
os_types: [linux]
tags: [process, T1055, T1059, T1036, T1564, defense-evasion]
severity_hint: high
---

## Steps

### list_all_processes
**description**: Full process list with parent relationships
**command**: `ps auxf 2>/dev/null || ps -ef 2>/dev/null`
**timeout**: 10
**requires_sudo**: false

### check_process_tree
**description**: Show process tree highlighting unusual parent-child relationships
**command**: `pstree -p 2>/dev/null || ps -ejH 2>/dev/null | head -100`
**timeout**: 10
**requires_sudo**: false

### check_deleted_executables
**description**: Find processes running from deleted files (common malware indicator)
**command**: `ls -la /proc/*/exe 2>/dev/null | grep deleted | head -20`
**timeout**: 15
**requires_sudo**: false

### check_hidden_processes
**description**: Compare /proc entries with ps output to find hidden processes
**command**: `ls /proc | grep -E "^[0-9]+$" | head -100`
**timeout**: 10
**requires_sudo**: false

### check_suspicious_cmdlines
**description**: List command lines of all running processes for suspicious patterns
**command**: `cat /proc/*/cmdline 2>/dev/null | tr "\0" " " | tr "\n" "\n" | head -100`
**timeout**: 15
**requires_sudo**: false

### check_memory_maps
**description**: Look for processes with suspicious memory mappings (rwx segments)
**command**: `grep -l "rwx" /proc/*/maps 2>/dev/null | head -10`
**timeout**: 15
**requires_sudo**: false

### check_loaded_modules
**description**: List loaded kernel modules
**command**: `lsmod 2>/dev/null | head -60`
**timeout**: 10
**requires_sudo**: false

### check_setuid_binaries
**description**: Find SUID/SGID binaries in common locations
**command**: `find /usr /bin /sbin /tmp /var -perm /6000 -type f 2>/dev/null | head -40`
**timeout**: 20
**requires_sudo**: false

### check_world_writable
**description**: Find world-writable files in critical directories
**command**: `find /etc /usr/bin /usr/sbin /bin /sbin -perm -o+w -type f 2>/dev/null | head -20`
**timeout**: 20
**requires_sudo**: false

### check_tmp_executables
**description**: Find executables in /tmp and /var/tmp (common malware staging)
**command**: `find /tmp /var/tmp /dev/shm -type f -executable 2>/dev/null`
**timeout**: 10
**requires_sudo**: false
