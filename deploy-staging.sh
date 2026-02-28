#!/bin/bash
# =============================================================================
# Deploy script — Ambiente STAGING
# Uso: ./deploy-staging.sh [--migrate]
# =============================================================================

set -e

COMPOSE_FILE="docker-compose.dev.yml"
ENV_FILE=".env"
PROJECT_DIR="/var/www/sedia-dev"

cd "$PROJECT_DIR"

echo "▶ [1/4] Pulling latest changes from develop branch..."
GIT_SSH_COMMAND="ssh -i /root/.ssh/hostinger-vps-sedia" git pull origin develop

echo "▶ [2/4] Building images..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --no-cache

echo "▶ [3/4] Restarting services..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --force-recreate

if [ "$1" == "--migrate" ]; then
    echo "▶ [3b] Running migrations..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
        --profile migrate run --rm migrate
fi

echo "▶ [4/4] Reloading nginx..."
docker exec set-comprobantes-nginx nginx -s reload

echo ""
echo "✓ Staging deploy complete → https://staging.rohekawebservices.online"
echo ""
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
