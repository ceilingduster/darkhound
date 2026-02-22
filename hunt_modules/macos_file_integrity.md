---
id: macos_file_integrity
name: macOS File Integrity
description: Verify macOS system integrity protections, file quarantine, extended attributes, and detect suspicious file modifications
os_types: [macos]
tags: [defense-evasion, T1222, T1564, T1036]
severity_hint: medium
---

## Steps

### check_sip_status
**description**: Verify System Integrity Protection (SIP) status to ensure it has not been disabled
**command**: `csrutil status 2>/dev/null; csrutil authenticated-root status 2>/dev/null`
**timeout**: 10
**requires_sudo**: false

### check_gatekeeper_status
**description**: Check Gatekeeper enforcement status and assessment policy
**command**: `spctl --status 2>/dev/null; spctl --assess --verbose /Applications/*.app 2>/dev/null | head -20`
**timeout**: 15
**requires_sudo**: false

### check_file_quarantine
**description**: Inspect quarantine events database for recently downloaded files
**command**: `sqlite3 ~/Library/Preferences/com.apple.LaunchServices.QuarantineEventsV2 'SELECT LSQuarantineEventIdentifier, LSQuarantineAgentName, LSQuarantineDataURLString, datetime(LSQuarantineTimeStamp + 978307200, "unixepoch") as download_date FROM LSQuarantineEvent ORDER BY LSQuarantineTimeStamp DESC LIMIT 30' 2>/dev/null`
**timeout**: 15
**requires_sudo**: false

### check_extended_attributes
**description**: Look for files with suspicious or stripped quarantine extended attributes in common download locations
**command**: `xattr -lr ~/Downloads/ 2>/dev/null | head -40; echo "=== Apps without quarantine ==="; for app in /Applications/*.app; do xattr -l "$app" 2>/dev/null | grep -qL quarantine && echo "NO QUARANTINE: $app"; done 2>/dev/null | head -20`
**timeout**: 20
**requires_sudo**: false

### check_setuid_binaries
**description**: Find setuid and setgid binaries that could be used for privilege escalation
**command**: `find / -perm -4000 -o -perm -2000 -type f 2>/dev/null | grep -v '/System/' | head -30`
**timeout**: 30
**requires_sudo**: false

### check_recently_modified_system_files
**description**: Find system files modified in the last 7 days outside of expected update paths
**command**: `find /usr/local /private/etc /Library -type f -mtime -7 2>/dev/null | grep -vE 'cache|Cache|log|Log|\.DS_Store' | head -40`
**timeout**: 20
**requires_sudo**: false

### check_hidden_files_user_dirs
**description**: Find hidden files and directories in user home folders that may indicate malware staging
**command**: `find /Users -maxdepth 3 -name ".*" -not -name ".DS_Store" -not -name ".Trash" -not -name ".CFUserTextEncoding" -not -name ".localized" 2>/dev/null | grep -vE '\.cache|\.config|\.local|\.ssh|\.zsh|\.bash' | head -30`
**timeout**: 15
**requires_sudo**: false
