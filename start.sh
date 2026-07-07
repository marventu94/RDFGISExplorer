#!/usr/bin/env bash
# start.sh - Arranca el proyecto en modo dev (hot reload).
# Usa nvm para fijar la version de Node del proyecto (leida de .nvmrc)
# y corepack para habilitar pnpm en los frontends.
#
# Servicios levantados:
#   - backend (NestJS)            :3000
#   - app_shell (Angular)         :4200
#   - rdf_explorer (Angular)      :4201
#   - rdf_gis_explorer (Angular)  :4202
#
# Uso:
#   ./start.sh                  # usa .env (Wikidata por defecto)
#   ./start.sh .env.graphdb     # usa .env.graphdb
#   ./start.sh --env .env.graphdb
#
# Ctrl+C detiene todos los servicios (concurrently propaga la senal).

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

echo "${CYAN}>> RDF GIS Explorer (dev)${RESET}"
echo "${DIM}   cwd: $(pwd)${RESET}"
echo "${YELLOW}   env: $ENV_FILE${RESET}"

# 1. Cargar nvm
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  echo "ERROR: nvm no encontrado en $NVM_DIR" >&2
  echo "       Instalar desde https://github.com/nvm-sh/nvm" >&2
  exit 1
fi
# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh"

# 2. Asegurar Node del .nvmrc (instala si falta)
if [[ -f .nvmrc ]]; then
  nvm install >/dev/null
  nvm use >/dev/null
else
  echo "WARN: no hay .nvmrc, se usa la version de Node activa" >&2
fi

# 3. Habilitar pnpm via corepack (lo requieren los 3 frontends)
corepack enable pnpm >/dev/null 2>&1 || true

# 4. Resumen de versiones
echo "${CYAN}>> Versiones${RESET}"
echo "   node: $(node -v)"
echo "   pnpm: $(pnpm -v 2>/dev/null || echo 'missing')"

# 5. Instalar dependencias del workspace si faltan
if [[ ! -d node_modules ]]; then
  echo "${CYAN}>> Instalando dependencias del workspace...${RESET}"
  pnpm install
else
  echo "${DIM}   node_modules ya presente${RESET}"
fi

# 5b. Recompilar modulos nativos si la major version de Node cambio.
#     (better-sqlite3 viene con binario prebuilt por NODE_MODULE_VERSION;
#      al saltar de Node 22 -> 24 hay que recompilar.)
NATIVE_MARKER=".node-version-built"
current_node_major="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
if [[ -f "$NATIVE_MARKER" && "$(cat "$NATIVE_MARKER")" == "$current_node_major" ]]; then
  echo "${DIM}   modulos nativos OK para Node $current_node_major.x${RESET}"
else
  echo "${CYAN}>> Recompilando modulos nativos para Node $current_node_major.x...${RESET}"
  pnpm rebuild
  echo "$current_node_major" > "$NATIVE_MARKER"
fi

# 6. Arrancar todos los servicios con concurrently (Ctrl+C detiene todos)
echo "${CYAN}>> Iniciando backend + 3 frontends (Ctrl+C para detener)${RESET}"
exec npm run dev
