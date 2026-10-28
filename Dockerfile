# syntax=docker/dockerfile:1
#
# Blacksmith - rootless, distroless image built on Chainguard free images.
#
#   podman build -t blacksmith .
#
# The final image is cgr.dev/chainguard/git (dash shell, git, git-lfs,
# openssh client, nonroot uid 65532). No package manager, no root.

FROM cgr.dev/chainguard/node:latest-dev AS frontend
USER root
RUN apk add --no-cache make git bash
WORKDIR /src
COPY . .
RUN make frontend

FROM cgr.dev/chainguard/go:latest-dev AS backend
USER root
RUN apk add --no-cache make bash gcc glibc-dev sqlite-dev dumb-init busybox
WORKDIR /src
COPY . .
COPY --from=frontend /src/public ./public

ARG RELEASE_VERSION
ARG TAGS="bindata timetzdata sqlite sqlite_unlock_notify"
ENV TAGS=${TAGS}

RUN make FORGEJO_GENERATE_SKIP_HASH=true RELEASE_VERSION="${RELEASE_VERSION}" generate-backend \
 && CGO_ENABLED=1 go build \
      -tags "${TAGS}" \
      -ldflags "-s -w -X main.ReleaseVersion=${RELEASE_VERSION}" \
      -o blacksmith . \
 && go build -o environment-to-ini contrib/environment-to-ini/environment-to-ini.go \
 && mkdir -p /tmp/rootfs/usr/local/bin /tmp/rootfs/usr/bin /tmp/rootfs/app \
 && install -d -m 0700 -o 65532 -g 65532 /tmp/rootfs/var/lib/blacksmith /tmp/rootfs/var/lib/blacksmith/git /tmp/rootfs/tmp/blacksmith \
 && install -m 0755 blacksmith /tmp/rootfs/app/blacksmith \
 && install -m 0755 environment-to-ini /tmp/rootfs/usr/local/bin/environment-to-ini \
 && install -m 0755 /usr/bin/dumb-init /tmp/rootfs/usr/bin/dumb-init \
 && install -m 0755 /bin/busybox /tmp/rootfs/usr/bin/busybox \
 && /bin/busybox --install -s /tmp/rootfs/usr/bin \
 && install -m 0755 docker/blacksmith/entrypoint.sh /tmp/rootfs/usr/local/bin/blacksmith-entrypoint.sh \
 && install -m 0755 docker/blacksmith/setup.sh /tmp/rootfs/usr/local/bin/blacksmith-setup.sh \
 && ln -s /app/blacksmith /tmp/rootfs/usr/local/bin/blacksmith

FROM cgr.dev/chainguard/git:latest
ARG RELEASE_VERSION

LABEL org.opencontainers.image.title="Blacksmith" \
      org.opencontainers.image.description="Blacksmith is a self-hosted software forge. Git hosting, code review and CI, hardened for rootless Podman." \
      org.opencontainers.image.url="https://quad4.io" \
      org.opencontainers.image.source="https://github.com/Quad4-Software/blacksmith" \
      org.opencontainers.image.vendor="Quad4" \
      org.opencontainers.image.licenses="GPL-3.0-or-later" \
      org.opencontainers.image.version="${RELEASE_VERSION}" \
      io.containers.autoupdate="registry"

EXPOSE 2222 3000

COPY --from=backend /tmp/rootfs /

USER 65532:65532

ENV BLACKSMITH_WORK_DIR=/var/lib/blacksmith
ENV BLACKSMITH_CUSTOM=/var/lib/blacksmith/custom
ENV BLACKSMITH_TEMP=/tmp/blacksmith
ENV TMPDIR=/tmp/blacksmith
ENV BLACKSMITH_APP_INI=${BLACKSMITH_CUSTOM}/conf/app.ini
ENV HOME=/var/lib/blacksmith/git
ENV USER=git

VOLUME ["/var/lib/blacksmith"]
WORKDIR /var/lib/blacksmith

ENTRYPOINT ["/usr/bin/dumb-init", "--", "/usr/local/bin/blacksmith-entrypoint.sh"]
CMD []
