#!/bin/sh
# Sleep-loop scheduler: runs backup.sh on start, then every
# BACKUP_INTERVAL seconds (default 86400 = daily).
set -eu

INTERVAL=${BACKUP_INTERVAL:-86400}

while true; do
    /usr/local/bin/backup.sh || echo "backup run failed" >&2
    sleep "${INTERVAL}"
done
