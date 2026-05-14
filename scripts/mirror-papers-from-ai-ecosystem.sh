#!/usr/bin/env bash
# Mirror paper .tex sources from ai-ecosystem/research/ into HoloScript/research/
# so structural verification commands (wc -l, grep -c, etc.) work locally.
#
# Canonical source of truth: ~/.ai-ecosystem/research/*.tex
# Mirror target:          $REPO_ROOT/research/*.tex
#
# Run this after editing papers in ai-ecosystem to refresh the local mirror.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_DIR="${HOME}/.ai-ecosystem/research"
TARGET_DIR="$REPO_ROOT/research"

if [ ! -d "$SOURCE_DIR" ]; then
    echo "ERROR: Source directory not found: $SOURCE_DIR"
    echo "Ensure ai-ecosystem repo is cloned/clinked at ~/.ai-ecosystem"
    exit 1
fi

echo "Mirroring .tex papers from $SOURCE_DIR -> $TARGET_DIR"

count=0
for src in "$SOURCE_DIR"/*.tex; do
    [ -e "$src" ] || continue
    filename="$(basename "$src")"
    tgt="$TARGET_DIR/$filename"
    cp -v "$src" "$tgt"
    ((count++)) || true
done

echo "Done. $count files mirrored."
echo "NOTE: Mirrored files are gitignored in HoloScript; commit changes in ai-ecosystem."
