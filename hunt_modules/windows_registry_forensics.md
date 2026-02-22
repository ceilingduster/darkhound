---
id: windows_registry_forensics
name: Windows Registry Forensics
description: Forensic analysis of Windows registry artifacts including MRU lists, UserAssist, ShimCache, Amcache, BAM/DAM, typed URLs, network profiles, and USB history
os_types: [windows]
tags: [forensics, T1112, T1547.001]
severity_hint: medium
---

## Steps

### check_mru_lists
**description**: Enumerate Most Recently Used (MRU) lists for recent file and application activity
**command**: `Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\RecentDocs' 2>$null | Select-Object * -ExcludeProperty PS*; Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\ComDlg32\OpenSavePidlMRU' 2>$null | ForEach-Object { [PSCustomObject]@{Extension=$_.PSChildName; Count=$_.ValueCount} }`
**timeout**: 15
**requires_sudo**: false

### check_userassist
**description**: Decode UserAssist registry keys to reveal program execution history
**command**: `Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\UserAssist' 2>$null | ForEach-Object { Get-ChildItem "$($_.PSPath)\Count" 2>$null } | ForEach-Object { $_.GetValueNames() | Where-Object { $_ -ne '' } | ForEach-Object { $decoded = $_ -creplace '[A-Za-z]', { [char]((([int][char]$_.Value - 65 + 13) % 26) + ([int][char]$_.Value -band 32) + 65) }; [PSCustomObject]@{Entry=$decoded} } } | Select-Object -First 30 | Format-Table -AutoSize`
**timeout**: 20
**requires_sudo**: false

### check_shimcache
**description**: Parse AppCompatCache (ShimCache) for evidence of program execution
**command**: `$regPath = 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\AppCompatCache'; $data = (Get-ItemProperty $regPath -Name AppCompatCache -ErrorAction SilentlyContinue).AppCompatCache; if ($data) { Write-Output "ShimCache data found: $($data.Length) bytes. Use external tool for full parse."; reg query 'HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\AppCompatCache' 2>$null | Select-Object -First 5 } else { Write-Output 'No ShimCache data found' }`
**timeout**: 15
**requires_sudo**: true

### check_amcache
**description**: Read Amcache entries for application execution and installation records
**command**: `if (Test-Path 'C:\Windows\AppCompat\Programs\Amcache.hve') { Write-Output 'Amcache.hve found'; Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Appx\AppxAllUserStore\Applications\*' 2>$null | Select-Object PSChildName -First 20 }; Get-ChildItem 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall' 2>$null | ForEach-Object { Get-ItemProperty $_.PSPath 2>$null } | Where-Object { $_.InstallDate } | Select-Object DisplayName, InstallDate, Publisher | Sort-Object InstallDate -Descending | Select-Object -First 20 | Format-Table -AutoSize`
**timeout**: 20
**requires_sudo**: true

### check_bam_dam
**description**: Query Background Activity Moderator and Desktop Activity Moderator for execution evidence
**command**: `Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\bam\State\UserSettings\*' 2>$null | ForEach-Object { $sid = $_.PSChildName; $_.PSObject.Properties | Where-Object { $_.Name -match '\\' -and $_.Name -notmatch 'PS' } | ForEach-Object { [PSCustomObject]@{SID=$sid; Program=$_.Name} } } | Select-Object -First 30 | Format-Table -AutoSize -Wrap`
**timeout**: 15
**requires_sudo**: true

### check_typed_urls_paths
**description**: Retrieve typed URLs from Internet Explorer/Edge and typed paths from Explorer
**command**: `Get-ItemProperty 'HKCU:\Software\Microsoft\Internet Explorer\TypedURLs' 2>$null | Select-Object * -ExcludeProperty PS*; Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\TypedPaths' 2>$null | Select-Object * -ExcludeProperty PS*`
**timeout**: 10
**requires_sudo**: false

### check_network_profiles
**description**: Enumerate stored network profiles with first and last connection timestamps
**command**: `Get-ChildItem 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\NetworkList\Profiles' 2>$null | ForEach-Object { $props = Get-ItemProperty $_.PSPath 2>$null; [PSCustomObject]@{ProfileName=$props.ProfileName; Description=$props.Description; Managed=$props.Managed; Category=$props.Category; DateCreated=($props.DateCreated -join '-'); DateLastConnected=($props.DateLastConnected -join '-')} } | Format-Table -AutoSize`
**timeout**: 15
**requires_sudo**: false

### check_usb_device_history
**description**: Enumerate USB device connection history from USBSTOR registry keys
**command**: `Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Enum\USBSTOR' 2>$null | ForEach-Object { Get-ChildItem $_.PSPath 2>$null | ForEach-Object { $props = Get-ItemProperty $_.PSPath 2>$null; [PSCustomObject]@{Device=$props.FriendlyName; Class=$props.Class; Driver=$props.Driver; ContainerID=$props.ContainerID} } } | Where-Object { $_.Device } | Format-Table -AutoSize -Wrap`
**timeout**: 15
**requires_sudo**: true
