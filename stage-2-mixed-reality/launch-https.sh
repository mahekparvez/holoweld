#!/bin/bash
set -euo pipefail
if [[ $# != 2 ]]; then echo 'Usage: ./launch-https.sh fullchain.pem private-key.pem' >&2; exit 1; fi
cert="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
key="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
cd "$(dirname "$0")/../stage-1-simulation"
if [[ ! -x node_modules/.bin/vite ]]; then ./setup.sh; fi
npm run build -- --mode stage2 --outDir dist-stage2
exec node ../stage-2-mixed-reality/serve-https.mjs "$cert" "$key" dist-stage2
