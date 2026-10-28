#!/bin/sh
set -eu

if [ -x /usr/local/bin/blacksmith-setup.sh ]; then
    /usr/local/bin/blacksmith-setup.sh || { echo 'blacksmith setup failed'; exit 1; }
fi

if [ $# -gt 0 ]; then
    exec "$@"
fi

exec /usr/local/bin/blacksmith -c "${BLACKSMITH_APP_INI}" web
