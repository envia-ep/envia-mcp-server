#!/usr/bin/env bash
set -e

# Prefer HEROKU_BUILD_COMMIT; fall back to HEROKU_SLUG_COMMIT, then SOURCE_VERSION.
export DD_GIT_COMMIT_SHA="${HEROKU_BUILD_COMMIT:-${HEROKU_SLUG_COMMIT:-${SOURCE_VERSION:-}}}"

# Version is the release version of the app.
export DD_VERSION="${HEROKU_RELEASE_VERSION:-}"
