---
id: windows_credential_access
name: Windows Credential Access
description: Detect credential theft techniques including LSA secrets access, SAM hive dumps, DPAPI abuse, Mimikatz indicators, LSASS access, and credential guard bypass attempts
os_types: [windows]
tags: [credential-access, T1003, T1555, T1552]
severity_hint: critical
---

## Steps

### check_lsa_secrets_protection
**description**: Verify LSA protection settings and RunAsPPL configuration
**command**: `Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa' 2>$null | Select-Object RunAsPPL, LimitBlankPasswordUse, NoLMHash, RestrictAnonymous, RestrictAnonymousSAM, EveryoneIncludesAnonymous; Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\WDigest' -Name UseLogonCredential 2>$null`
**timeout**: 10
**requires_sudo**: true

### check_credential_guard_status
**description**: Check if Credential Guard and Device Guard are enabled
**command**: `Get-CimInstance -ClassName Win32_DeviceGuard -Namespace root\Microsoft\Windows\DeviceGuard 2>$null | Select-Object AvailableSecurityProperties, RequiredSecurityProperties, SecurityServicesConfigured, SecurityServicesRunning, VirtualizationBasedSecurityStatus; Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard' 2>$null | Select-Object EnableVirtualizationBasedSecurity, RequirePlatformSecurityFeatures`
**timeout**: 15
**requires_sudo**: true

### check_sam_system_hive_access
**description**: Look for evidence of SAM and SYSTEM hive extraction or shadow copy access
**command**: `Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4663} -MaxEvents 100 2>$null | Where-Object { $_.Message -match 'SAM|SYSTEM|SECURITY' -and $_.Message -match 'config\\(SAM|SYSTEM|SECURITY)' } | Select-Object TimeCreated, @{N='Details';E={$_.Message.Substring(0,[Math]::Min(200,$_.Message.Length))}} | Select-Object -First 20 | Format-Table -AutoSize -Wrap; Get-ChildItem "$env:TEMP","$env:USERPROFILE\Desktop","C:\Windows\Temp" -Filter '*.hiv' -Recurse -ErrorAction SilentlyContinue 2>$null`
**timeout**: 20
**requires_sudo**: true

### check_dpapi_activity
**description**: Detect DPAPI master key access and credential blob decryption activity
**command**: `Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4692,4693,4694,4695} -MaxEvents 50 2>$null | Select-Object TimeCreated, Id, @{N='Details';E={$_.Message.Substring(0,[Math]::Min(200,$_.Message.Length))}} | Format-Table -AutoSize -Wrap; Get-ChildItem "$env:APPDATA\Microsoft\Protect" -Recurse -Force 2>$null | Select-Object FullName, LastWriteTime`
**timeout**: 20
**requires_sudo**: true

### check_credential_manager_entries
**description**: Enumerate stored credentials in Windows Credential Manager
**command**: `cmdkey /list 2>$null; Get-ChildItem "$env:LOCALAPPDATA\Microsoft\Credentials" -Force 2>$null | Select-Object Name, LastWriteTime, Length; Get-ChildItem "$env:APPDATA\Microsoft\Credentials" -Force 2>$null | Select-Object Name, LastWriteTime, Length`
**timeout**: 15
**requires_sudo**: false

### check_cached_domain_credentials
**description**: Check cached domain credential settings and count
**command**: `Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' -Name CachedLogonsCount 2>$null | Select-Object CachedLogonsCount; Get-ItemProperty 'HKLM:\Security\Cache' 2>$null | Select-Object * -ExcludeProperty PS*`
**timeout**: 10
**requires_sudo**: true

### check_mimikatz_indicators
**description**: Search for Mimikatz artifacts, related tools, and memory dump files
**command**: `Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-Sysmon/Operational'; Id=1} -MaxEvents 500 2>$null | Where-Object { $_.Message -match 'mimikatz|sekurlsa|kerberos::list|lsadump|crypto::certificates|privilege::debug|token::elevate' } | Select-Object TimeCreated, @{N='CommandLine';E={$_.Properties[10].Value}} | Select-Object -First 20 | Format-Table -AutoSize -Wrap; Get-ChildItem C:\Users -Recurse -Include '*.dmp','*.kirbi' -ErrorAction SilentlyContinue 2>$null | Select-Object FullName, LastWriteTime | Select-Object -First 10`
**timeout**: 30
**requires_sudo**: true

### check_lsass_access
**description**: Detect suspicious access to the LSASS process through event logs
**command**: `Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-Sysmon/Operational'; Id=10} -MaxEvents 200 2>$null | Where-Object { $_.Message -match 'lsass\.exe' } | Select-Object TimeCreated, @{N='SourceProcess';E={$_.Properties[4].Value}}, @{N='TargetProcess';E={$_.Properties[8].Value}}, @{N='GrantedAccess';E={$_.Properties[18].Value}} | Select-Object -First 20 | Format-Table -AutoSize -Wrap; Get-Process lsass 2>$null | Select-Object Id, HandleCount, WorkingSet64`
**timeout**: 20
**requires_sudo**: true
