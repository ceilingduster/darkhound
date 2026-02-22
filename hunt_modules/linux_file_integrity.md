---
id: linux_file_integrity
name: Linux File Integrity Check
description: Basic filesystem integrity checks — recently modified binaries, tampered configs, and suspicious file attributes
os_types: [linux]
tags: [integrity, T1565, T1036, defense-evasion]
severity_hint: medium
---

## Steps

### check_recently_modified_binaries
**description**: Find system binaries modified in the last 7 days
**command**: `find /usr/bin /usr/sbin /bin /sbin -type f -mtime -7 2>/dev/null | head -30`
**timeout**: 15
**requires_sudo**: false

### check_recently_modified_configs
**description**: Find config files modified in the last 3 days
**command**: `find /etc -type f -mtime -3 2>/dev/null | head -40`
**timeout**: 15
**requires_sudo**: false

### check_immutable_files
**description**: Find files with the immutable attribute set (used to prevent removal)
**command**: `lsattr -R /etc /usr/bin /usr/sbin 2>/dev/null | grep -E "^\S*i\S*" | head -20`
**timeout**: 20
**requires_sudo**: true

### check_package_verification
**description**: Verify installed package file integrity (RPM/dpkg)
**command**: `rpm -Va 2>/dev/null | head -40 || dpkg --verify 2>/dev/null | head -40`
**timeout**: 30
**requires_sudo**: false

### check_lib_tampering
**description**: Look for recently modified shared libraries
**command**: `find /lib /lib64 /usr/lib /usr/lib64 -name "*.so*" -mtime -7 2>/dev/null | head -20`
**timeout**: 15
**requires_sudo**: false

### check_hidden_files_system_dirs
**description**: Find hidden files in system directories (dot-prefixed)
**command**: `find /usr /var /etc -name ".*" -type f 2>/dev/null | head -30`
**timeout**: 15
**requires_sudo**: false
