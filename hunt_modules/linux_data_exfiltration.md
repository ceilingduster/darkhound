---
id: linux_data_exfiltration
name: Linux Data Exfiltration Detection
description: Hunt for data staging, compression, encoding, and exfiltration channels — DNS tunneling, unusual outbound traffic, and archive creation
os_types: [linux]
tags: [exfiltration, T1048, T1041, T1567, T1560, collection]
severity_hint: critical
---

## Steps

### check_large_outbound_transfers
**description**: Identify processes with large outbound data transfers
**command**: `ss -tnp 2>/dev/null | awk '$2 > 100000 {print}' | head -15; ss -tnp state established 2>/dev/null | grep -v "127.0.0.1" | head -20`
**timeout**: 10
**requires_sudo**: false

### check_dns_tunneling
**description**: Look for DNS tunneling indicators — high volume DNS, long query names
**command**: `ss -unp 2>/dev/null | grep ":53"; ps aux 2>/dev/null | grep -iE "iodine|dns2tcp|dnscat" | grep -v grep`
**timeout**: 10
**requires_sudo**: false

### check_recent_archives
**description**: Find recently created archive files (staging for exfiltration)
**command**: `find /tmp /var/tmp /home /root /dev/shm -type f \( -name "*.tar*" -o -name "*.zip" -o -name "*.7z" -o -name "*.rar" -o -name "*.gz" -o -name "*.bz2" \) -mtime -3 2>/dev/null`
**timeout**: 15
**requires_sudo**: false

### check_encoding_tools
**description**: Check for recent use of encoding/encryption tools (data prep for exfil)
**command**: `ps aux 2>/dev/null | grep -iE "base64|openssl enc|gpg|xxd|uuencode" | grep -v grep; history 2>/dev/null | grep -iE "base64|openssl enc|tar.*gz|zip" | tail -10`
**timeout**: 10
**requires_sudo**: false

### check_unusual_outbound_ports
**description**: Detect outbound connections on unusual ports
**command**: `ss -tnp state established 2>/dev/null | grep -v "127.0.0.1" | awk '{print $5}' | grep -vE ":(80|443|22|53|25|587|993|143)$" | sort | head -20`
**timeout**: 10
**requires_sudo**: false

### check_icmp_exfil
**description**: Look for ICMP tunneling processes
**command**: `ps aux 2>/dev/null | grep -iE "ping -[^c]|icmp|ptunnel|hans" | grep -v grep; ss -p 2>/dev/null | grep icmp`
**timeout**: 10
**requires_sudo**: false

### check_cloud_storage_connections
**description**: Detect connections to cloud storage services
**command**: `ss -tnp 2>/dev/null | grep -v "127.0.0.1"; ps aux 2>/dev/null | grep -iE "rclone|s3cmd|aws s3|gsutil|azcopy|mega-" | grep -v grep`
**timeout**: 10
**requires_sudo**: false

### check_sensitive_file_access
**description**: Look for recent access to sensitive data directories
**command**: `find /etc/shadow /etc/gshadow /etc/ssl/private /root/.ssh -newer /tmp 2>/dev/null; lsof 2>/dev/null | grep -E "/etc/shadow|\.ssh/id_" | head -10`
**timeout**: 15
**requires_sudo**: true

### check_clipboard_and_screen
**description**: Check for screen capture or clipboard exfiltration tools
**command**: `ps aux 2>/dev/null | grep -iE "xclip|xdotool|scrot|import|ffmpeg.*x11grab|script -q" | grep -v grep`
**timeout**: 10
**requires_sudo**: false
