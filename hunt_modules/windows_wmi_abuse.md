---
id: windows_wmi_abuse
name: WMI Abuse Detection
description: Detect Windows Management Instrumentation abuse for persistence, execution, lateral movement, and reconnaissance including event subscriptions, process creation, and suspicious WMIC usage
os_types: [windows]
tags: [execution, persistence, T1047, T1546.003]
severity_hint: high
---

## Steps

### check_wmi_event_subscriptions
**description**: Enumerate all WMI event filter subscriptions that could be used for persistence
**command**: `Get-WMIObject -Namespace root\Subscription -Class __EventFilter 2>$null | Select-Object Name, Query, QueryLanguage | Format-Table -AutoSize -Wrap`
**timeout**: 15
**requires_sudo**: true

### check_wmi_event_consumers
**description**: List WMI event consumers including CommandLine and ActiveScript consumers
**command**: `Get-WMIObject -Namespace root\Subscription -Class CommandLineEventConsumer 2>$null | Select-Object Name, CommandLineTemplate, ExecutablePath | Format-Table -AutoSize -Wrap; Get-WMIObject -Namespace root\Subscription -Class ActiveScriptEventConsumer 2>$null | Select-Object Name, ScriptingEngine, ScriptText | Format-Table -AutoSize -Wrap`
**timeout**: 15
**requires_sudo**: true

### check_wmi_process_creation
**description**: Detect remote process creation via WMI through event log analysis
**command**: `Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-WMI-Activity/Operational'} -MaxEvents 100 2>$null | Select-Object TimeCreated, Id, @{N='Details';E={$_.Message.Substring(0,[Math]::Min(250,$_.Message.Length))}} | Format-Table -AutoSize -Wrap; Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-Sysmon/Operational'; Id=1} -MaxEvents 300 2>$null | Where-Object { $_.Properties[20].Value -match 'WmiPrvSE\.exe' } | Select-Object TimeCreated, @{N='CommandLine';E={$_.Properties[10].Value}}, @{N='ParentImage';E={$_.Properties[20].Value}} | Select-Object -First 20 | Format-Table -AutoSize -Wrap`
**timeout**: 25
**requires_sudo**: true

### check_wmi_lateral_movement
**description**: Identify WMI-based lateral movement via network connections from WmiPrvSE
**command**: `Get-Process WmiPrvSE 2>$null | ForEach-Object { $p = $_; Get-NetTCPConnection -OwningProcess $p.Id -ErrorAction SilentlyContinue 2>$null } | Where-Object { $_.RemoteAddress -ne '0.0.0.0' -and $_.RemoteAddress -ne '::' -and $_.RemoteAddress -ne '127.0.0.1' } | Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort, State | Format-Table -AutoSize; Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4648} -MaxEvents 100 2>$null | Where-Object { $_.Message -match 'wmic|WmiPrvSE' } | Select-Object TimeCreated, @{N='Details';E={$_.Message.Substring(0,[Math]::Min(200,$_.Message.Length))}} | Select-Object -First 10 | Format-Table -AutoSize -Wrap`
**timeout**: 20
**requires_sudo**: true

### check_wmi_persistence
**description**: Verify WMI filter-to-consumer bindings that enable persistent execution
**command**: `Get-WMIObject -Namespace root\Subscription -Class __FilterToConsumerBinding 2>$null | ForEach-Object { [PSCustomObject]@{Filter=$_.Filter; Consumer=$_.Consumer; CreatorSID=$_.CreatorSID} } | Format-Table -AutoSize -Wrap`
**timeout**: 15
**requires_sudo**: true

### check_wmi_repository_size
**description**: Check WMI repository size for anomalies indicating tampering or bloat
**command**: `$repoPath = 'C:\Windows\System32\wbem\Repository'; if (Test-Path $repoPath) { $size = (Get-ChildItem $repoPath -Recurse -Force 2>$null | Measure-Object -Property Length -Sum).Sum; [PSCustomObject]@{Path=$repoPath; SizeMB=[math]::Round($size/1MB,2); FileCount=(Get-ChildItem $repoPath -Recurse -Force 2>$null).Count; LastModified=(Get-Item $repoPath).LastWriteTime} | Format-List }; Get-ChildItem $repoPath -Force 2>$null | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize`
**timeout**: 15
**requires_sudo**: true

### check_wmic_suspicious_usage
**description**: Search for suspicious WMIC command execution in process creation logs
**command**: `Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-Sysmon/Operational'; Id=1} -MaxEvents 500 2>$null | Where-Object { $_.Properties[10].Value -match 'wmic.*process\s+call|wmic.*shadow|wmic.*/node:|wmic.*product.*call|wmic.*os\s+get' } | Select-Object TimeCreated, @{N='User';E={$_.Properties[12].Value}}, @{N='CommandLine';E={$_.Properties[10].Value}} | Select-Object -First 20 | Format-Table -AutoSize -Wrap; Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4688} -MaxEvents 500 2>$null | Where-Object { $_.Properties[5].Value -match 'wmic' -and $_.Properties[8].Value -match 'process\s+call|/node:|shadow' } | Select-Object TimeCreated, @{N='CommandLine';E={$_.Properties[8].Value}} | Select-Object -First 10 | Format-Table -AutoSize -Wrap`
**timeout**: 25
**requires_sudo**: false
