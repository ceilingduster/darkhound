---
id: windows_persistence
name: Windows Persistence Mechanisms
description: Detect common persistence techniques on Windows hosts including registry Run keys, startup folders, scheduled tasks, services, WMI subscriptions, and IFEO hijacking
os_types: [windows]
tags: [persistence, T1547, T1053, T1543, T1546]
severity_hint: high
---

## Steps

### check_run_keys
**description**: Enumerate Run and RunOnce registry keys for current user and local machine
**command**: `Get-ItemProperty -Path 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run','HKLM:\Software\Microsoft\Windows\CurrentVersion\RunOnce','HKCU:\Software\Microsoft\Windows\CurrentVersion\Run','HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce' 2>$null | Format-List`
**timeout**: 15
**requires_sudo**: false

### check_startup_folders
**description**: List files in common and per-user Startup folders
**command**: `Get-ChildItem "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\Startup" 2>$null; Get-ChildItem "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup" 2>$null; Get-ChildItem "C:\Users\*\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup" 2>$null`
**timeout**: 15
**requires_sudo**: false

### check_scheduled_tasks
**description**: List scheduled tasks configured to run at logon or startup
**command**: `Get-ScheduledTask 2>$null | Where-Object { $_.Triggers -match 'Logon|Boot|Startup' } | Select-Object TaskName, TaskPath, State | Format-Table -AutoSize`
**timeout**: 20
**requires_sudo**: false

### check_services
**description**: List services set to auto-start, focusing on non-Microsoft services
**command**: `Get-CimInstance Win32_Service 2>$null | Where-Object { $_.StartMode -eq 'Auto' -and $_.PathName -notmatch 'Windows\\System32\\svchost' } | Select-Object Name, StartMode, State, PathName | Format-Table -AutoSize`
**timeout**: 20
**requires_sudo**: false

### check_wmi_subscriptions
**description**: Enumerate WMI event subscriptions used for persistence
**command**: `Get-WMIObject -Namespace root\Subscription -Class __EventFilter 2>$null | Select-Object Name, Query; Get-WMIObject -Namespace root\Subscription -Class __EventConsumer 2>$null | Select-Object Name, CommandLineTemplate, ScriptText; Get-WMIObject -Namespace root\Subscription -Class __FilterToConsumerBinding 2>$null | Select-Object Filter, Consumer`
**timeout**: 20
**requires_sudo**: true

### check_dll_search_order_hijacking
**description**: Check for suspicious DLLs in writable PATH directories and known hijack locations
**command**: `$env:PATH -split ';' | ForEach-Object { if ($_ -and (Test-Path $_)) { Get-ChildItem $_ -Filter '*.dll' -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt (Get-Date).AddDays(-30) } | Select-Object FullName, LastWriteTime } } | Format-Table -AutoSize`
**timeout**: 20
**requires_sudo**: false

### check_image_file_execution_options
**description**: Detect Image File Execution Options (IFEO) debugger hijacking
**command**: `Get-ChildItem 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options' 2>$null | ForEach-Object { $debugger = (Get-ItemProperty $_.PSPath -Name Debugger -ErrorAction SilentlyContinue).Debugger; if ($debugger) { [PSCustomObject]@{Key=$_.PSChildName; Debugger=$debugger} } } | Format-Table -AutoSize`
**timeout**: 15
**requires_sudo**: false
