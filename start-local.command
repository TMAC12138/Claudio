#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

status=0
./start-local.sh || status=$?

echo
if [ "$status" -eq 0 ]; then
  echo "Startup check finished. You can keep this window open to view output, or press Enter to close it."
else
  echo "Startup failed with exit code $status. Please keep this window open and check the message above, or press Enter to close it."
fi
read -r
exit "$status"
