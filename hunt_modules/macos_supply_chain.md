---
id: macos_supply_chain
name: macOS Supply Chain
description: Detect supply chain compromise indicators by verifying application signatures, notarization, package integrity, and installation sources
os_types: [macos]
tags: [initial-access, T1195, T1553]
severity_hint: high
---

## Steps

### check_application_signatures
**description**: Verify code signatures of installed applications in /Applications
**command**: `for app in /Applications/*.app; do result=$(codesign --verify --deep --strict "$app" 2>&1); if [ $? -ne 0 ]; then echo "INVALID: $app - $result"; else team=$(codesign -dv "$app" 2>&1 | grep TeamIdentifier); echo "VALID: $app ($team)"; fi; done 2>/dev/null | head -30`
**timeout**: 60
**requires_sudo**: false

### check_unsigned_applications
**description**: Find applications that are not signed or have broken signatures
**command**: `find /Applications -maxdepth 2 -name "*.app" -exec codesign --verify {} \; 2>&1 | grep -E 'invalid|not signed|modified' | head -20; echo "=== User apps ==="; find ~/Applications -maxdepth 2 -name "*.app" -exec codesign --verify {} \; 2>&1 | grep -E 'invalid|not signed|modified' | head -10`
**timeout**: 45
**requires_sudo**: false

### check_quarantine_events
**description**: Review quarantine events database for applications downloaded from the internet
**command**: `sqlite3 ~/Library/Preferences/com.apple.LaunchServices.QuarantineEventsV2 "SELECT datetime(LSQuarantineTimeStamp + 978307200, 'unixepoch', 'localtime') as date, LSQuarantineAgentName, LSQuarantineOriginURLString, LSQuarantineDataURLString FROM LSQuarantineEvent ORDER BY LSQuarantineTimeStamp DESC LIMIT 30" 2>/dev/null`
**timeout**: 15
**requires_sudo**: false

### check_homebrew_integrity
**description**: Verify Homebrew installation integrity and check for tampered formulae
**command**: `brew --version 2>/dev/null; brew doctor 2>/dev/null | head -20; echo "=== Taps ==="; brew tap 2>/dev/null; echo "=== Recently installed ==="; brew list --versions 2>/dev/null | tail -20; echo "=== Cask list ==="; brew list --cask 2>/dev/null | tail -20`
**timeout**: 30
**requires_sudo**: false

### check_developer_tool_installations
**description**: Check for developer tools and command line utilities that could be abused
**command**: `xcode-select -p 2>/dev/null; pkgutil --pkgs 2>/dev/null | grep -iE 'developer|command.line|xcode' | head -10; ls -la /usr/local/bin/ 2>/dev/null | head -30; echo "=== pip packages ==="; pip3 list 2>/dev/null | tail -20`
**timeout**: 20
**requires_sudo**: false

### check_notarization_status
**description**: Check notarization status of recently installed applications
**command**: `for app in /Applications/*.app; do echo "=== $(basename "$app") ==="; spctl --assess --verbose=4 --type execute "$app" 2>&1 | head -3; done 2>/dev/null | head -40`
**timeout**: 45
**requires_sudo**: false

### check_package_receipts
**description**: Review installed package receipts for unexpected or suspicious packages
**command**: `pkgutil --pkgs 2>/dev/null | grep -vE '^com\.apple\.' | while read pkg; do echo "=== $pkg ==="; pkgutil --pkg-info "$pkg" 2>/dev/null | grep -E 'version|install-time|install-location'; done | head -50`
**timeout**: 20
**requires_sudo**: false

### check_recently_installed_apps
**description**: Find applications installed or modified in the last 14 days
**command**: `find /Applications -maxdepth 1 -name "*.app" -mtime -14 -exec ls -ld {} \; 2>/dev/null; echo "=== Install log ==="; log show --predicate 'subsystem == "com.apple.install"' --last 14d 2>/dev/null | grep -iE 'install|package' | tail -20; echo "=== Recent DMGs ==="; find ~/Downloads -name "*.dmg" -mtime -14 2>/dev/null | head -10`
**timeout**: 20
**requires_sudo**: false
