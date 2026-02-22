---
id: linux_container_security
name: Linux Container Security Hunt
description: Assess Docker and container runtime security — exposed APIs, privileged containers, escape vectors, and image anomalies
os_types: [linux]
tags: [container, docker, T1610, T1611, T1613, lateral-movement]
severity_hint: high
---

## Steps

### check_docker_info
**description**: Enumerate Docker daemon configuration and version
**command**: `docker info 2>/dev/null | head -40`
**timeout**: 10
**requires_sudo**: false

### check_running_containers
**description**: List all running containers with resource details
**command**: `docker ps --format "table {{.ID}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}\t{{.Names}}" 2>/dev/null`
**timeout**: 10
**requires_sudo**: false

### check_privileged_containers
**description**: Identify containers running in privileged mode
**command**: `docker ps -q 2>/dev/null | xargs -I{} docker inspect --format '{{.Name}} privileged={{.HostConfig.Privileged}} pid={{.HostConfig.PidMode}} net={{.HostConfig.NetworkMode}}' {} 2>/dev/null`
**timeout**: 15
**requires_sudo**: false

### check_container_mounts
**description**: List containers with host filesystem mounts (escape risk)
**command**: `docker ps -q 2>/dev/null | xargs -I{} docker inspect --format '{{.Name}} {{range .Mounts}}{{.Source}}:{{.Destination}} {{end}}' {} 2>/dev/null`
**timeout**: 15
**requires_sudo**: false

### check_docker_socket
**description**: Check if Docker socket is exposed or mounted into containers
**command**: `ls -la /var/run/docker.sock 2>/dev/null; docker ps -q 2>/dev/null | xargs -I{} docker inspect --format '{{.Name}} {{range .Mounts}}{{if eq .Destination "/var/run/docker.sock"}}DOCKER_SOCKET_MOUNTED{{end}}{{end}}' {} 2>/dev/null`
**timeout**: 10
**requires_sudo**: false

### check_docker_api_exposure
**description**: Check if Docker API is listening on a network port
**command**: `ss -tlnp 2>/dev/null | grep -E ":2375|:2376"; cat /etc/docker/daemon.json 2>/dev/null`
**timeout**: 10
**requires_sudo**: false

### check_container_capabilities
**description**: Identify containers with extra Linux capabilities
**command**: `docker ps -q 2>/dev/null | xargs -I{} docker inspect --format '{{.Name}} CapAdd={{.HostConfig.CapAdd}} CapDrop={{.HostConfig.CapDrop}}' {} 2>/dev/null`
**timeout**: 15
**requires_sudo**: false

### check_docker_images
**description**: List local images and check for untagged/suspicious images
**command**: `docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}" 2>/dev/null | head -30`
**timeout**: 10
**requires_sudo**: false

### check_container_processes
**description**: Show processes running inside each container
**command**: `docker ps -q 2>/dev/null | head -5 | xargs -I{} sh -c 'echo "--- {} ---"; docker top {} 2>/dev/null'`
**timeout**: 20
**requires_sudo**: false
