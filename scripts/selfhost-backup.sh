#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
env_file="$project_root/.env.selfhost"
output_directory=${1:-"$project_root/backups"}

if [ ! -f "$env_file" ]; then
  echo "Missing $env_file. Copy .env.selfhost.example and configure it first." >&2
  exit 1
fi

mkdir -p "$output_directory"
backup_file="$output_directory/agent-web-$(date +%Y%m%d-%H%M%S).sql"
docker compose --file "$project_root/docker-compose.yml" --env-file "$env_file" exec -T postgres sh -c \
  'pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges' > "$backup_file"

if [ ! -s "$backup_file" ]; then
  echo "Backup file was not created or is empty." >&2
  exit 1
fi
printf '%s\n' "$backup_file"
