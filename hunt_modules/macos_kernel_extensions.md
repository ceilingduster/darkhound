---
id: macos_kernel_extensions
name: macOS Kernel Extensions
description: Inspect kernel extensions and system extensions for unauthorized or suspicious modules that may indicate rootkit activity or persistent threats
os_types: [macos]
tags: [persistence, defense-evasion, T1547.006, T1014]
severity_hint: critical
---

## Steps

### check_loaded_kexts
**description**: List all currently loaded kernel extensions
**command**: `kextstat 2>/dev/null | head -50`
**timeout**: 10
**requires_sudo**: false

### check_third_party_kexts
**description**: Identify non-Apple third-party kernel extensions that may be suspicious
**command**: `kextstat 2>/dev/null | grep -v com.apple | grep -v 'Index Refs' | while read line; do bundle=$(echo "$line" | awk '{print $6}'); echo "=== $bundle ==="; kextfind -b "$bundle" -print 2>/dev/null; done`
**timeout**: 20
**requires_sudo**: false

### check_system_extensions
**description**: List installed system extensions including endpoint security and network extensions
**command**: `systemextensionsctl list 2>/dev/null; echo "=== Extension details ==="; find /Library/SystemExtensions -name "*.systemextension" -exec ls -la {} \; 2>/dev/null`
**timeout**: 15
**requires_sudo**: true

### check_kext_signing_status
**description**: Verify code signatures of loaded third-party kernel extensions
**command**: `kextstat 2>/dev/null | grep -v com.apple | awk '{print $6}' | while read bundle; do kext_path=$(kextfind -b "$bundle" 2>/dev/null); if [ -n "$kext_path" ]; then echo "=== $bundle ==="; codesign -dvvv "$kext_path" 2>&1 | grep -E 'Identifier|Authority|TeamIdentifier|Signature'; fi; done`
**timeout**: 30
**requires_sudo**: false

### check_recently_loaded_kexts
**description**: Check system logs for recently loaded or unloaded kernel extensions
**command**: `log show --predicate 'process == "kernelmanagerd" OR process == "kextd"' --last 24h 2>/dev/null | grep -iE 'load|unload|kext' | tail -30`
**timeout**: 20
**requires_sudo**: false

### check_kext_consent_database
**description**: Inspect the kernel extension consent database for user-approved extensions
**command**: `sqlite3 /var/db/SystemPolicyConfiguration/KextPolicy "SELECT team_id, bundle_id, allowed, developer_name FROM kext_policy" 2>/dev/null; echo "=== Kext staging ==="; ls -la /Library/StagedExtensions/ 2>/dev/null`
**timeout**: 10
**requires_sudo**: true

### check_endpoint_security_extensions
**description**: Identify endpoint security system extensions and verify their integrity
**command**: `systemextensionsctl list 2>/dev/null | grep -i endpoint; echo "=== ES clients ==="; eslogger --list-subsystems 2>/dev/null | head -20; echo "=== Network extensions ==="; systemextensionsctl list 2>/dev/null | grep -iE 'network|content.*filter'`
**timeout**: 15
**requires_sudo**: true
