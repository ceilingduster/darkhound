---
id: macos_tcc_privacy
name: macOS TCC/Privacy Abuse
description: Inspect Transparency, Consent, and Control (TCC) database entries for unauthorized privacy permission grants and potential abuse
os_types: [macos]
tags: [defense-evasion, T1548, T1562]
severity_hint: high
---

## Steps

### check_tcc_database_entries
**description**: Dump TCC database entries to identify all applications with granted privacy permissions
**command**: `sqlite3 ~/Library/Application\ Support/com.apple.TCC/TCC.db 'SELECT service, client, auth_value, auth_reason, last_modified FROM access ORDER BY last_modified DESC LIMIT 40' 2>/dev/null; echo "=== System TCC ==="; sqlite3 /Library/Application\ Support/com.apple.TCC/TCC.db 'SELECT service, client, auth_value, auth_reason, last_modified FROM access ORDER BY last_modified DESC LIMIT 40' 2>/dev/null`
**timeout**: 15
**requires_sudo**: true

### check_full_disk_access
**description**: List applications granted Full Disk Access (FDA) permissions
**command**: `sqlite3 ~/Library/Application\ Support/com.apple.TCC/TCC.db "SELECT client, auth_value, datetime(last_modified, 'unixepoch') FROM access WHERE service='kTCCServiceSystemPolicyAllFiles'" 2>/dev/null; sqlite3 /Library/Application\ Support/com.apple.TCC/TCC.db "SELECT client, auth_value, datetime(last_modified, 'unixepoch') FROM access WHERE service='kTCCServiceSystemPolicyAllFiles'" 2>/dev/null`
**timeout**: 10
**requires_sudo**: true

### check_accessibility_permissions
**description**: List applications with Accessibility API access which can be abused for keylogging or UI manipulation
**command**: `sqlite3 ~/Library/Application\ Support/com.apple.TCC/TCC.db "SELECT client, auth_value, datetime(last_modified, 'unixepoch') FROM access WHERE service='kTCCServiceAccessibility'" 2>/dev/null; sqlite3 /Library/Application\ Support/com.apple.TCC/TCC.db "SELECT client, auth_value, datetime(last_modified, 'unixepoch') FROM access WHERE service='kTCCServiceAccessibility'" 2>/dev/null`
**timeout**: 10
**requires_sudo**: true

### check_screen_recording_permissions
**description**: Identify applications granted screen recording permissions
**command**: `sqlite3 ~/Library/Application\ Support/com.apple.TCC/TCC.db "SELECT client, auth_value, datetime(last_modified, 'unixepoch') FROM access WHERE service='kTCCServiceScreenCapture'" 2>/dev/null; sqlite3 /Library/Application\ Support/com.apple.TCC/TCC.db "SELECT client, auth_value, datetime(last_modified, 'unixepoch') FROM access WHERE service='kTCCServiceScreenCapture'" 2>/dev/null`
**timeout**: 10
**requires_sudo**: true

### check_camera_mic_permissions
**description**: List applications with camera and microphone access permissions
**command**: `sqlite3 ~/Library/Application\ Support/com.apple.TCC/TCC.db "SELECT service, client, auth_value, datetime(last_modified, 'unixepoch') FROM access WHERE service IN ('kTCCServiceCamera', 'kTCCServiceMicrophone')" 2>/dev/null; sqlite3 /Library/Application\ Support/com.apple.TCC/TCC.db "SELECT service, client, auth_value, datetime(last_modified, 'unixepoch') FROM access WHERE service IN ('kTCCServiceCamera', 'kTCCServiceMicrophone')" 2>/dev/null`
**timeout**: 10
**requires_sudo**: true

### check_automation_permissions
**description**: Check AppleEvent/Automation permissions that allow inter-application control
**command**: `sqlite3 ~/Library/Application\ Support/com.apple.TCC/TCC.db "SELECT client, indirect_object_identifier, auth_value, datetime(last_modified, 'unixepoch') FROM access WHERE service='kTCCServiceAppleEvents'" 2>/dev/null; sqlite3 /Library/Application\ Support/com.apple.TCC/TCC.db "SELECT client, indirect_object_identifier, auth_value, datetime(last_modified, 'unixepoch') FROM access WHERE service='kTCCServiceAppleEvents'" 2>/dev/null`
**timeout**: 10
**requires_sudo**: true

### check_recently_modified_tcc
**description**: Identify TCC entries modified in the last 7 days which may indicate recent permission tampering
**command**: `sqlite3 ~/Library/Application\ Support/com.apple.TCC/TCC.db "SELECT service, client, auth_value, datetime(last_modified, 'unixepoch') as modified FROM access WHERE last_modified > strftime('%s', 'now', '-7 days') ORDER BY last_modified DESC" 2>/dev/null; sqlite3 /Library/Application\ Support/com.apple.TCC/TCC.db "SELECT service, client, auth_value, datetime(last_modified, 'unixepoch') as modified FROM access WHERE last_modified > strftime('%s', 'now', '-7 days') ORDER BY last_modified DESC" 2>/dev/null`
**timeout**: 10
**requires_sudo**: true
