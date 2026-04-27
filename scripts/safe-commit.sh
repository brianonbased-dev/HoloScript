#!/bin/bash
# safe-commit.sh — atomic peer-parallel-safe commit wrapper.
#
# WHY:
#   Closes the W.082 escalation race (b3b277189, 2026-04-23):
#   1. agent A: `git add fileA fileB fileC` + `git diff --cached --stat` → verified.
#   2. peer B (different window) runs `git add ... ; git commit ...` between
#      A's verification and A's `git commit`. Peer's index state wins; A's
#      next `git commit` lands peer's files instead of A's.
#   3. A's intended files become untracked; reflog shows interleaved
#      `reset: moving to HEAD` entries from peer's ops.
#
# FIX (option a from the original task):
#   Use `git commit -o <explicit-files>` (git commit --only). This re-stages
#   the named paths from the working tree AT COMMIT TIME, bypassing any
#   trust in the index state established earlier. The commit is built
#   from working-tree contents of the explicit list — peer's mid-window
#   index mutations can no longer bleed into our commit.
#
# Trade-offs vs (b) `stash push` / (c) detect:
#   - (a) is the smallest behavioral change and works on Windows where
#     advisory file locks don't fence concurrent git ops.
#   - (b) has a non-trivial failure mode if stash pop conflicts mid-flow.
#   - (c) detection-only still requires a remediation step on detect.
#   This script implements (a) plus the (c) detection check as a
#   belt-and-suspenders confidence signal printed to stderr.
#
# USAGE:
#   bash scripts/safe-commit.sh -m "msg" path/one path/two ...
#   bash scripts/safe-commit.sh -F .commit-msg.txt path/one ...
#   bash scripts/safe-commit.sh --amend --no-edit path/one ...
#
#   All flags before the file list are forwarded to `git commit`. The
#   files are passed as `--only` paths so the index state at script
#   start is irrelevant for the commit contents.
#
# BEHAVIOR:
#   - Snapshots the index tree-hash before AND after the commit attempt.
#   - Logs both hashes + files-actually-committed to stderr so peer
#     races leave an audit trail.
#   - Refuses to run if no file paths are given (rejects accidental
#     `git commit -a` style usage that bypasses the protection).
#
# Search keywords for memory/knowledge: W.082 W.082b peer-parallel
#   index-race scope-bleed git-commit-only atomic-commit
#   ai-ecosystem feedback_migration-protocol

set -e

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || {
    echo "[safe-commit] not in a git repo" >&2
    exit 1
}

# Split args: forward everything before the first non-flag-looking thing
# that exists as a path-on-disk (or starts with packages/ etc) into
# git commit; the rest becomes the file list. Simpler heuristic: any arg
# that exists as a path is a file; everything else is a flag/value.

FLAGS=()
FILES=()
EXPECT_FLAG_VALUE=0
for arg in "$@"; do
    if [ "$EXPECT_FLAG_VALUE" = "1" ]; then
        FLAGS+=("$arg")
        EXPECT_FLAG_VALUE=0
        continue
    fi
    case "$arg" in
        -m|--message|-F|--file|--author|--date|-C|--reuse-message|-c|--reedit-message|--cleanup|--gpg-sign|--no-gpg-sign|-S)
            FLAGS+=("$arg")
            EXPECT_FLAG_VALUE=1
            ;;
        --amend|--no-edit|--no-verify|-v|--verbose|-q|--quiet|-s|--signoff|--no-signoff|--allow-empty|--allow-empty-message)
            FLAGS+=("$arg")
            ;;
        --message=*|--file=*|--author=*|--date=*|--reuse-message=*|--reedit-message=*|--cleanup=*|--gpg-sign=*)
            FLAGS+=("$arg")
            ;;
        -*)
            # Unknown flag — forward as-is, assume self-contained.
            FLAGS+=("$arg")
            ;;
        *)
            FILES+=("$arg")
            ;;
    esac
done

if [ "${#FILES[@]}" -eq 0 ]; then
    echo "[safe-commit] no file paths given." >&2
    echo "[safe-commit] usage: scripts/safe-commit.sh [git-commit-flags] <path>..." >&2
    echo "[safe-commit] this wrapper REQUIRES explicit paths so peer-parallel" >&2
    echo "[safe-commit] index mutations cannot bleed into the commit." >&2
    echo "[safe-commit] for an empty commit use: git commit --allow-empty -m '...' " >&2
    exit 2
fi

# --- Detection (option c): snapshot pre-commit index tree-hash. ---
PRE_TREE=$(git write-tree 2>/dev/null) || PRE_TREE="(unknown)"
PRE_HEAD=$(git rev-parse HEAD 2>/dev/null) || PRE_HEAD="(unborn)"

echo "[safe-commit] pre-tree=${PRE_TREE:0:12} HEAD=${PRE_HEAD:0:12}" >&2
echo "[safe-commit] commit -o files (${#FILES[@]}):" >&2
for f in "${FILES[@]}"; do
    echo "[safe-commit]   - $f" >&2
done

# --- Atomic re-stage at commit time (option a). ---
# `git commit --only <paths>` (alias -o) does the following atomically:
#   1. Saves the current index aside.
#   2. Re-stages ONLY the named paths from the working tree.
#   3. Builds the commit from that minimal index.
#   4. Restores the saved index, then re-applies the named paths to it.
# Steps 2 and 3 happen under git's own lock; peer ops that mutate the
# index between this script's verification and `commit -o` cannot bleed
# in because the commit is built from `<paths>` at step 2, not from the
# old verified-but-stale index.
git commit --only "${FLAGS[@]}" -- "${FILES[@]}"
COMMIT_STATUS=$?

# --- Detection (option c): post-commit verification. ---
POST_HEAD=$(git rev-parse HEAD 2>/dev/null) || POST_HEAD="(unborn)"
if [ "$COMMIT_STATUS" -eq 0 ] && [ "$PRE_HEAD" != "$POST_HEAD" ] && [ "$PRE_HEAD" != "(unborn)" ]; then
    LANDED_FILES=$(git diff-tree --no-commit-id --name-only -r "$POST_HEAD" 2>/dev/null)
    LANDED_COUNT=$(echo "$LANDED_FILES" | grep -c . || echo 0)

    # Cross-check: every name in FILES must appear in LANDED_FILES (modulo
    # paths git silently dropped because they had no diff vs HEAD).
    UNEXPECTED=""
    for landed in $LANDED_FILES; do
        match=0
        for expected in "${FILES[@]}"; do
            # Normalize: ./prefix and trailing slashes
            exp_norm="${expected#./}"
            exp_norm="${exp_norm%/}"
            land_norm="${landed#./}"
            if [ "$exp_norm" = "$land_norm" ]; then match=1; break; fi
            # Directory match: expected dir prefix of landed file
            case "$land_norm" in
                "$exp_norm"/*) match=1; break ;;
            esac
        done
        if [ "$match" = "0" ]; then
            UNEXPECTED="${UNEXPECTED}${landed}\n"
        fi
    done

    echo "[safe-commit] post-commit HEAD=${POST_HEAD:0:12} landed=${LANDED_COUNT} files" >&2
    if [ -n "$UNEXPECTED" ]; then
        echo "[safe-commit] WARNING: commit landed files NOT in --only list (peer-bleed candidate):" >&2
        echo -e "$UNEXPECTED" | sed 's/^/[safe-commit]   ! /' >&2
        echo "[safe-commit] inspect: git show --stat $POST_HEAD" >&2
        echo "[safe-commit] reflog : git reflog --date=iso | head -10" >&2
        # Don't fail — git commit -o already gave us atomicity. The warning
        # is informational because `git commit --only <dir>` legitimately
        # picks up multiple files under the directory.
    fi
fi

exit $COMMIT_STATUS
