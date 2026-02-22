---
id: windows_lateral_movement
name: Windows Lateral Movement
description: Identify lateral movement indicators including RDP sessions, PsExec usage, WinRM, admin shares, DCOM, remote services, pass-the-hash, and network logon events
os_types: [windows]
tags: [lateral-movement, T1021, T1570, T1563]
severity_hint: high
---

## Steps

### check_remote_desktop_sessions
**description**: Enumerate active and recent Remote Desktop sessions
**command**: `qwinsta 2>$null; Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-TerminalServices-LocalSessionManager/Operational'; Id=21,22,23,24,25} -MaxEvents 50 2>$null | Select-Object TimeCreated, Id, @{N='User';E={$_.Properties[0].Value}}, @{N='Source';E={$_.Properties[2].Value}} | Format-Table -AutoSize`
**timeout**: 20
**requires_sudo**: false

### check_psexec_smb_execution
**description**: Detect PsExec, SMB remote execution, and named pipe indicators
**command**: `Get-WinEvent -FilterHashtable @{LogName='System'; Id=7045} -MaxEvents 100 2>$null | Where-Object { $_.Properties[0].Value -match 'PSEXE|psexe|PAExec|RemCom|csexec' } | Select-Object TimeCreated, @{N='ServiceName';E={$_.Properties[0].Value}}, @{N='ImagePath';E={$_.Properties[1].Value}} | Format-Table -AutoSize -Wrap; Get-ChildItem '\\.\pipe\' 2>$null | Where-Object { $_.Name -match 'psexe|PAExec|RemCom' } | Select-Object Name`
**timeout**: 20
**requires_sudo**: true

### check_winrm_sessions
**description**: Check for active WinRM sessions and remote PowerShell connections
**command**: `Get-WSManInstance -ResourceURI winrm/config/listener -Enumerate 2>$null | Select-Object Transport, Address, Enabled; Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-WinRM/Operational'; Id=6,91,168} -MaxEvents 50 2>$null | Select-Object TimeCreated, Id, @{N='Details';E={$_.Message.Substring(0,[Math]::Min(150,$_.Message.Length))}} | Format-Table -AutoSize -Wrap`
**timeout**: 20
**requires_sudo**: false

### check_admin_shares_access
**description**: Enumerate connections to administrative shares (C$, ADMIN$, IPC$)
**command**: `net session 2>$null; net use 2>$null; Get-WinEvent -FilterHashtable @{LogName='Security'; Id=5140,5145} -MaxEvents 100 2>$null | Where-Object { $_.Message -match 'C\$|ADMIN\$|IPC\$' } | Select-Object TimeCreated, @{N='ShareName';E={$_.Properties[5].Value}}, @{N='SourceAddress';E={$_.Properties[9].Value}} | Select-Object -First 30 | Format-Table -AutoSize`
**timeout**: 20
**requires_sudo**: true

### check_dcom_lateral_movement
**description**: Detect DCOM-based lateral movement via MMC20, ShellWindows, or ShellBrowserWindow
**command**: `Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-DistributedCOM/Operational'} -MaxEvents 50 2>$null | Select-Object TimeCreated, Id, @{N='Details';E={$_.Message.Substring(0,[Math]::Min(200,$_.Message.Length))}} | Format-Table -AutoSize -Wrap; Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4688} -MaxEvents 200 2>$null | Where-Object { $_.Properties[8].Value -match 'mmc\.exe|excel\.exe|outlook\.exe' -and $_.Properties[13].Value -match '-Embedding' } | Select-Object TimeCreated, @{N='Process';E={$_.Properties[5].Value}} | Select-Object -First 10`
**timeout**: 25
**requires_sudo**: true

### check_remote_service_creation
**description**: Identify services created remotely via sc.exe or Service Control Manager
**command**: `Get-WinEvent -FilterHashtable @{LogName='System'; Id=7045} -MaxEvents 50 2>$null | Select-Object TimeCreated, @{N='ServiceName';E={$_.Properties[0].Value}}, @{N='ImagePath';E={$_.Properties[1].Value}}, @{N='ServiceType';E={$_.Properties[2].Value}}, @{N='StartType';E={$_.Properties[3].Value}}, @{N='AccountName';E={$_.Properties[4].Value}} | Format-Table -AutoSize -Wrap`
**timeout**: 20
**requires_sudo**: false

### check_pass_the_hash_indicators
**description**: Detect pass-the-hash attack indicators through NTLM authentication events
**command**: `Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4624} -MaxEvents 200 2>$null | Where-Object { $_.Properties[8].Value -eq 9 -or ($_.Properties[8].Value -eq 3 -and $_.Properties[14].Value -eq 'NTLM') } | Select-Object TimeCreated, @{N='LogonType';E={$_.Properties[8].Value}}, @{N='TargetUser';E={$_.Properties[5].Value}}, @{N='SourceIP';E={$_.Properties[18].Value}}, @{N='AuthPackage';E={$_.Properties[14].Value}} | Select-Object -First 30 | Format-Table -AutoSize`
**timeout**: 25
**requires_sudo**: true

### check_network_logon_events
**description**: Review Type 3 network logon events for anomalous remote access patterns
**command**: `Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4624} -MaxEvents 200 2>$null | Where-Object { $_.Properties[8].Value -eq 3 } | Select-Object TimeCreated, @{N='TargetUser';E={$_.Properties[5].Value}}, @{N='TargetDomain';E={$_.Properties[6].Value}}, @{N='SourceIP';E={$_.Properties[18].Value}}, @{N='SourceHost';E={$_.Properties[11].Value}} | Select-Object -First 30 | Format-Table -AutoSize`
**timeout**: 25
**requires_sudo**: true
