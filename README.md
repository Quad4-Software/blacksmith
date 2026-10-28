<div align="center">
    <img src="./public/assets/img/logo.svg" alt="" width="128" align="center" />
    <h1 align="center">Blacksmith</h1>
    <p align="center">A self-hosted software forge, hardened.</p>
</div>

Blacksmith is a hard fork of [Forgejo](https://forgejo.org) (itself a
soft fork of Gitea): Git hosting, code review, issues, packages and
built-in CI/CD - rebranded and rebuilt for rootless, container-first
deployments.

## What is different

- **Quad4 void theme.** Near-black canvas, hairline borders, monochrome
  accents. `blacksmith-void`, `blacksmith-paper` and `blacksmith-auto`
  themes, void by default.
- **Hidden version.** The build version is only visible to admin users.
  The footer, `/api/v1/version`, `/api/forgejo/v1/version` and NodeInfo
  all hide it from anonymous users.
- **Hostile-agent blocking.** AI scrapers, scanners and crawlers are
  disallowed in `robots.txt` and hard-blocked at the edge.
- **Rootless distroless image.** Multi-stage Chainguard build, final
  stage `cgr.dev/chainguard/git`, nonroot uid 65532, read-only rootfs
  ready.
- **Auto-update.** Podman `auto-update` via quadlet labels, or an
  external watchtower container for compose deployments.
- **Encrypted backups.** Restic sidecar to rest-server or S3.
- **WAF front.** CrowdSec + Coraza (OWASP CRS) in front of the app.

## Build

    podman build -t blacksmith .

Requires go 1.2x and node 22+ for a local build:

    make frontend
    make backend

## Run

Single container (rootless podman):

    podman run -d --name blacksmith \
        -p 3000:3000 -p 2222:2222 \
        -v blacksmith-data:/var/lib/blacksmith \
        blacksmith

Then open http://localhost:3000 to finish the installer.

## Production

`compose.prod.yaml` ships the full stack:

- `proxy` - Caddy + Coraza WAF plugin + CrowdSec bouncer
- `crowdsec` - intrusion detection, AppSec engine (Coraza + CRS)
- `blacksmith` - the forge
- `postgres` - optional (`--profile db`)
- `backup` - encrypted restic (`--profile backup`)
- `updater` - watchtower auto-update (`--profile updater`)

    cp contrib/proxy/prod.env.example .env   # fill it in
    podman compose -f compose.prod.yaml \
        --profile db --profile backup --profile updater \
        --env-file .env up -d

For rootless podman + systemd, install `contrib/quadlets/blacksmith.container`
into `~/.config/containers/systemd/` and enable
`podman-auto-update.timer`.

## Layout

| path | contents |
| --- | --- |
| `Dockerfile` | rootless multi-stage chainguard build |
| `compose.prod.yaml` | production stack |
| `contrib/proxy/` | caddy + coraza + crowdsec-bouncer build and Caddyfile |
| `contrib/crowdsec/` | acquisition + appsec config |
| `contrib/backup/` | encrypted restic sidecar |
| `contrib/quadlets/` | podman systemd units with autoupdate |
| `docker/blacksmith/` | container entrypoint scripts |

## Upstream

Blacksmith tracks Forgejo upstream. API and `GITEA__*` / `FORGEJO__*`
environment compatibility is retained; `BLACKSMITH__*` works
everywhere those do.

Fork of Forgejo, which is a fork of Gitea, which is a fork of Gogs.
GPL-3.0-or-later.
