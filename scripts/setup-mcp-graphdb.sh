#!/usr/bin/env bash
# Clona y buildea el MCP server de GraphDB dentro del proyecto.
# El directorio mcp-server-graphdb/ está gitignoreado.

set -euo pipefail

cd "$(dirname "$0")/.."

REPO_URL="https://github.com/keonchennl/mcp-server-graphdb.git"
DIR="mcp-server-graphdb"

if [ -d "$DIR/.git" ]; then
  echo ">> $DIR ya existe. Actualizando..."
  cd "$DIR"
  git pull
else
  echo ">> Clonando $REPO_URL..."
  git clone "$REPO_URL" "$DIR"
  cd "$DIR"
fi

echo ">> Instalando dependencias..."
npm install --ignore-scripts

echo ">> Compilando..."
npm run build

echo ">> Listo: ./$DIR/dist/index.js"
