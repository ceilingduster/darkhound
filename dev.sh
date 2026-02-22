#!/bin/bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml down -v
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up -d
