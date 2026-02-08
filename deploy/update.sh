#!/bin/bash
# Update NanoClaw to latest version
# Run from ~/nanoclaw directory

set -e

echo "Pulling latest images..."
docker compose pull

echo "Restarting with new images..."
docker compose up -d --remove-orphans

echo "Cleaning up old images..."
docker image prune -f

echo ""
echo "Update complete!"
echo "Check logs with: docker compose logs -f"
