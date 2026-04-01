#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "==> Pulling latest code"
git pull

echo "==> Building and restarting app"
COMMIT_SHA=$(git rev-parse --short HEAD)
docker compose build --build-arg COMMIT_SHA="$COMMIT_SHA"
docker compose up -d

echo "==> Deploy complete: $(date)"
