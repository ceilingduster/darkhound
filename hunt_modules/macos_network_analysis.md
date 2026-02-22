---
id: macos_network_analysis
name: macOS Network Analysis
description: Analyze network connections, listening services, DNS activity, and firewall configuration on macOS hosts
os_types: [macos]
tags: [network, T1071, T1095, T1572]
severity_hint: medium
---

## Steps

### check_listening_ports
**description**: List all listening TCP and UDP ports with associated processes
**command**: `lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null; echo "=== UDP ==="; lsof -iUDP -P -n 2>/dev/null | head -30`
**timeout**: 15
**requires_sudo**: true

### check_established_connections
**description**: Show all established network connections and their associated processes
**command**: `lsof -iTCP -sTCP:ESTABLISHED -P -n 2>/dev/null | head -50; echo "=== netstat ==="; netstat -anp tcp 2>/dev/null | grep ESTABLISHED | head -30`
**timeout**: 15
**requires_sudo**: true

### check_dns_cache
**description**: Dump the local DNS resolver cache for recently resolved domains
**command**: `log show --predicate 'process == "mDNSResponder"' --info --last 1h 2>/dev/null | grep -i 'query' | tail -40; dscacheutil -cachedump -entries Host 2>/dev/null | head -40`
**timeout**: 20
**requires_sudo**: false

### check_network_interfaces
**description**: List all network interfaces and their configurations including promiscuous mode
**command**: `ifconfig -a 2>/dev/null; echo "=== Routes ==="; netstat -rn 2>/dev/null | head -20; echo "=== Promiscuous check ==="; ifconfig 2>/dev/null | grep -B5 PROMISC`
**timeout**: 10
**requires_sudo**: false

### check_firewall_status
**description**: Check the macOS application firewall and packet filter status
**command**: `/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null; /usr/libexec/ApplicationFirewall/socketfilterfw --listapps 2>/dev/null | head -30; echo "=== PF status ==="; pfctl -s info 2>/dev/null; pfctl -s rules 2>/dev/null | head -20`
**timeout**: 15
**requires_sudo**: true

### check_proxy_settings
**description**: Check system proxy configurations that could indicate traffic redirection
**command**: `networksetup -listallnetworkservices 2>/dev/null | while read svc; do echo "=== $svc ==="; networksetup -getwebproxy "$svc" 2>/dev/null; networksetup -getsecurewebproxy "$svc" 2>/dev/null; networksetup -getsocksfirewallproxy "$svc" 2>/dev/null; done; scutil --proxy 2>/dev/null`
**timeout**: 15
**requires_sudo**: false
