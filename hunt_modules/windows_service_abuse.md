---
id: windows_service_abuse
name: Windows Service Abuse
description: Detect service-based privilege escalation and persistence including unquoted paths, weak permissions, DLL hijacking, and suspicious service creation
os_types: [windows]
tags: [privilege-escalation, T1543.003, T1574]
severity_hint: high
---

## Steps

### check_service_permissions
**description**: Identify services with weak DACL permissions allowing modification by non-admin users
**command**: `Get-CimInstance Win32_Service 2>$null | ForEach-Object { $sddl = (sc.exe sdshow $_.Name 2>$null) -join ''; if ($sddl -match 'A;;[^;]*RP[^;]*;;;BU|A;;[^;]*WP[^;]*;;;BU|A;;[^;]*CC[^;]*;;;BU') { [PSCustomObject]@{Name=$_.Name; Path=$_.PathName; StartMode=$_.StartMode} } } | Format-Table -AutoSize`
**timeout**: 30
**requires_sudo**: true

### check_unquoted_service_paths
**description**: Find services with unquoted paths containing spaces, vulnerable to path interception
**command**: `Get-CimInstance Win32_Service 2>$null | Where-Object { $_.PathName -and $_.PathName -notmatch '^"' -and $_.PathName -match '\s' -and $_.PathName -notmatch '^C:\\Windows\\System32\\svchost' } | Select-Object Name, StartMode, State, PathName | Format-Table -AutoSize`
**timeout**: 20
**requires_sudo**: false

### check_modifiable_service_binaries
**description**: Check if service binary paths point to writable locations
**command**: `Get-CimInstance Win32_Service 2>$null | ForEach-Object { $path = ($_.PathName -replace '"','') -replace '\s.*$',''; if ($path -and (Test-Path $path -ErrorAction SilentlyContinue)) { $acl = Get-Acl $path -ErrorAction SilentlyContinue; if ($acl.AccessToString -match 'BUILTIN\\Users.*Write|Everyone.*Write|Authenticated Users.*Write') { [PSCustomObject]@{Service=$_.Name; Path=$path; Access='WRITABLE'} } } } | Format-Table -AutoSize`
**timeout**: 30
**requires_sudo**: true

### check_service_dll_hijacking
**description**: Look for services loading DLLs from writable directories
**command**: `Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\*' 2>$null | Where-Object { $_.ServiceDll } | Select-Object PSChildName, ServiceDll | ForEach-Object { $dir = Split-Path $_.ServiceDll -Parent -ErrorAction SilentlyContinue; [PSCustomObject]@{Service=$_.PSChildName; DLL=$_.ServiceDll; DirExists=(Test-Path $dir -ErrorAction SilentlyContinue)} } | Format-Table -AutoSize`
**timeout**: 20
**requires_sudo**: false

### check_service_account_privileges
**description**: Enumerate service accounts and their privilege levels
**command**: `Get-CimInstance Win32_Service 2>$null | Where-Object { $_.StartName -and $_.StartName -ne 'LocalSystem' -and $_.StartName -ne 'NT AUTHORITY\LocalService' -and $_.StartName -ne 'NT AUTHORITY\NetworkService' } | Select-Object Name, StartName, State, StartMode | Format-Table -AutoSize`
**timeout**: 20
**requires_sudo**: false

### check_recently_created_services
**description**: Detect recently created or modified services that may indicate compromise
**command**: `Get-WinEvent -FilterHashtable @{LogName='System'; Id=7045} -MaxEvents 50 2>$null | Select-Object TimeCreated, @{N='ServiceName';E={$_.Properties[0].Value}}, @{N='ImagePath';E={$_.Properties[1].Value}}, @{N='ServiceType';E={$_.Properties[2].Value}}, @{N='StartType';E={$_.Properties[3].Value}} | Format-Table -AutoSize`
**timeout**: 20
**requires_sudo**: false
