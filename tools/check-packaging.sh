#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose -f docker/docker-compose.yml config --quiet
docker compose -f docker/tests.compose.yml config --quiet
docker build -f docker/check.Containerfile -t albadr-check:local .
