# Blacksmith container image

The root `Dockerfile` builds the single official image: rootless
(uid 65532), distroless on `cgr.dev/chainguard/git`, multi-stage
with Chainguard node and go build stages.

    podman build -t blacksmith .
    podman run --rm -p 3000:3000 -p 2222:2222 \
        -v blacksmith-data:/var/lib/blacksmith blacksmith

`docker/blacksmith/` holds the POSIX sh entrypoint and setup
scripts. For production see `compose.prod.yaml` (proxy + CrowdSec
+ AppSec WAF), `contrib/quadlets/` for systemd user units with
`podman auto-update`, and `contrib/backup/` for encrypted restic
backups.
