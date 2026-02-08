#!/usr/bin/env bash
set -euo pipefail

for file in temp/*.md; do
  node bin/notesrag.js index --source "$file"
done
