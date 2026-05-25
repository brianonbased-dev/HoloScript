#!/usr/bin/env bash
# Mirror IN-PROGRESS paper .tex sources from ai-ecosystem/research/ into
# HoloScript/research/ so structural verification commands (wc -l, grep -c, etc.)
# work locally.
#
# Lifecycle homes (founder ruling 2026-05-25):
#   - In-progress / draft papers + research  -> ai-ecosystem is canonical (edit there);
#     this script mirrors them into HoloScript for local verification.
#   - FINISHED + SUBMITTED papers            -> HoloScript is canonical (they LIVE here).
#     They are EXCLUDED below so the ai-ecosystem mirror never overwrites the
#     submitted artifact. Edit finished papers in HoloScript, not ai-ecosystem.
#
# Canonical source of truth (in-progress): ~/.ai-ecosystem/research/*.tex
# Mirror target:                           $REPO_ROOT/research/*.tex
#
# Run this after editing in-progress papers in ai-ecosystem to refresh the mirror.
#
# When a paper is submitted, ADD its filename to FINISHED_SUBMITTED below so the
# mirror stops clobbering its HoloScript-canonical copy.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_DIR="${HOME}/.ai-ecosystem/research"
TARGET_DIR="$REPO_ROOT/research"

# Finished + submitted papers: HoloScript-canonical, NOT mirrored from ai-ecosystem.
FINISHED_SUBMITTED=(
    "trust-by-construction-paper.tex"   # IEEE TVCG — submitted 2026-05-17, under review
)

if [ ! -d "$SOURCE_DIR" ]; then
    echo "ERROR: Source directory not found: $SOURCE_DIR"
    echo "Ensure ai-ecosystem repo is cloned/clinked at ~/.ai-ecosystem"
    exit 1
fi

echo "Mirroring in-progress .tex papers from $SOURCE_DIR -> $TARGET_DIR"

count=0
skipped=0
for src in "$SOURCE_DIR"/*.tex; do
    [ -e "$src" ] || continue
    filename="$(basename "$src")"
    skip=0
    for fin in "${FINISHED_SUBMITTED[@]}"; do
        if [ "$filename" = "$fin" ]; then skip=1; break; fi
    done
    if [ "$skip" = "1" ]; then
        echo "SKIP (HoloScript-canonical, finished+submitted): $filename"
        ((skipped++)) || true
        continue
    fi
    tgt="$TARGET_DIR/$filename"
    cp -v "$src" "$tgt"
    ((count++)) || true
done

echo "Done. $count files mirrored, $skipped finished+submitted skipped (HoloScript-canonical)."
echo "NOTE: In-progress mirrors are gitignored in HoloScript; commit in-progress changes in ai-ecosystem."
echo "NOTE: Finished+submitted papers are canonical in HoloScript; edit them here, not in ai-ecosystem."
