#!/bin/sh
set -eu

if [ "$#" -ne 2 ] || [ "$2" != "--confirm-restore" ]; then
  echo "Usage: $0 <backup.sql> --confirm-restore" >&2
  echo "Restore replaces the current database." >&2
  exit 1
fi

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
env_file="$project_root/.env.selfhost"
backup_file=$1

if [ ! -f "$env_file" ] || [ ! -s "$backup_file" ]; then
  echo "The environment file is missing, or the backup file is missing/empty." >&2
  exit 1
fi

docker compose --file "$project_root/docker-compose.yml" --env-file "$env_file" stop web
docker compose --file "$project_root/docker-compose.yml" --env-file "$env_file" exec -T postgres sh -c \
  'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 --command "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
docker compose --file "$project_root/docker-compose.yml" --env-file "$env_file" exec -T postgres sh -c \
  'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1' < "$backup_file"
docker compose --file "$project_root/docker-compose.yml" --env-file "$env_file" start web

printf 'Restore completed from %s\n' "$backup_file"
