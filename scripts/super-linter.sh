#!/usr/bin/env bash
set -euo pipefail

docker run --rm \
  --network=none \
  --env-file .github/super-linter.env \
  -e RUN_LOCAL=true \
  -v "$(pwd):/tmp/lint" \
  ghcr.io/super-linter/super-linter:v9.0.0
