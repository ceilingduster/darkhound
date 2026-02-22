---
id: windows_memory_forensics
name: Windows Memory Forensics
description: Detect memory-based attack techniques including process injection, process hollowing, reflective DLL loading, suspicious memory allocations, handle manipulation, APC injection, CLR attacks, and kernel callback modifications
os_types: [windows]
tags: [defense-evasion, T1055, T1620, T1574.002]
severity_hint: critical
---

## Steps

### check_process_injection_indicators
**description**: Identify processes with suspicious memory regions indicating code injection
**command**: `Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-Sysmon/Operational'; Id=8} -MaxEvents 100 2>$null | Select-Object TimeCreated, @{N='SourceProcess';E={$_.Properties[4].Value}}, @{N='TargetProcess';E={$_.Properties[8].Value}}, @{N='StartModule';E={$_.Properties[10].Value}} | Format-Table -AutoSize -Wrap; Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-Sysmon/Operational'; Id=10} -MaxEvents 200 2>$null | Where-Object { $_.Properties[18].Value -match '0x1F0FFF|0x1FFFFF|0x001F0FFF' } | Select-Object TimeCreated, @{N='SourceImage';E={$_.Properties[4].Value}}, @{N='TargetImage';E={$_.Properties[8].Value}}, @{N='GrantedAccess';E={$_.Properties[18].Value}} | Select-Object -First 20 | Format-Table -AutoSize -Wrap`
**timeout**: 25
**requires_sudo**: true

### check_hollow_processes
**description**: Detect process hollowing by comparing process image paths with loaded modules
**command**: `Get-Process 2>$null | ForEach-Object { $proc = $_; $mainMod = $proc.MainModule.FileName 2>$null; $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId=$($proc.Id)" 2>$null).CommandLine; if ($mainMod -and $cmdLine -and ($cmdLine -notmatch [regex]::Escape([IO.Path]::GetFileName($mainMod)))) { [PSCustomObject]@{PID=$proc.Id; Name=$proc.Name; ImagePath=$mainMod; CommandLine=$cmdLine} } } 2>$null | Select-Object -First 20 | Format-Table -AutoSize -Wrap`
**timeout**: 30
**requires_sudo**: true

### check_reflective_dll_loading
**description**: Search for reflective DLL injection indicators via Sysmon image load events
**command**: `Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-Sysmon/Operational'; Id=7} -MaxEvents 300 2>$null | Where-Object { $_.Properties[5].Value -notmatch '^C:\\Windows|^C:\\Program Files' -or $_.Properties[6].Value -eq $false } | Select-Object TimeCreated, @{N='Process';E={$_.Properties[4].Value}}, @{N='ImageLoaded';E={$_.Properties[5].Value}}, @{N='Signed';E={$_.Properties[6].Value}}, @{N='Signature';E={$_.Properties[7].Value}} | Select-Object -First 30 | Format-Table -AutoSize -Wrap`
**timeout**: 25
**requires_sudo**: true

### check_suspicious_memory_allocations
**description**: Identify processes with RWX memory regions commonly used by shellcode
**command**: `Get-Process 2>$null | Where-Object { $_.WorkingSet64 -gt 0 } | ForEach-Object { $proc = $_; try { $modules = $proc.Modules.Count } catch { $modules = 0 }; [PSCustomObject]@{PID=$proc.Id; Name=$proc.Name; Threads=$proc.Threads.Count; Modules=$modules; WorkingSetMB=[math]::Round($proc.WorkingSet64/1MB,2); HandleCount=$proc.HandleCount} } | Sort-Object WorkingSetMB -Descending | Select-Object -First 30 | Format-Table -AutoSize; Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-Sysmon/Operational'; Id=1} -MaxEvents 200 2>$null | Where-Object { $_.Properties[10].Value -match 'VirtualAlloc|VirtualProtect|NtAllocateVirtualMemory|WriteProcessMemory' } | Select-Object TimeCreated, @{N='CommandLine';E={$_.Properties[10].Value}} | Select-Object -First 10 | Format-Table -AutoSize -Wrap`
**timeout**: 25
**requires_sudo**: true

### check_process_handle_manipulation
**description**: Detect suspicious process handle duplication and access patterns
**command**: `Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4656,4658,4663} -MaxEvents 200 2>$null | Where-Object { $_.Message -match 'Process' -and $_.Message -match '0x1F0FFF|0x1FFFFF|PROCESS_ALL_ACCESS' } | Select-Object TimeCreated, Id, @{N='Details';E={$_.Message.Substring(0,[Math]::Min(250,$_.Message.Length))}} | Select-Object -First 20 | Format-Table -AutoSize -Wrap`
**timeout**: 25
**requires_sudo**: true

### check_apc_injection_traces
**description**: Identify Asynchronous Procedure Call injection via thread creation events
**command**: `Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-Sysmon/Operational'; Id=8} -MaxEvents 200 2>$null | Where-Object { $_.Properties[4].Value -ne $_.Properties[8].Value } | Select-Object TimeCreated, @{N='SourcePID';E={$_.Properties[3].Value}}, @{N='SourceImage';E={$_.Properties[4].Value}}, @{N='TargetPID';E={$_.Properties[7].Value}}, @{N='TargetImage';E={$_.Properties[8].Value}}, @{N='StartAddress';E={$_.Properties[10].Value}}, @{N='StartModule';E={$_.Properties[11].Value}} | Select-Object -First 20 | Format-Table -AutoSize -Wrap`
**timeout**: 25
**requires_sudo**: true

### check_clr_based_attacks
**description**: Detect .NET CLR-based attacks including Assembly.Load and CLR injection into unmanaged processes
**command**: `Get-Process 2>$null | ForEach-Object { $proc = $_; $clrLoaded = $proc.Modules 2>$null | Where-Object { $_.ModuleName -match 'clr\.dll|clrjit\.dll|mscoree\.dll|mscorlib' }; if ($clrLoaded -and $proc.Path -notmatch 'dotnet|powershell|msbuild|csc|vbc|iisexpress|w3wp') { [PSCustomObject]@{PID=$proc.Id; Name=$proc.Name; Path=$proc.Path; CLRModules=($clrLoaded.ModuleName -join ',')} } } 2>$null | Format-Table -AutoSize -Wrap; Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-Sysmon/Operational'; Id=7} -MaxEvents 300 2>$null | Where-Object { $_.Properties[5].Value -match 'clr\.dll|mscoree\.dll' -and $_.Properties[4].Value -notmatch 'powershell|dotnet|msbuild|w3wp' } | Select-Object TimeCreated, @{N='Process';E={$_.Properties[4].Value}}, @{N='ImageLoaded';E={$_.Properties[5].Value}} | Select-Object -First 10 | Format-Table -AutoSize -Wrap`
**timeout**: 30
**requires_sudo**: true

### check_kernel_callback_modifications
**description**: Check for suspicious kernel callback registrations and driver load events
**command**: `Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-Sysmon/Operational'; Id=6} -MaxEvents 50 2>$null | Select-Object TimeCreated, @{N='ImageLoaded';E={$_.Properties[2].Value}}, @{N='Signed';E={$_.Properties[5].Value}}, @{N='Signature';E={$_.Properties[6].Value}}, @{N='SignatureStatus';E={$_.Properties[7].Value}} | Format-Table -AutoSize -Wrap; Get-WinEvent -FilterHashtable @{LogName='System'; Id=7045} -MaxEvents 50 2>$null | Where-Object { $_.Properties[2].Value -match 'kernel' } | Select-Object TimeCreated, @{N='ServiceName';E={$_.Properties[0].Value}}, @{N='ImagePath';E={$_.Properties[1].Value}} | Format-Table -AutoSize -Wrap; fltmc 2>$null`
**timeout**: 25
**requires_sudo**: true
