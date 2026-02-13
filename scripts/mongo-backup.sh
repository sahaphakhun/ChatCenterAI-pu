#!/usr/bin/env bash

# Fail fast on any error, unset variable, or pipeline failure
set -euo pipefail

# Provide defaults while allowing overrides via environment variables
MONGO_URI="${MONGO_URI:-mongodb://localhost:27017/chatbot}"
BACKUP_ROOT="${BACKUP_ROOT:-$(pwd)/backups/mongo}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_dir="${BACKUP_ROOT}/${timestamp}"

mkdir -p "${backup_dir}"

echo "[mongo-backup] Creating dump at ${backup_dir}"
mongodump --uri="${MONGO_URI}" --out="${backup_dir}" --gzip

if [[ "${RETENTION_DAYS}" =~ ^[0-9]+$ ]] && [[ "${RETENTION_DAYS}" -ge 0 ]]; then
  find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d -mtime +"${RETENTION_DAYS}" -print0 | xargs -0r rm -rf
fi

echo "[mongo-backup] Backup completed successfully."
