---
id: linux_lateral_movement
name: Linux Lateral Movement Detection
description: Identify lateral movement indicators — SSH tunnels, remote execution tools, credential reuse, and pivot activity
os_types: [linux]
tags: [lateral-movement, T1021, T1563, T1072, T1570]
severity_hint: high
---

## Steps

### check_ssh_sessions
**description**: List active SSH sessions (inbound and outbound)
**command**: `ss -tnp 2>/dev/null | grep ":22"; who 2>/dev/null; w 2>/dev/null`
**timeout**: 10
**requires_sudo**: false

### check_ssh_tunnels
**description**: Detect SSH port forwarding and tunnel processes
**command**: `ps aux 2>/dev/null | grep -E "ssh.*-[LRD]" | grep -v grep; ss -tlnp 2>/dev/null | grep ssh`
**timeout**: 10
**requires_sudo**: false

### check_ssh_known_hosts
**description**: Review SSH known_hosts for lateral movement targets
**command**: `find /home /root -name "known_hosts" -exec sh -c 'echo "=== {} ==="; cat {}' \; 2>/dev/null`
**timeout**: 10
**requires_sudo**: true

### check_ssh_agent
**description**: Check for running SSH agents and forwarded agent sockets
**command**: `find /tmp -name "agent.*" -o -name "ssh-*" 2>/dev/null; env | grep SSH_AUTH_SOCK 2>/dev/null; ps aux | grep ssh-agent | grep -v grep 2>/dev/null`
**timeout**: 10
**requires_sudo**: false

### check_remote_execution_tools
**description**: Check for psexec, ansible, puppet, chef, salt, or similar remote execution tools
**command**: `ps aux 2>/dev/null | grep -iE "ansible|puppet|chef|salt-|psexec|pdsh|fabric" | grep -v grep; which ansible pssh pdsh 2>/dev/null`
**timeout**: 10
**requires_sudo**: false

### check_rdp_vnc_connections
**description**: Look for RDP or VNC connections (uncommon on Linux)
**command**: `ss -tnp 2>/dev/null | grep -E ":(3389|5900|5901|5902)"; ps aux 2>/dev/null | grep -iE "xrdp|vnc|x11vnc" | grep -v grep`
**timeout**: 10
**requires_sudo**: false

### check_smb_nfs_mounts
**description**: List active SMB/CIFS and NFS mounts (lateral file access)
**command**: `mount 2>/dev/null | grep -iE "cifs|nfs|smb"; smbstatus 2>/dev/null | head -20`
**timeout**: 10
**requires_sudo**: false

### check_credential_files
**description**: Search for credential files and password stores
**command**: `find /home /root /tmp -name ".git-credentials" -o -name ".netrc" -o -name ".pgpass" -o -name "credentials" -o -name "*.pem" 2>/dev/null | head -15`
**timeout**: 15
**requires_sudo**: true

### check_bash_history_lateral
**description**: Search command history for lateral movement commands
**command**: `find /home /root -name ".bash_history" -exec grep -lE "ssh |scp |rsync |curl.*@|wget.*@|nc |ncat " {} \; 2>/dev/null | head -5`
**timeout**: 15
**requires_sudo**: true
