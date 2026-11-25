#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -x node_modules/.bin/vite ]]; then ./setup.sh; fi
if [[ $# == 0 ]]; then
  export BROWSER="${BROWSER:-Google Chrome}"
  set -- --open
fi
exec npm run dev -- "$@"
