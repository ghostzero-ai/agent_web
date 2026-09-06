param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,

  [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"
if (-not $ConfirmRestore) {
  throw "Restore replaces the current database. Re-run with -ConfirmRestore after verifying the target and backup."
}

$resolvedBackup = (Resolve-Path -LiteralPath $BackupFile -ErrorAction Stop).Path
if (-not (Test-Path -LiteralPath $resolvedBackup -PathType Leaf)) {
  throw "Backup file does not exist: $resolvedBackup"
}
if ((Get-Item -LiteralPath $resolvedBackup).Length -eq 0) {
  throw "Backup file is empty: $resolvedBackup"
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$composeFile = Join-Path $projectRoot "docker-compose.yml"
$envFile = Join-Path $projectRoot ".env.selfhost"
if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
  throw "Missing $envFile."
}

docker compose --file $composeFile --env-file $envFile stop web
if ($LASTEXITCODE -ne 0) {
  throw "Could not stop the web service; restore was not started."
}

docker compose --file $composeFile --env-file $envFile exec -T postgres sh -c 'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 --command "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
if ($LASTEXITCODE -ne 0) {
  throw "Could not reset the target database. Existing data was not restored."
}

Get-Content -LiteralPath $resolvedBackup -Raw -Encoding utf8 |
  docker compose --file $composeFile --env-file $envFile exec -T postgres sh -c 'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1'
if ($LASTEXITCODE -ne 0) {
  throw "Restore failed with exit code $LASTEXITCODE. Keep the backup file and inspect the container logs."
}

docker compose --file $composeFile --env-file $envFile start web
if ($LASTEXITCODE -ne 0) {
  throw "Database restore completed, but the web service did not restart."
}

Write-Output "Restore completed from $resolvedBackup"
