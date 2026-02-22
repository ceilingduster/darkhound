---
id: windows_scheduled_tasks
name: Windows Scheduled Tasks
description: Deep inspection of scheduled tasks for persistence, execution, and privilege escalation including hidden tasks, SYSTEM-level tasks, and tasks with encoded commands
os_types: [windows]
tags: [persistence, execution, T1053.005]
severity_hint: medium
---

## Steps

### list_all_scheduled_tasks
**description**: Enumerate all registered scheduled tasks with their state and path
**command**: `Get-ScheduledTask 2>$null | Select-Object TaskName, TaskPath, State, Author | Format-Table -AutoSize`
**timeout**: 20
**requires_sudo**: false

### check_task_details
**description**: Inspect task actions to identify what executables or scripts each task runs
**command**: `Get-ScheduledTask 2>$null | ForEach-Object { $actions = $_ | Get-ScheduledTaskInfo -ErrorAction SilentlyContinue; $acts = ($_.Actions | ForEach-Object { "$($_.Execute) $($_.Arguments)" }) -join '; '; [PSCustomObject]@{TaskName=$_.TaskName; TaskPath=$_.TaskPath; Actions=$acts} } | Where-Object { $_.Actions } | Format-Table -AutoSize -Wrap`
**timeout**: 30
**requires_sudo**: false

### check_hidden_tasks
**description**: Search for hidden scheduled tasks by checking the Hidden setting and registry
**command**: `Get-ScheduledTask 2>$null | Where-Object { $_.Settings.Hidden -eq $true } | Select-Object TaskName, TaskPath, State | Format-Table -AutoSize; Get-ChildItem 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule\TaskCache\Tree' -Recurse 2>$null | ForEach-Object { $sd = (Get-ItemProperty $_.PSPath -Name SD -ErrorAction SilentlyContinue).SD; if ($sd) { [PSCustomObject]@{Task=$_.PSChildName; HasSD=$true} } } | Format-Table -AutoSize`
**timeout**: 20
**requires_sudo**: true

### check_system_privilege_tasks
**description**: Identify tasks configured to run as SYSTEM or with highest privileges
**command**: `Get-ScheduledTask 2>$null | Where-Object { $_.Principal.UserId -match 'SYSTEM|S-1-5-18' -or $_.Principal.RunLevel -eq 'Highest' } | Select-Object TaskName, TaskPath, @{N='RunAs';E={$_.Principal.UserId}}, @{N='RunLevel';E={$_.Principal.RunLevel}} | Format-Table -AutoSize`
**timeout**: 20
**requires_sudo**: false

### check_task_creation_events
**description**: Review event logs for recently created scheduled tasks
**command**: `Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-TaskScheduler/Operational'; Id=106} -MaxEvents 50 2>$null | Select-Object TimeCreated, @{N='TaskName';E={$_.Properties[0].Value}}, @{N='UserContext';E={$_.Properties[1].Value}} | Format-Table -AutoSize`
**timeout**: 20
**requires_sudo**: false

### check_tasks_from_temp_dirs
**description**: Find tasks that execute from temporary, user, or download directories
**command**: `Get-ScheduledTask 2>$null | ForEach-Object { $_.Actions | Where-Object { $_.Execute -match 'Temp|tmp|AppData|Downloads|Users\\Public|ProgramData' } | ForEach-Object { [PSCustomObject]@{Execute=$_.Execute; Arguments=$_.Arguments} } } | Format-Table -AutoSize -Wrap`
**timeout**: 20
**requires_sudo**: false

### check_tasks_encoded_commands
**description**: Detect tasks using Base64-encoded or obfuscated PowerShell commands
**command**: `Get-ScheduledTask 2>$null | ForEach-Object { $task = $_.TaskName; $_.Actions | Where-Object { $_.Arguments -match '-[Ee]nc[oded]*[Cc]ommand|-[Ee][Cc]\s|[Ff]rom[Bb]ase64|Invoke-Expression|IEX\s|hidden|-[Ww]indow[Ss]tyle\s+[Hh]idden' } | ForEach-Object { [PSCustomObject]@{TaskName=$task; Arguments=$_.Arguments} } } | Format-Table -AutoSize -Wrap`
**timeout**: 20
**requires_sudo**: false
