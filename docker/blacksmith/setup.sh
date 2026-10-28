#!/bin/sh
set -eu

mkdir -p "${HOME}" && chmod 0700 "${HOME}"
if [ ! -w "${HOME}" ]; then echo "${HOME} is not writable"; exit 1; fi

mkdir -p "${BLACKSMITH_CUSTOM}" && chmod 0700 "${BLACKSMITH_CUSTOM}"

mkdir -p "${BLACKSMITH_TEMP}" && chmod 0700 "${BLACKSMITH_TEMP}"
if [ ! -w "${BLACKSMITH_TEMP}" ]; then echo "${BLACKSMITH_TEMP} is not writable"; exit 1; fi

if [ ! -f "${BLACKSMITH_APP_INI}" ]; then

    BLACKSMITH_APP_INI_DIR=$(dirname "${BLACKSMITH_APP_INI}")
    mkdir -p "${BLACKSMITH_APP_INI_DIR}" && chmod 0700 "${BLACKSMITH_APP_INI_DIR}"
    if [ ! -w "${BLACKSMITH_APP_INI_DIR}" ]; then echo "${BLACKSMITH_APP_INI_DIR} is not writable"; exit 1; fi

    if [ -n "${SECRET_KEY:-}" ] && [ -z "${INSTALL_LOCK:-}" ]; then
        INSTALL_LOCK=true
    fi

    cat > "${BLACKSMITH_APP_INI}" <<EOF
APP_NAME = ${APP_NAME:-Blacksmith}
RUN_USER = ${USER:-git}
RUN_MODE = ${RUN_MODE:-prod}

[repository]
ROOT = ${BLACKSMITH_WORK_DIR}/git/repositories

[repository.local]
LOCAL_COPY_PATH = ${BLACKSMITH_TEMP}/local-repo

[repository.upload]
TEMP_PATH = ${BLACKSMITH_TEMP}/uploads

[server]
APP_DATA_PATH = ${BLACKSMITH_WORK_DIR}
SSH_DOMAIN       = ${SSH_DOMAIN:-localhost}
HTTP_PORT        = ${HTTP_PORT:-3000}
ROOT_URL         = ${ROOT_URL:-}
DISABLE_SSH      = ${DISABLE_SSH:-false}
START_SSH_SERVER = true
SSH_PORT         = ${SSH_PORT:-2222}
SSH_LISTEN_PORT  = ${SSH_LISTEN_PORT:-${SSH_PORT:-2222}}
BUILTIN_SSH_SERVER_USER = ${USER:-git}
LFS_START_SERVER = ${LFS_START_SERVER:-false}

[database]
PATH = ${BLACKSMITH_WORK_DIR}/data/blacksmith.db
DB_TYPE = ${DB_TYPE:-sqlite3}
HOST    = ${DB_HOST:-localhost:3306}
NAME    = ${DB_NAME:-blacksmith}
USER    = ${DB_USER:-root}
PASSWD  = ${DB_PASSWD:-}

[session]
PROVIDER_CONFIG = ${BLACKSMITH_WORK_DIR}/data/sessions

[picture]
AVATAR_UPLOAD_PATH = ${BLACKSMITH_WORK_DIR}/data/avatars
REPOSITORY_AVATAR_UPLOAD_PATH = ${BLACKSMITH_WORK_DIR}/data/repo-avatars

[attachment]
PATH = ${BLACKSMITH_WORK_DIR}/data/attachments

[log]
ROOT_PATH = ${BLACKSMITH_WORK_DIR}/data/log

[security]
INSTALL_LOCK = ${INSTALL_LOCK:-false}
SECRET_KEY   = ${SECRET_KEY:-}
REVERSE_PROXY_LIMIT = 1

[service]
DISABLE_REGISTRATION = ${DISABLE_REGISTRATION:-false}
REQUIRE_SIGNIN_VIEW  = ${REQUIRE_SIGNIN_VIEW:-false}

[lfs]
PATH = ${BLACKSMITH_WORK_DIR}/git/lfs
EOF
fi

environment-to-ini && chmod 0600 "${BLACKSMITH_APP_INI}" --config "${BLACKSMITH_APP_INI}"
