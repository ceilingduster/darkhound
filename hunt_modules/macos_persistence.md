---
id: macos_persistence
name: macOS Persistence Mechanisms
description: Detect common persistence techniques on macOS hosts including launch agents, login items, cron jobs, shell profiles, and kernel extensions
os_types: [macos]
tags: [persistence, T1543.004, T1547.011, T1546]
severity_hint: high
---

## Steps

### check_launch_agents_daemons
**description**: List all launch agents and daemons across user and system directories
**command**: `ls -la ~/Library/LaunchAgents/ /Library/LaunchAgents/ /Library/LaunchDaemons/ /System/Library/LaunchAgents/ /System/Library/LaunchDaemons/ 2>/dev/null`
**timeout**: 10
**requires_sudo**: false

### check_login_items
**description**: Enumerate login items configured for the current user via shared file lists
**command**: `osascript -e 'tell application "System Events" to get the name of every login item' 2>/dev/null; defaults read com.apple.loginitems 2>/dev/null; ls -la ~/Library/Application\ Support/com.apple.backgroundtaskmanagementagent/ 2>/dev/null`
**timeout**: 10
**requires_sudo**: false

### check_cron_jobs
**description**: Check cron jobs for all users and system cron directories
**command**: `crontab -l 2>/dev/null; ls -la /etc/cron* /var/at/tabs/ 2>/dev/null; for user in $(dscl . list /Users | grep -v '^_'); do echo "=== $user ==="; crontab -u "$user" -l 2>/dev/null; done`
**timeout**: 15
**requires_sudo**: true

### check_shell_profiles
**description**: Inspect shell profile files for suspicious entries
**command**: `cat ~/.bash_profile ~/.bashrc ~/.zshrc ~/.zshenv ~/.zprofile /etc/profile /etc/bashrc /etc/zshrc /etc/zshenv 2>/dev/null | grep -vE '^\s*#|^\s*$' | head -60`
**timeout**: 10
**requires_sudo**: false

### check_at_jobs
**description**: Check for scheduled at jobs
**command**: `atq 2>/dev/null; ls -la /var/at/jobs/ 2>/dev/null`
**timeout**: 10
**requires_sudo**: true

### check_kernel_extensions
**description**: List loaded third-party kernel extensions that may provide persistence
**command**: `kextstat 2>/dev/null | grep -v com.apple | head -30; systemextensionsctl list 2>/dev/null`
**timeout**: 15
**requires_sudo**: false

### check_login_logout_hooks
**description**: Check for login and logout hooks configured via defaults
**command**: `defaults read com.apple.loginwindow LoginHook 2>/dev/null; defaults read com.apple.loginwindow LogoutHook 2>/dev/null; defaults read /var/root/Library/Preferences/com.apple.loginwindow 2>/dev/null`
**timeout**: 10
**requires_sudo**: true
