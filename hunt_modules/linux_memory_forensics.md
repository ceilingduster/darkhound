---
id: linux_memory_forensics
name: Linux Memory Forensics
description: "Advanced memory analysis \u2014 process injection indicators, anonymous\
  \ memory mappings, fileless malware, and in-memory code execution"
os_types: [linux]
tags: [memory, T1055, T1620, T1059, defense-evasion, advanced]
severity_hint: critical
---

## Steps

### check_rwx_memory_regions
**description**: Find processes with RWX (read-write-execute) memory regions — strong injection indicator
**command**: `find /proc -name "maps" -exec grep -l "rwxp" {} \; 2>/dev/null | sed 's|/proc/\([0-9]*\)/maps|\1|' | while read pid; do echo "PID=$pid $(cat /proc/$pid/cmdline 2>/dev/null | tr '\0' ' ')"; done | head -15`
**timeout**: 20
**requires_sudo**: true

### check_anonymous_executable_pages
**description**: Detect anonymous executable memory pages (fileless payload indicator)
**command**: `find /proc -name "maps" -exec grep -l "rwxp.*00000000 00:00 0" {} \; 2>/dev/null | sed 's|/proc/\([0-9]*\)/maps|\1|' | while read pid; do echo "PID=$pid $(cat /proc/$pid/cmdline 2>/dev/null | tr '\0' ' ')"; done | head -10`
**timeout**: 20
**requires_sudo**: true

### check_memfd_create
**description**: Detect processes using memfd_create (in-memory file execution)
**command**: `ls -la /proc/*/fd 2>/dev/null | grep memfd | head -15; find /proc -name "fd" -exec ls -la {} \; 2>/dev/null | grep "memfd:" | head -15`
**timeout**: 20
**requires_sudo**: true

### check_process_env_anomalies
**description**: Look for processes with suspicious or stripped environment variables
**command**: `for pid in $(ls /proc | grep -E '^[0-9]+$' | head -50); do env_size=$(cat /proc/$pid/environ 2>/dev/null | wc -c); if [ "$env_size" -eq 0 ] 2>/dev/null; then echo "PID=$pid NO_ENV $(cat /proc/$pid/cmdline 2>/dev/null | tr '\0' ' ')"; fi; done`
**timeout**: 20
**requires_sudo**: true

### check_process_fd_anomalies
**description**: Find processes with file descriptors pointing to deleted or unusual files
**command**: `find /proc/*/fd -type l -exec ls -la {} \; 2>/dev/null | grep -E "deleted|memfd|/dev/shm|/tmp/\." | head -20`
**timeout**: 20
**requires_sudo**: true

### check_proc_exe_mismatches
**description**: Detect processes where /proc/PID/exe differs from /proc/PID/cmdline
**command**: `for pid in $(ps -eo pid --no-headers | head -30); do exe=$(readlink /proc/$pid/exe 2>/dev/null); cmd=$(cat /proc/$pid/cmdline 2>/dev/null | tr '\0' ' ' | awk '{print $1}'); if [ -n "$exe" ] && [ -n "$cmd" ] && [ "$exe" != "$cmd" ] && echo "$exe" | grep -qv "deleted"; then echo "PID=$pid exe=$exe cmd=$cmd"; fi; done`
**timeout**: 20
**requires_sudo**: true

### check_stack_executable
**description**: Check if any process has an executable stack (exploit indicator)
**command**: `find /proc -name "maps" -exec grep -l "rwxp.*\[stack\]" {} \; 2>/dev/null | sed 's|/proc/\([0-9]*\)/maps|\1|' | while read pid; do echo "PID=$pid $(cat /proc/$pid/cmdline 2>/dev/null | tr '\0' ' ')"; done | head -10`
**timeout**: 15
**requires_sudo**: true

### check_shared_memory_segments
**description**: List shared memory segments for suspicious allocations
**command**: `ipcs -m 2>/dev/null; ls -la /dev/shm/ 2>/dev/null`
**timeout**: 10
**requires_sudo**: false
