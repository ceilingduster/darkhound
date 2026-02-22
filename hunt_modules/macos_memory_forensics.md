---
id: macos_memory_forensics
name: macOS Memory Forensics
description: Analyze running processes for memory-based threats including dylib injection, suspicious process relationships, and in-memory malware indicators
os_types: [macos]
tags: [defense-evasion, T1055, T1620]
severity_hint: critical
---

## Steps

### check_process_memory_maps
**description**: Inspect memory regions of running processes for suspicious mappings
**command**: `ps aux 2>/dev/null | grep -v 'com.apple' | awk '{print $2, $11}' | while read pid cmd; do maps=$(vmmap "$pid" 2>/dev/null | grep -cE 'MALLOC|__TEXT|__DATA'); if [ "$maps" -gt 0 ]; then echo "PID $pid ($cmd): $maps regions"; fi; done 2>/dev/null | head -20`
**timeout**: 30
**requires_sudo**: true

### check_dylib_injection
**description**: Detect dylib injection by checking for DYLD_INSERT_LIBRARIES in running process environments
**command**: `ps -eo pid,command 2>/dev/null | grep -v grep | while read pid rest; do env_val=$(launchctl procinfo "$pid" 2>/dev/null | grep -i DYLD_INSERT); if [ -n "$env_val" ]; then echo "PID $pid ($rest): $env_val"; fi; done 2>/dev/null | head -20; echo "=== Loaded dylibs ==="; for pid in $(ps -eo pid= | head -30); do vmmap "$pid" 2>/dev/null | grep '\.dylib' | grep -v '/usr/lib\|/System/' | head -5; done 2>/dev/null`
**timeout**: 45
**requires_sudo**: true

### check_dyld_environment_variables
**description**: Check for DYLD environment variables that could be used for library injection
**command**: `env 2>/dev/null | grep DYLD; launchctl getenv DYLD_INSERT_LIBRARIES 2>/dev/null; launchctl getenv DYLD_LIBRARY_PATH 2>/dev/null; launchctl getenv DYLD_FRAMEWORK_PATH 2>/dev/null; echo "=== Plist DYLD refs ==="; grep -rl DYLD_INSERT /Library/LaunchAgents/ /Library/LaunchDaemons/ ~/Library/LaunchAgents/ 2>/dev/null`
**timeout**: 15
**requires_sudo**: false

### check_suspicious_process_relationships
**description**: Identify suspicious parent-child process relationships and orphaned processes
**command**: `ps -axo pid,ppid,user,command 2>/dev/null | awk 'NR>1{if($2==1 && $4!~/^\/usr\/|^\/System\/|^\/sbin\/|loginwindow|launchd/) print "ORPHAN:", $0}' | head -20; echo "=== Shell spawns ==="; ps -axo pid,ppid,command 2>/dev/null | grep -E 'bash|sh|zsh|python|ruby|perl' | grep -v grep | head -20`
**timeout**: 15
**requires_sudo**: false

### check_memory_resident_malware
**description**: Look for indicators of memory-only malware including processes running from deleted files or /tmp
**command**: `lsof +L1 2>/dev/null | head -20; echo "=== /tmp executables ==="; lsof -c '' 2>/dev/null | grep -E '/tmp/|/var/tmp/|/private/tmp/' | grep -v log | head -20; echo "=== Deleted binaries ==="; ps aux 2>/dev/null | awk '{print $11}' | while read bin; do [ ! -f "$bin" ] && [ -n "$bin" ] && echo "MISSING BINARY: $bin"; done 2>/dev/null | head -15`
**timeout**: 20
**requires_sudo**: true

### check_process_code_signing
**description**: Verify code signatures of all running non-Apple processes
**command**: `ps -eo pid,comm 2>/dev/null | awk 'NR>1{print $1, $2}' | while read pid proc; do path=$(ps -o comm= -p "$pid" 2>/dev/null); if [ -n "$path" ] && ! codesign -v "$path" 2>/dev/null; then team=$(codesign -dv "$path" 2>&1 | grep TeamIdentifier); echo "UNSIGNED/INVALID PID $pid: $path $team"; fi; done 2>/dev/null | grep -v '^$' | head -20`
**timeout**: 45
**requires_sudo**: false

### check_entitlements_abuse
**description**: Check running processes for dangerous entitlements that could be abused
**command**: `ps -eo pid,comm 2>/dev/null | awk 'NR>1{print $1, $2}' | while read pid proc; do path=$(ps -o comm= -p "$pid" 2>/dev/null); if [ -n "$path" ]; then ents=$(codesign -d --entitlements - "$path" 2>/dev/null); if echo "$ents" | grep -qiE 'task_for_pid|get-task-allow|com.apple.security.cs.disable-library-validation|com.apple.private'; then echo "=== PID $pid ($proc) ==="; echo "$ents" | grep -iE 'task_for_pid|get-task-allow|disable-library|com.apple.private' | head -5; fi; fi; done 2>/dev/null | head -30`
**timeout**: 45
**requires_sudo**: false
