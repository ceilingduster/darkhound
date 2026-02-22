---
id: linux_rootkit_detection
name: Linux Rootkit Detection
description: Detect kernel and userland rootkits — hidden processes, hooked syscalls, loaded kernel modules, and library injection
os_types: [linux]
tags: [rootkit, T1014, T1547, T1556, defense-evasion]
severity_hint: critical
---

## Steps

### compare_proc_ps
**description**: Compare /proc PIDs against ps output to detect hidden processes
**command**: `diff <(ls /proc | grep -E '^[0-9]+$' | sort -n) <(ps -eo pid --no-headers | tr -d ' ' | sort -n) 2>/dev/null`
**timeout**: 15
**requires_sudo**: true

### check_kernel_modules
**description**: List loaded kernel modules and flag unsigned/out-of-tree modules
**command**: `lsmod 2>/dev/null; cat /proc/modules 2>/dev/null | awk '{print $1, $6}' | head -40`
**timeout**: 10
**requires_sudo**: false

### check_syscall_table
**description**: Check for modifications to the system call table
**command**: `cat /proc/kallsyms 2>/dev/null | grep sys_call_table | head -5`
**timeout**: 10
**requires_sudo**: true

### check_ld_preload_injection
**description**: Check LD_PRELOAD and /etc/ld.so.preload for library injection
**command**: `cat /etc/ld.so.preload 2>/dev/null; cat /proc/*/environ 2>/dev/null | tr '\0' '\n' | grep LD_PRELOAD | sort -u`
**timeout**: 15
**requires_sudo**: true

### check_proc_anomalies
**description**: Look for anomalies in /proc — missing or suspicious entries
**command**: `ls -la /proc/*/exe 2>/dev/null | grep deleted | head -15; find /proc -name "maps" -exec grep -l "rwxp.*00000000" {} \; 2>/dev/null | head -10`
**timeout**: 20
**requires_sudo**: true

### check_hidden_files_rootdirs
**description**: Find hidden files and directories at the root filesystem level
**command**: `find / -maxdepth 1 -name ".*" 2>/dev/null; find /usr/lib /usr/share -name ".*" -type d 2>/dev/null | head -15`
**timeout**: 15
**requires_sudo**: true

### check_kernel_taint
**description**: Check if the kernel is tainted (indicates loaded unsigned modules)
**command**: `cat /proc/sys/kernel/tainted 2>/dev/null; dmesg 2>/dev/null | grep -i taint | tail -5`
**timeout**: 10
**requires_sudo**: true

### check_dev_anomalies
**description**: Find unexpected files in /dev that are not device nodes
**command**: `find /dev -type f 2>/dev/null | grep -v "\.udev"`
**timeout**: 15
**requires_sudo**: true

### check_binary_integrity
**description**: Verify critical system binary hashes against package manager
**command**: `for bin in /usr/bin/ls /usr/bin/ps /usr/bin/netstat /usr/bin/ss /usr/bin/find; do rpm -Vf $bin 2>/dev/null || dpkg -V $(dpkg -S $bin 2>/dev/null | cut -d: -f1) 2>/dev/null; done`
**timeout**: 20
**requires_sudo**: false
