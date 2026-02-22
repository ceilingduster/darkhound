---
id: windows_ad_compromise
name: Active Directory Compromise
description: Detect Active Directory attack techniques including Kerberoasting, AS-REP roasting, DCSync, golden ticket attacks, DCShadow, AdminSDHolder abuse, GPO manipulation, trust exploitation, and privileged group changes
os_types: [windows]
tags: [credential-access, lateral-movement, T1558, T1207, T1003.006]
severity_hint: critical
---

## Steps

### check_kerberoasting
**description**: Detect Kerberoasting activity by looking for excessive TGS requests for service accounts
**command**: `Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4769} -MaxEvents 500 2>$null | Where-Object { $_.Properties[5].Value -eq '0x17' -or $_.Properties[5].Value -eq '0x12' } | Select-Object TimeCreated, @{N='ServiceName';E={$_.Properties[0].Value}}, @{N='ClientAddress';E={$_.Properties[6].Value}}, @{N='EncryptionType';E={$_.Properties[5].Value}}, @{N='TicketOptions';E={$_.Properties[4].Value}} | Select-Object -First 30 | Format-Table -AutoSize`
**timeout**: 25
**requires_sudo**: true

### check_asrep_roasting
**description**: Identify AS-REP roasting attempts targeting accounts without Kerberos pre-authentication
**command**: `Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4768} -MaxEvents 300 2>$null | Where-Object { $_.Properties[6].Value -eq '0x0' } | Select-Object TimeCreated, @{N='TargetUser';E={$_.Properties[0].Value}}, @{N='TargetDomain';E={$_.Properties[1].Value}}, @{N='ClientAddress';E={$_.Properties[7].Value}}, @{N='ResultCode';E={$_.Properties[6].Value}} | Select-Object -First 30 | Format-Table -AutoSize; Get-ADUser -Filter {DoesNotRequirePreAuth -eq $true} -Properties DoesNotRequirePreAuth 2>$null | Select-Object SamAccountName, DistinguishedName`
**timeout**: 25
**requires_sudo**: true

### check_dcsync_indicators
**description**: Detect DCSync replication requests from non-domain-controller sources
**command**: `Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4662} -MaxEvents 500 2>$null | Where-Object { $_.Message -match '1131f6aa-9c07-11d1-f79f-00c04fc2dcd2|1131f6ad-9c07-11d1-f79f-00c04fc2dcd2|89e95b76-444d-4c62-991a-0facbeda640c' } | Select-Object TimeCreated, @{N='SubjectUser';E={$_.Properties[1].Value}}, @{N='SubjectDomain';E={$_.Properties[2].Value}}, @{N='ObjectType';E={$_.Properties[9].Value}} | Select-Object -First 20 | Format-Table -AutoSize`
**timeout**: 25
**requires_sudo**: true

### check_golden_ticket_indicators
**description**: Search for golden ticket usage via TGT anomalies and Kerberos event discrepancies
**command**: `Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4768} -MaxEvents 200 2>$null | Where-Object { $_.Properties[3].Value -match '0x40810000|0x60810010' } | Select-Object TimeCreated, @{N='User';E={$_.Properties[0].Value}}, @{N='Domain';E={$_.Properties[1].Value}}, @{N='ClientAddress';E={$_.Properties[7].Value}}, @{N='TicketOptions';E={$_.Properties[3].Value}} | Select-Object -First 20 | Format-Table -AutoSize; Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4769} -MaxEvents 200 2>$null | Where-Object { $_.Properties[4].Value -match '0x40810000' } | Select-Object TimeCreated, @{N='ServiceName';E={$_.Properties[0].Value}}, @{N='ClientAddress';E={$_.Properties[6].Value}} | Select-Object -First 10 | Format-Table -AutoSize`
**timeout**: 30
**requires_sudo**: true

### check_dcshadow_detection
**description**: Detect DCShadow attacks by identifying rogue domain controller registration
**command**: `Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4742} -MaxEvents 100 2>$null | Where-Object { $_.Message -match 'ServicePrincipalNames.*GC/|ServicePrincipalNames.*E3514235-4B06' } | Select-Object TimeCreated, @{N='Details';E={$_.Message.Substring(0,[Math]::Min(300,$_.Message.Length))}} | Select-Object -First 10 | Format-Table -AutoSize -Wrap; Get-WinEvent -FilterHashtable @{LogName='Security'; Id=5137} -MaxEvents 50 2>$null | Where-Object { $_.Message -match 'nTDSDSA' } | Select-Object TimeCreated, @{N='Details';E={$_.Message.Substring(0,[Math]::Min(200,$_.Message.Length))}} | Format-Table -AutoSize -Wrap`
**timeout**: 25
**requires_sudo**: true

### check_adminsdholder_modifications
**description**: Detect AdminSDHolder object tampering for persistent privileged access
**command**: `Get-WinEvent -FilterHashtable @{LogName='Security'; Id=5136} -MaxEvents 200 2>$null | Where-Object { $_.Message -match 'AdminSDHolder' } | Select-Object TimeCreated, @{N='Details';E={$_.Message.Substring(0,[Math]::Min(300,$_.Message.Length))}} | Select-Object -First 10 | Format-Table -AutoSize -Wrap; Get-ADObject -Filter {Name -eq 'AdminSDHolder'} -Properties nTSecurityDescriptor, whenChanged 2>$null | Select-Object DistinguishedName, whenChanged`
**timeout**: 20
**requires_sudo**: true

### check_gpo_abuse
**description**: Review recent Group Policy Object modifications for potential abuse
**command**: `Get-WinEvent -FilterHashtable @{LogName='Security'; Id=5136,5137,5141} -MaxEvents 200 2>$null | Where-Object { $_.Message -match 'groupPolicyContainer|Group Policy' } | Select-Object TimeCreated, Id, @{N='Details';E={$_.Message.Substring(0,[Math]::Min(250,$_.Message.Length))}} | Select-Object -First 20 | Format-Table -AutoSize -Wrap; Get-GPO -All 2>$null | Select-Object DisplayName, ModificationTime, Owner | Sort-Object ModificationTime -Descending | Select-Object -First 15 | Format-Table -AutoSize`
**timeout**: 25
**requires_sudo**: true

### check_trust_relationships
**description**: Enumerate domain and forest trust relationships for anomalous trusts
**command**: `Get-ADTrust -Filter * 2>$null | Select-Object Name, Direction, TrustType, DisallowTransivity, ForestTransitive, SelectiveAuthentication, IntraForest, SIDFilteringForestAware | Format-Table -AutoSize; nltest /trusted_domains 2>$null`
**timeout**: 15
**requires_sudo**: true

### check_privileged_group_changes
**description**: Monitor changes to privileged AD groups such as Domain Admins, Enterprise Admins, and Schema Admins
**command**: `Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4728,4729,4732,4733,4756,4757} -MaxEvents 100 2>$null | Select-Object TimeCreated, Id, @{N='GroupName';E={$_.Properties[2].Value}}, @{N='MemberSID';E={$_.Properties[1].Value}}, @{N='SubjectUser';E={$_.Properties[6].Value}} | Format-Table -AutoSize; Get-ADGroupMember 'Domain Admins' 2>$null | Select-Object Name, SamAccountName, objectClass; Get-ADGroupMember 'Enterprise Admins' 2>$null | Select-Object Name, SamAccountName, objectClass`
**timeout**: 25
**requires_sudo**: true
