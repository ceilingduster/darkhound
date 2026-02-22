---
id: linux_network
name: Linux Network Threat Hunting
description: Identify suspicious network connections, listeners, and lateral movement indicators
os_types: [linux]
tags: [network, T1049, T1571, T1095, T1219, lateral-movement]
severity_hint: high
---

## Steps

### check_listening_ports
**description**: List all listening TCP/UDP ports and associated processes
**command**: `ss -tlnpu 2>/dev/null || netstat -tlnpu 2>/dev/null`
**timeout**: 10
**requires_sudo**: false

### check_established_connections
**description**: Show all established connections with process names
**command**: `ss -tnpu state established 2>/dev/null || netstat -tnpu 2>/dev/null | grep ESTABLISHED`
**timeout**: 10
**requires_sudo**: false

### check_network_interfaces
**description**: List all network interfaces and their configuration
**command**: `ip addr show 2>/dev/null || ifconfig -a 2>/dev/null`
**timeout**: 10
**requires_sudo**: false

### check_routing_table
**description**: Display routing table for unusual routes
**command**: `ip route show 2>/dev/null || route -n 2>/dev/null`
**timeout**: 10
**requires_sudo**: false

### check_arp_cache
**description**: Show ARP cache for reconnaissance indicators
**command**: `arp -an 2>/dev/null || ip neigh show 2>/dev/null`
**timeout**: 10
**requires_sudo**: false

### check_hosts_file
**description**: Check /etc/hosts for DNS hijacking
**command**: `cat /etc/hosts 2>/dev/null`
**timeout**: 5
**requires_sudo**: false

### check_resolv_conf
**description**: Inspect DNS resolver configuration for hijacking
**command**: `cat /etc/resolv.conf 2>/dev/null`
**timeout**: 5
**requires_sudo**: false

### check_firewall_rules
**description**: List iptables/nftables rules
**command**: `iptables -L -n 2>/dev/null || nft list ruleset 2>/dev/null`
**timeout**: 10
**requires_sudo**: false

### check_unusual_sockets
**description**: Find processes with raw sockets or unusual socket types
**command**: `lsof -i 2>/dev/null | grep -v LISTEN | head -50`
**timeout**: 15
**requires_sudo**: false

### check_network_namespaces
**description**: List network namespaces (container/sandbox indicators)
**command**: `ip netns list 2>/dev/null`
**timeout**: 5
**requires_sudo**: false
