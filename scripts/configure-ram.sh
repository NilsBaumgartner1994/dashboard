#!/usr/bin/env bash

# configure-ram.sh – detect host RAM and write OLLAMA_MEMORY and TTS_MEMORY to .env
#
# Reads the total system RAM and allocates proportional shares to the AI containers:
#   OLLAMA_MEMORY – 80 % of host RAM (min 2 GB) for the Ollama LLM container
#   TTS_MEMORY    – 30 % of host RAM (min 2 GB) for the Qwen3-TTS container
#
# Updates (or creates) both keys in the project .env file so that
# docker compose can use them as container memory limits.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_DIR/.env"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

# ── Detect total RAM ─────────────────────────────────────────────────────────
if command -v free >/dev/null 2>&1; then
  TOTAL_RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
else
  log "WARNUNG: 'free' nicht verfügbar – verwende Fallback-Wert (4096 MB)"
  TOTAL_RAM_MB=4096
fi

# ── Calculate Ollama allocation (80 %, minimum 1 GB) ─────────────────────────
OLLAMA_RAM_MB=$(( TOTAL_RAM_MB * 80 / 100 ))
OLLAMA_RAM_GB=$(( OLLAMA_RAM_MB / 1024 ))

# Apply 2 GB minimum only when 80 % of available RAM is already >= 2 GB
# (i.e. total RAM >= 2560 MB), to avoid allocating more than what the host has.
if [ "$OLLAMA_RAM_GB" -lt 2 ] && [ "$OLLAMA_RAM_MB" -ge 2048 ]; then
  OLLAMA_RAM_GB=2
elif [ "$OLLAMA_RAM_GB" -lt 1 ]; then
  OLLAMA_RAM_GB=1
fi

OLLAMA_MEMORY="${OLLAMA_RAM_GB}g"
log "Gesamt-RAM des Hosts: ${TOTAL_RAM_MB} MB  →  Ollama-Zuteilung: ${OLLAMA_MEMORY}"

# ── Calculate TTS allocation (30 %, minimum 2 GB) ────────────────────────────
TTS_RAM_MB=$(( TOTAL_RAM_MB * 30 / 100 ))
TTS_RAM_GB=$(( TTS_RAM_MB / 1024 ))

# Apply 2 GB minimum only when 30 % of available RAM is already >= 2 GB
# (i.e. total RAM >= 6827 MB), to avoid allocating more than what the host has.
if [ "$TTS_RAM_GB" -lt 2 ] && [ "$TTS_RAM_MB" -ge 2048 ]; then
  TTS_RAM_GB=2
elif [ "$TTS_RAM_GB" -lt 1 ]; then
  TTS_RAM_GB=1
fi

TTS_MEMORY="${TTS_RAM_GB}g"
log "Gesamt-RAM des Hosts: ${TOTAL_RAM_MB} MB  →  TTS-Zuteilung: ${TTS_MEMORY}"

# ── Write to .env ─────────────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  log "WARNUNG: .env nicht gefunden in $REPO_DIR – überspringe RAM-Konfiguration"
  exit 0
fi

if grep -q "^OLLAMA_MEMORY=" "$ENV_FILE"; then
  sed -i "s/^OLLAMA_MEMORY=.*/OLLAMA_MEMORY=${OLLAMA_MEMORY}/" "$ENV_FILE"
  log "OLLAMA_MEMORY in .env aktualisiert: ${OLLAMA_MEMORY}"
else
  echo "OLLAMA_MEMORY=${OLLAMA_MEMORY}" >> "$ENV_FILE"
  log "OLLAMA_MEMORY in .env hinzugefügt: ${OLLAMA_MEMORY}"
fi

if grep -q "^TTS_MEMORY=" "$ENV_FILE"; then
  sed -i "s/^TTS_MEMORY=.*/TTS_MEMORY=${TTS_MEMORY}/" "$ENV_FILE"
  log "TTS_MEMORY in .env aktualisiert: ${TTS_MEMORY}"
else
  echo "TTS_MEMORY=${TTS_MEMORY}" >> "$ENV_FILE"
  log "TTS_MEMORY in .env hinzugefügt: ${TTS_MEMORY}"
fi
