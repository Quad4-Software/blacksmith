#!/bin/sh
# Encrypted restic backup.
#
#   RESTIC_REPOSITORY  s3:https://s3.example.com/bucket/path
#                      rest:https://rest.example.com/repo/
#                      /mnt/backups
#   RESTIC_PASSWORD    repo encryption password (required)
#
# For S3 set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY as usual.
set -eu

: "${RESTIC_REPOSITORY:?set RESTIC_REPOSITORY}"
: "${RESTIC_PASSWORD:?set RESTIC_PASSWORD}"

if ! restic snapshots >/dev/null 2>&1; then
    echo "initializing restic repository"
    restic init
fi

DATA_DIR=${DATA_DIR:-/data/blacksmith}
DUMP_DIR=$(mktemp -d)
trap 'rm -rf "${DUMP_DIR}"' EXIT

if [ "${DB_TYPE:-sqlite3}" = "postgres" ]; then
    echo "dumping postgres ${DB_NAME} from ${DB_HOST}"
    PGPASSWORD="${DB_PASSWD}" pg_dump \
        -h "${DB_HOST:-postgres}" \
        -U "${DB_USER:-blacksmith}" \
        -d "${DB_NAME:-blacksmith}" \
        -Fc -f "${DUMP_DIR}/blacksmith-db.pgdump"
    # schema-only dump of app.ini metadata is not needed; config
    # lives under the data volume and is included below.
fi

echo "restic backup ${DATA_DIR} -> ${RESTIC_REPOSITORY}"
restic backup \
    --compression "${RESTIC_COMPRESSION:-max}" \
    --exclude-caches \
    --tag blacksmith \
    "${DATA_DIR}" ${DUMP_DIR}/* 2>/dev/null || \
restic backup \
    --compression "${RESTIC_COMPRESSION:-max}" \
    --exclude-caches \
    --tag blacksmith \
    "${DATA_DIR}"

if [ -n "${RESTIC_FORGET_ARGS:-}" ]; then
    # shellcheck disable=SC2086
    restic forget --prune ${RESTIC_FORGET_ARGS}
fi

restic check --with-cache --read-data-subset=5% || true

echo "backup complete"
