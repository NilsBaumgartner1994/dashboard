#!/usr/bin/env bash

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_FILE="${BACKUP_FILE:-$REPO_DIR/../envCopy}"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

log "Prüfe auf Git-Updates in $REPO_DIR"
cd "$REPO_DIR"

if [ ! -f .env ]; then
  echo "Fehler: .env wurde in $REPO_DIR nicht gefunden." >&2
  exit 1
fi

git fetch --quiet

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "@{u}")

if [ "$LOCAL" = "$REMOTE" ]; then
  log "Keine neuen Änderungen gefunden – nichts zu tun"
  exit 0
fi

NON_FRONTEND_CHANGES=$(git diff --name-only HEAD..@{u} | grep -cv '^apps/frontend/' || true)

if [ "$NON_FRONTEND_CHANGES" -eq 0 ]; then
  log "Nur Frontend-Änderungen gefunden – überspringe Docker-Rebuild"
  exit 0
fi

log "Änderungen außerhalb von apps/frontend gefunden – starte Update"

log "Container werden gestoppt (docker compose down)"
docker compose down

log "Sichere .env nach $BACKUP_FILE"
cp .env "$BACKUP_FILE"

log "Hole neue Änderungen (git pull --ff-only)"
git pull --ff-only

log "Stelle .env aus Backup wieder her"
cp "$BACKUP_FILE" .env

log "Installiere Abhängigkeiten (yarn)"
yarn

log "Baue Anwendung (yarn build)"
yarn build

log "Baue Images neu (docker compose build)"
docker compose build

log "Starte Container im Hintergrund (docker compose up -d)"
docker compose up -d

log "Update erfolgreich abgeschlossen"
