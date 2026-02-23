#!/bin/bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml down
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up -d
