# Caddy with the Coraza WAF plugin and the CrowdSec bouncer plugin.
#
# The bouncer enforces CrowdSec decisions (IP reputation, scenarios)
# and forwards requests to the CrowdSec AppSec engine (embedded Coraza
# with the OWASP Core Rule Set) for in-line WAF inspection.
FROM cgr.dev/chainguard/go:latest-dev AS build

USER root
RUN apk add --no-cache xcaddy git

ARG CADDY_VERSION=latest

RUN xcaddy build ${CADDY_VERSION} \
      --with github.com/corazawaf/coraza-caddy/v2@latest \
      --with github.com/hslatman/caddy-crowdsec-bouncer/crowdsec@latest \
      --with github.com/hslatman/caddy-crowdsec-bouncer/appsec@latest \
      --output /usr/bin/caddy

FROM cgr.dev/chainguard/wolfi-base:latest

RUN apk add --no-cache ca-certificates-bundle

COPY --from=build /usr/bin/caddy /usr/bin/caddy
COPY contrib/proxy/Caddyfile /etc/caddy/Caddyfile

USER 65532:65532

EXPOSE 80 443

ENTRYPOINT ["/usr/bin/caddy"]
CMD ["run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
