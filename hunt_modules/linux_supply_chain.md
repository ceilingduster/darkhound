---
id: linux_supply_chain
name: Linux Supply Chain Compromise
description: Detect supply chain attack indicators — tampered packages, unofficial repositories, suspicious pip/npm packages, and build tool compromise
os_types: [linux]
tags: [supply-chain, T1195, T1072, T1059, initial-access]
severity_hint: critical
---

## Steps

### check_package_sources
**description**: Review APT/YUM repository sources for unofficial or suspicious entries
**command**: `cat /etc/apt/sources.list /etc/apt/sources.list.d/*.list 2>/dev/null; ls /etc/yum.repos.d/ 2>/dev/null; cat /etc/yum.repos.d/*.repo 2>/dev/null | grep -E "baseurl|gpgcheck" | head -30`
**timeout**: 10
**requires_sudo**: false

### check_gpg_verification
**description**: Check if package signature verification is enabled
**command**: `apt-config dump 2>/dev/null | grep -i "AllowUnauthenticated"; grep gpgcheck /etc/yum.conf /etc/dnf/dnf.conf 2>/dev/null`
**timeout**: 10
**requires_sudo**: false

### check_recently_installed_packages
**description**: List packages installed in the last 7 days
**command**: `grep "install " /var/log/dpkg.log 2>/dev/null | tail -30 || rpm -qa --last 2>/dev/null | head -30`
**timeout**: 15
**requires_sudo**: false

### check_pip_packages
**description**: List pip packages and check for known malicious names
**command**: `pip list 2>/dev/null | head -40; pip3 list 2>/dev/null | head -40`
**timeout**: 15
**requires_sudo**: false

### check_npm_global_packages
**description**: List globally installed npm packages
**command**: `npm list -g --depth=0 2>/dev/null; ls /usr/lib/node_modules/ 2>/dev/null`
**timeout**: 10
**requires_sudo**: false

### check_pip_install_locations
**description**: Find pip packages installed outside standard site-packages
**command**: `find /usr/local/lib -name "*.egg-info" -mtime -7 2>/dev/null | head -15; find /home -path "*/site-packages/*.egg-info" -mtime -7 2>/dev/null | head -15`
**timeout**: 15
**requires_sudo**: false

### check_postinstall_scripts
**description**: Look for package post-install scripts that download or execute code
**command**: `find /var/lib/dpkg/info -name "*.postinst" -newer /etc/hostname 2>/dev/null | head -10; find /var/lib/rpm -newer /etc/hostname 2>/dev/null | head -10`
**timeout**: 15
**requires_sudo**: false

### check_build_tools
**description**: Check for build tools that could be compromised (make, gcc, ld)
**command**: `which make gcc cc ld as 2>/dev/null | xargs -I{} sh -c 'echo "--- {} ---"; file {}; md5sum {}' 2>/dev/null`
**timeout**: 10
**requires_sudo**: false

### check_shared_lib_paths
**description**: Review dynamic linker configuration for library path injection
**command**: `cat /etc/ld.so.conf /etc/ld.so.conf.d/*.conf 2>/dev/null; ldconfig -p 2>/dev/null | wc -l; cat /etc/ld.so.preload 2>/dev/null`
**timeout**: 10
**requires_sudo**: false
