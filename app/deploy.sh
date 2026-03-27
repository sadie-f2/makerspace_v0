#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "==> Pulling latest code"
git pull

echo "==> Building and restarting app"
docker compose up -d --build

echo "==> Deploy complete: $(date)"
