#!/usr/bin/env bash
# start.sh - Starts the project in development mode (hot reload).
# Uses nvm to select the project's Node version (read from .nvmrc)
# and corepack to enable pnpm for the frontends.
#
# Services started:
#   - shell backend (NestJS)      :3000
#   - RDF backend (NestJS)        :3001
#   - GIS backend (NestJS)        :3002
#   - app_shell (Angular)         :4200
#   - rdf_explorer (Angular)      :4201
#   - rdf_gis_explorer (Angular)  :4202
#
# Usage:
#   ./start.sh                  # uses .env (Wikidata by default)
#   ./start.sh .env.custom
#   ./start.sh --env .env.custom
#
# Ctrl+C stops every service (concurrently propagates the signal).

set -euo pipefail

cd "$(dirname "$0")"

CYAN=$'\033[1;36m'
DIM=$'\033[2m'
YELLOW=$'\033[1;33m'
RESET=$'\033[0m'

ENV_FILE=".env"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) ENV_FILE="$2"; shift 2 ;;
    --env=*) ENV_FILE="${1#*=}"; shift ;;
    *) ENV_FILE="$1"; shift ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE no encontrado" >&2
  exit 1
fi

export DOTENV_CONFIG_PATH="$(realpath "$ENV_FILE")"

# Export the selected environment to every child process. Do not `source` the
# file: valid dotenv values may contain spaces or shell metacharacters.
while IFS= read -r env_line || [[ -n "$env_line" ]]; do
  env_line="${env_line%$'\r'}"
  [[ -z "$env_line" || "$env_line" == \#* || "$env_line" != *=* ]] && continue
  env_key="${env_line%%=*}"
  env_value="${env_line#*=}"
  env_key="${env_key#export }"
  if [[ "$env_value" == \"*\" && "$env_value" == *\" ]]; then
    env_value="${env_value:1:${#env_value}-2}"
  elif [[ "$env_value" == \'*\' && "$env_value" == *\' ]]; then
    env_value="${env_value:1:${#env_value}-2}"
  fi
  export "$env_key=$env_value"
done < "$DOTENV_CONFIG_PATH"

# Relative SQLite paths in environment files are repository-relative. Backends
# are launched from package-specific working directories, so normalize the
# path before concurrently starts them.
if [[ -n "${DASHBOARDS_SQLITE_PATH:-}" && "$DASHBOARDS_SQLITE_PATH" != /* ]]; then
  export DASHBOARDS_SQLITE_PATH="$(realpath -m "$DASHBOARDS_SQLITE_PATH")"
fi

echo "${CYAN}>> RDF GIS Explorer (dev)${RESET}"
echo "${DIM}   cwd: $(pwd)${RESET}"
echo "${YELLOW}   env: $ENV_FILE${RESET}"

# 1. Load nvm
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  echo "ERROR: nvm no encontrado en $NVM_DIR" >&2
  echo "       Instalar desde https://github.com/nvm-sh/nvm" >&2
  exit 1
fi
# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh"

# 2. Select the Node version from .nvmrc (install it when missing)
if [[ -f .nvmrc ]]; then
  nvm install >/dev/null
  nvm use >/dev/null
else
  echo "WARN: no hay .nvmrc, se usa la version de Node activa" >&2
fi

# 3. Enable pnpm through corepack (required by all three frontends)
corepack enable pnpm >/dev/null 2>&1 || true

# 4. Print the selected tool versions
echo "${CYAN}>> Versiones${RESET}"
echo "   node: $(node -v)"
echo "   pnpm: $(pnpm -v 2>/dev/null || echo 'missing')"

# 5. Install workspace dependencies when missing
if [[ ! -d node_modules ]]; then
  echo "${CYAN}>> Instalando dependencias del workspace...${RESET}"
  pnpm install
else
  echo "${DIM}   node_modules ya presente${RESET}"
fi

# 5b. Rebuild native modules when the Node major version changes.
#     better-sqlite3 ships a prebuilt binary tied to NODE_MODULE_VERSION,
#     so moving from Node 22 to 24 requires a rebuild.
NATIVE_MARKER=".node-version-built"
current_node_major="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
if [[ -f "$NATIVE_MARKER" && "$(cat "$NATIVE_MARKER")" == "$current_node_major" ]]; then
  echo "${DIM}   modulos nativos OK para Node $current_node_major.x${RESET}"
else
  echo "${CYAN}>> Recompilando modulos nativos para Node $current_node_major.x...${RESET}"
  pnpm rebuild
  echo "$current_node_major" > "$NATIVE_MARKER"
fi

# 6. Start every service with concurrently (Ctrl+C stops them all).
#    `npm run dev` rebuilds internal packages first because the frontends
#    resolve their exports from dist/, while switching branches may update
#    src/ without running prepare again.
echo "${CYAN}>> Iniciando 3 backends + 3 frontends (Ctrl+C para detener)${RESET}"
exec npm run dev
