# Encrypted restic backup sidecar for Blacksmith.
#
# Backs up the Blacksmith data volume (and a pg_dump when
# DB_TYPE=postgres) to any restic repository: rest-server,
# s3, sftp, or local. All backups are encrypted client-side
# with RESTIC_PASSWORD.
FROM cgr.dev/chainguard/wolfi-base:latest

RUN apk add --no-cache \
      restic \
      postgresql-18-client \
      ca-certificates-bundle \
      tzdata

COPY contrib/backup/backup.sh /usr/local/bin/backup.sh
COPY contrib/backup/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 0755 /usr/local/bin/backup.sh /usr/local/bin/entrypoint.sh

USER 65532:65532

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
