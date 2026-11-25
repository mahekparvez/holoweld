#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
unity="${HOLOWELD_UNITY_EDITOR:-/Applications/Unity/Hub/Editor/2022.3.62f1/Unity.app/Contents/MacOS/Unity}"
if [[ ! -x "$unity" ]]; then
  echo 'Install Unity 2022.3.62f1 from the Unity Download Archive using Unity Hub.' >&2
  echo 'If installed elsewhere, set HOLOWELD_UNITY_EDITOR to the Unity executable.' >&2
  exit 1
fi
exec "$unity" -projectPath "$PWD"
