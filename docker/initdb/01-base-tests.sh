#!/bin/sh
# Crea la base de tests junto a la de desarrollo (solo la primera vez que arranca el volumen).
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -c "create database \"${POSTGRES_DB}_test\";"
