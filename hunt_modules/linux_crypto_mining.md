---
id: linux_crypto_mining
name: Linux Cryptominer Detection
description: Detect cryptocurrency mining activity — high CPU processes, known miner binaries, mining pool connections, and suspicious cron jobs
os_types: [linux]
tags: [cryptomining, T1496, resource-hijacking, impact]
severity_hint: high
---

## Steps

### check_high_cpu_processes
**description**: Find processes consuming excessive CPU
**command**: `ps aux --sort=-%cpu 2>/dev/null | head -15`
**timeout**: 10
**requires_sudo**: false

### check_known_miner_names
**description**: Search for known miner binary names in running processes
**command**: `ps aux 2>/dev/null | grep -iE "xmrig|minerd|cpuminer|cgminer|bfgminer|ethminer|t-rex|nbminer|kswapd0|kworker.*mine" | grep -v grep`
**timeout**: 10
**requires_sudo**: false

### check_stratum_connections
**description**: Look for connections to mining pool protocols (stratum)
**command**: `ss -tnp 2>/dev/null | grep -iE ":3333|:4444|:5555|:7777|:8888|:9999|:14444|stratum"`
**timeout**: 10
**requires_sudo**: false

### check_miner_config_files
**description**: Search for common miner configuration files
**command**: `find /tmp /var/tmp /dev/shm /home /opt -name "config.json" -o -name "pools.txt" -o -name "*.xmr" 2>/dev/null | head -10`
**timeout**: 15
**requires_sudo**: false

### check_cron_for_miners
**description**: Search cron jobs for mining-related entries
**command**: `cat /etc/crontab /var/spool/cron/crontabs/* /etc/cron.d/* 2>/dev/null | grep -iE "xmr|mine|pool|stratum|crypto|wget.*sh|curl.*sh"`
**timeout**: 10
**requires_sudo**: true

### check_cpu_usage_anomaly
**description**: Check overall CPU usage for sustained high utilization
**command**: `uptime 2>/dev/null; mpstat 1 1 2>/dev/null || top -bn1 2>/dev/null | head -5`
**timeout**: 10
**requires_sudo**: false

### check_hugepages
**description**: Check for hugepages allocation (used by some miners for performance)
**command**: `cat /proc/meminfo 2>/dev/null | grep -i huge; sysctl vm.nr_hugepages 2>/dev/null`
**timeout**: 5
**requires_sudo**: false
