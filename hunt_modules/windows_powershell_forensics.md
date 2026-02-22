---
id: windows_powershell_forensics
name: PowerShell Forensics
description: Deep analysis of PowerShell activity including script block logging, transcription logs, module logging, encoded commands, profile hijacking, CLM bypass, AMSI bypass, and download cradles
os_types: [windows]
tags: [execution, T1059.001, T1546.013]
severity_hint: high
---

## Steps

### check_script_block_logging
**description**: Retrieve PowerShell script block logs for suspicious command execution
**command**: `Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-PowerShell/Operational'; Id=4104} -MaxEvents 100 2>$null | Select-Object TimeCreated, @{N='ScriptBlock';E={$_.Properties[2].Value.Substring(0,[Math]::Min(300,$_.Properties[2].Value.Length))}} | Format-Table -AutoSize -Wrap`
**timeout**: 25
**requires_sudo**: false

### check_transcription_logs
**description**: Check PowerShell transcription log configuration and search for transcript files
**command**: `Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\PowerShell\Transcription' 2>$null | Select-Object EnableTranscripting, OutputDirectory, EnableInvocationHeader; $transDir = (Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\PowerShell\Transcription' -Name OutputDirectory -ErrorAction SilentlyContinue).OutputDirectory; if ($transDir -and (Test-Path $transDir)) { Get-ChildItem $transDir -Recurse -Filter '*.txt' 2>$null | Sort-Object LastWriteTime -Descending | Select-Object FullName, LastWriteTime, Length -First 20 | Format-Table -AutoSize }`
**timeout**: 20
**requires_sudo**: true

### check_module_logging
**description**: Verify PowerShell module logging configuration and retrieve logged events
**command**: `Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\PowerShell\ModuleLogging' 2>$null | Select-Object EnableModuleLogging; Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\PowerShell\ModuleLogging\ModuleNames' 2>$null; Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-PowerShell/Operational'; Id=4103} -MaxEvents 50 2>$null | Select-Object TimeCreated, @{N='Payload';E={$_.Properties[2].Value.Substring(0,[Math]::Min(200,$_.Properties[2].Value.Length))}} | Format-Table -AutoSize -Wrap`
**timeout**: 25
**requires_sudo**: false

### check_encoded_commands
**description**: Search event logs for Base64-encoded PowerShell commands
**command**: `Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-PowerShell/Operational'; Id=4104} -MaxEvents 500 2>$null | Where-Object { $_.Properties[2].Value -match '-[Ee]nc[odedCmand]*\s|[Ff]romBase64String|[Cc]onvert.*Base64|IO\.Compression|IO\.MemoryStream|Decompress' } | Select-Object TimeCreated, @{N='Script';E={$_.Properties[2].Value.Substring(0,[Math]::Min(300,$_.Properties[2].Value.Length))}} | Select-Object -First 20 | Format-Table -AutoSize -Wrap`
**timeout**: 30
**requires_sudo**: false

### check_powershell_profiles
**description**: Inspect all PowerShell profile locations for malicious modifications
**command**: `$profiles = @("$env:WINDIR\System32\WindowsPowerShell\v1.0\profile.ps1","$env:WINDIR\System32\WindowsPowerShell\v1.0\Microsoft.PowerShell_profile.ps1","$env:USERPROFILE\Documents\WindowsPowerShell\profile.ps1","$env:USERPROFILE\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1","$env:USERPROFILE\Documents\PowerShell\profile.ps1","$env:USERPROFILE\Documents\PowerShell\Microsoft.PowerShell_profile.ps1"); foreach ($p in $profiles) { if (Test-Path $p) { Write-Output "=== $p ==="; Get-Content $p 2>$null } }`
**timeout**: 15
**requires_sudo**: false

### check_constrained_language_mode_bypass
**description**: Check for Constrained Language Mode status and known bypass indicators
**command**: `Write-Output "Current Language Mode: $($ExecutionContext.SessionState.LanguageMode)"; Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\PowerShell' -Name ExecutionPolicy 2>$null; Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Environment' -Name __PSLockdownPolicy 2>$null; Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-PowerShell/Operational'; Id=4104} -MaxEvents 500 2>$null | Where-Object { $_.Properties[2].Value -match 'LanguageMode|FullLanguage|Add-Type.*-TypeDefinition|Runspace|RunspaceFactory' } | Select-Object TimeCreated -First 10`
**timeout**: 20
**requires_sudo**: false

### check_amsi_bypass_attempts
**description**: Detect Anti-Malware Scan Interface (AMSI) bypass attempts
**command**: `Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-PowerShell/Operational'; Id=4104} -MaxEvents 500 2>$null | Where-Object { $_.Properties[2].Value -match 'amsi\.dll|AmsiUtils|amsiInitFailed|AmsiScanBuffer|Disable-Amsi|Set-MpPreference.*-DisableRealtimeMonitoring|Unload-Amsi' } | Select-Object TimeCreated, @{N='Script';E={$_.Properties[2].Value.Substring(0,[Math]::Min(300,$_.Properties[2].Value.Length))}} | Select-Object -First 20 | Format-Table -AutoSize -Wrap; Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-Windows Defender/Operational'; Id=1116} -MaxEvents 20 2>$null | Where-Object { $_.Message -match 'AMSI' } | Select-Object TimeCreated | Format-Table -AutoSize`
**timeout**: 25
**requires_sudo**: false

### check_download_cradles
**description**: Identify PowerShell download cradle patterns in script block logs
**command**: `Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-PowerShell/Operational'; Id=4104} -MaxEvents 500 2>$null | Where-Object { $_.Properties[2].Value -match 'Net\.WebClient|DownloadString|DownloadFile|DownloadData|Invoke-WebRequest|Invoke-RestMethod|Start-BitsTransfer|curl\s|wget\s|IWR\s|New-Object.*Net\.Sockets' } | Select-Object TimeCreated, @{N='Script';E={$_.Properties[2].Value.Substring(0,[Math]::Min(300,$_.Properties[2].Value.Length))}} | Select-Object -First 20 | Format-Table -AutoSize -Wrap`
**timeout**: 25
**requires_sudo**: false
