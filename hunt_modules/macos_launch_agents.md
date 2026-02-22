---
id: macos_launch_agents
name: macOS Launch Agents/Daemons
description: Deep inspection of launch agents and daemons for unauthorized or suspicious persistence entries across all plist directories
os_types: [macos]
tags: [persistence, T1543.004, T1543.001]
severity_hint: high
---

## Steps

### list_user_launch_agents
**description**: List all user-level launch agents and show their contents
**command**: `ls -la ~/Library/LaunchAgents/ 2>/dev/null; for f in ~/Library/LaunchAgents/*.plist; do echo "=== $f ==="; plutil -p "$f" 2>/dev/null; done`
**timeout**: 15
**requires_sudo**: false

### list_system_launch_agents
**description**: List all system-wide launch agents
**command**: `ls -la /Library/LaunchAgents/ 2>/dev/null; for f in /Library/LaunchAgents/*.plist; do echo "=== $f ==="; plutil -p "$f" 2>/dev/null; done`
**timeout**: 15
**requires_sudo**: false

### list_system_launch_daemons
**description**: List all system-wide launch daemons
**command**: `ls -la /Library/LaunchDaemons/ 2>/dev/null; for f in /Library/LaunchDaemons/*.plist; do echo "=== $f ==="; plutil -p "$f" 2>/dev/null; done`
**timeout**: 15
**requires_sudo**: true

### check_non_apple_agents
**description**: Identify launch agents and daemons not signed by Apple
**command**: `for f in /Library/LaunchAgents/*.plist /Library/LaunchDaemons/*.plist ~/Library/LaunchAgents/*.plist; do prog=$(defaults read "$f" Program 2>/dev/null || defaults read "$f" ProgramArguments 2>/dev/null | head -2 | tail -1 | tr -d ' "'); if [ -n "$prog" ] && ! codesign -v --verify "$prog" 2>/dev/null; then echo "UNSIGNED: $f -> $prog"; fi; done 2>/dev/null`
**timeout**: 30
**requires_sudo**: false

### check_suspicious_plist_paths
**description**: Check agent plists for suspicious program paths like /tmp, /var/tmp, or hidden directories
**command**: `for f in ~/Library/LaunchAgents/*.plist /Library/LaunchAgents/*.plist /Library/LaunchDaemons/*.plist; do content=$(plutil -p "$f" 2>/dev/null); if echo "$content" | grep -qiE '/tmp/|/var/tmp/|/Users/.*/\.|/private/'; then echo "SUSPICIOUS: $f"; echo "$content" | grep -iE 'Program|Arguments'; fi; done 2>/dev/null`
**timeout**: 20
**requires_sudo**: false

### check_recently_modified_agents
**description**: Find launch agent and daemon plists modified in the last 14 days
**command**: `find ~/Library/LaunchAgents /Library/LaunchAgents /Library/LaunchDaemons -name "*.plist" -mtime -14 2>/dev/null | while read f; do echo "=== $f ($(stat -f '%Sm' "$f")) ==="; plutil -p "$f" 2>/dev/null | grep -E 'Program|Label'; done`
**timeout**: 15
**requires_sudo**: false

### check_running_agents_status
**description**: Check the status of all loaded launch agents and daemons via launchctl
**command**: `launchctl list 2>/dev/null | grep -v com.apple | head -40; echo "=== System domain ==="; launchctl print system 2>/dev/null | grep -E 'active|endpoint' | head -30`
**timeout**: 15
**requires_sudo**: false
