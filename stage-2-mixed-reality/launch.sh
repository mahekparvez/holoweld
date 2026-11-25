#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../stage-1-simulation"
if [[ $# == 0 ]]; then set -- --open; fi
exec ./launch.sh --mode stage2 --port 4182 "$@"
