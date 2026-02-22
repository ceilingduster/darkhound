---
id: macos_credential_access
name: macOS Credential Access
description: Detect attempts to access or harvest credentials from keychains, SSH keys, browser stores, and cached authentication data on macOS
os_types: [macos]
tags: [credential-access, T1555.001, T1555.003, T1552]
severity_hint: critical
---

## Steps

### check_keychain_access
**description**: List keychains and check for recent keychain access or unlock events
**command**: `security list-keychains 2>/dev/null; security show-keychain-info ~/Library/Keychains/login.keychain-db 2>/dev/null; log show --predicate 'subsystem == "com.apple.securityd"' --last 1h 2>/dev/null | grep -iE 'keychain|unlock|decrypt' | tail -20`
**timeout**: 20
**requires_sudo**: false

### check_security_authdb
**description**: Inspect the authorization database for modified or suspicious rules
**command**: `security authorizationdb read system.privilege.admin 2>/dev/null; security authorizationdb read system.login.console 2>/dev/null | head -30; ls -la /etc/authorization 2>/dev/null`
**timeout**: 15
**requires_sudo**: true

### check_credential_files
**description**: Search home directories for exposed credential files and sensitive data
**command**: `find /Users -maxdepth 4 -type f \( -name "*.pem" -o -name "*.key" -o -name "*.p12" -o -name "*.pfx" -o -name "credentials" -o -name "credentials.json" -o -name ".netrc" -o -name ".aws" -o -name "*.keystore" \) 2>/dev/null | head -20`
**timeout**: 15
**requires_sudo**: false

### check_ssh_keys
**description**: Enumerate SSH keys and authorized_keys files across all users
**command**: `for dir in /Users/*/.ssh; do echo "=== $dir ==="; ls -la "$dir" 2>/dev/null; cat "$dir/authorized_keys" 2>/dev/null; cat "$dir/config" 2>/dev/null | grep -iE 'Host|Identity|Proxy' | head -10; done`
**timeout**: 15
**requires_sudo**: true

### check_browser_credential_stores
**description**: Check for the existence and recent modification of browser credential databases
**command**: `ls -la ~/Library/Application\ Support/Google/Chrome/Default/Login\ Data 2>/dev/null; ls -la ~/Library/Application\ Support/Firefox/Profiles/*/logins.json 2>/dev/null; ls -la ~/Library/Cookies/Cookies.binarycookies 2>/dev/null; stat -f '%Sm %N' ~/Library/Application\ Support/Google/Chrome/Default/Login\ Data ~/Library/Application\ Support/Firefox/Profiles/*/logins.json 2>/dev/null`
**timeout**: 10
**requires_sudo**: false

### check_cached_directory_credentials
**description**: Check for cached Active Directory and LDAP credentials
**command**: `dscl /Search -list /Users 2>/dev/null | head -20; dscl . -read /Users/$(whoami) AuthenticationAuthority 2>/dev/null; defaults read /Library/Preferences/OpenDirectory/Configurations/*.plist 2>/dev/null; ls -la /var/db/dslocal/nodes/Default/users/ 2>/dev/null | head -20`
**timeout**: 15
**requires_sudo**: true

### check_sudo_timestamp_files
**description**: Check sudo timestamp files that could indicate credential caching or replay
**command**: `ls -la /var/db/sudo/ 2>/dev/null; ls -laR /private/var/db/sudo/ 2>/dev/null; log show --predicate 'process == "sudo"' --last 2h 2>/dev/null | tail -20`
**timeout**: 15
**requires_sudo**: true
