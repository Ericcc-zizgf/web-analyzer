#!/bin/sh
PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P) || exit 1
cd "$PROJECT_DIR" || exit 1
exec python3 backend/app.py
