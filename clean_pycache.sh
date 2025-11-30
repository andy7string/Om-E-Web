#!/bin/bash
set -euo pipefail

# Remove all __pycache__ directories from the project tree.
# Run from anywhere; the script resolves the repository root automatically.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

count=0
while IFS= read -r -d '' dir; do
  echo "Removing $dir"
  rm -rf "$dir"
  count=$((count + 1))
done < <(find "$ROOT_DIR" -type d -name '__pycache__' -print0)

if [ "$count" -eq 0 ]; then
  echo "No __pycache__ directories found under $ROOT_DIR"
else
  echo "Removed $count __pycache__ directories."
fi

