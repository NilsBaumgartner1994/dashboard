#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bash "$SCRIPT_DIR/apps/backend/install_docker.sh"
bash "$SCRIPT_DIR/setup_sensor_installation.sh"
