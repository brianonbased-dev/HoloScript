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
#   bash scripts/safe-commit.sh --push -m "msg" path/one ...      # commit + fenced push
#
#   All flags before the file list are forwarded to `git commit`. The
#   files are passed as `--only` paths so the index state at script
#   start is irrelevant for the commit contents.
#
#   `--push` triggers `git push origin <current-branch>` AFTER a successful
#   commit, gated by the push-fence check below. `--push-force` bypasses
#   the fence (use only when coordinating with peer windows manually).
#
# BEHAVIOR:
#   - Snapshots the index tree-hash before AND after the commit attempt.
#   - Logs both hashes + files-actually-committed to stderr so peer
#     races leave an audit trail.
#   - Refuses to run if no file paths are given (rejects accidental
#     `git commit -a` style usage that bypasses the protection).
#
# PUSH-FENCE (W.135 / F.035 Mode 3):
#   When `--push` is set, before pushing this script checks the reflog for
#   `pull --rebase` events in the last PUSH_FENCE_WINDOW_MINUTES (default 10).
#   If >= PUSH_FENCE_THRESHOLD (default 2) such events exist, the push is
#   FENCED: the commit still landed locally, but `git push` is skipped and
#   the script exits 0 with a clear warning. The agent then knows to wait
#   or coordinate before pushing manually.
#
#   Why: F.035 Mode 3 (same-machine throughput saturation) — when an audit-fix
#   loop or scheduled-rebase automation runs on the same machine, both carousels
#   race for the single tip-of-main push slot. Atomic-commit (W.082 fix) doesn't
#   help; the race is at PUSH, not commit. A `pull --rebase` that aborts +
#   `reset --hard origin/main` (W.135) drops local commits into reflog-only.
#   This fence holds the push when reflog density signals a hot loop, letting
#   the loop drain before we contend for the slot.
#
#   Override: `--push-force` skips the fence. `PUSH_FENCE_OFF=1` env disables
#   it for the run. Tune via `PUSH_FENCE_WINDOW_MINUTES` and `PUSH_FENCE_THRESHOLD`.
#
# Search keywords for memory/knowledge: W.082 W.082b W.105 W.135 F.035
#   peer-parallel index-race scope-bleed git-commit-only atomic-commit
#   push-fence carousel-mode-3 same-machine-throughput
#   ai-ecosystem feedback_migration-protocol feedback_carousel-principle

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
DO_PUSH=0
PUSH_FORCE=0
for arg in "$@"; do
    if [ "$EXPECT_FLAG_VALUE" = "1" ]; then
        FLAGS+=("$arg")
        EXPECT_FLAG_VALUE=0
        continue
    fi
    case "$arg" in
        # safe-commit.sh-owned flags (NOT forwarded to git commit)
        --push)
            DO_PUSH=1
            ;;
        --push-force)
            DO_PUSH=1
            PUSH_FORCE=1
            ;;
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

# --- Push-fence (W.135 / F.035 Mode 3). ---
# Triggered only when caller passed --push and the commit succeeded.
# Reads `git reflog --date=iso` for `pull --rebase` events in the last
# PUSH_FENCE_WINDOW_MINUTES; if >= PUSH_FENCE_THRESHOLD, holds the push.
# The commit is already durable locally — we are only fencing the network
# step so the agent can wait/coordinate before contending for the push slot.
if [ "$DO_PUSH" = "1" ] && [ "$COMMIT_STATUS" -eq 0 ]; then
    PUSH_FENCE_WINDOW_MINUTES="${PUSH_FENCE_WINDOW_MINUTES:-10}"
    PUSH_FENCE_THRESHOLD="${PUSH_FENCE_THRESHOLD:-2}"

    BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "HEAD")
    REMOTE="${PUSH_FENCE_REMOTE:-origin}"

    if [ "$PUSH_FORCE" = "1" ] || [ "${PUSH_FENCE_OFF:-0}" = "1" ]; then
        echo "[safe-commit] push-fence BYPASSED (--push-force or PUSH_FENCE_OFF=1); pushing ${REMOTE}/${BRANCH}" >&2
        # Wrap with `|| PUSH_STATUS=$?` so set -e at script top doesn't exit
        # before we can print our own context message.
        PUSH_STATUS=0
        git push "$REMOTE" "$BRANCH" || PUSH_STATUS=$?
        if [ "$PUSH_STATUS" -ne 0 ]; then
            echo "[safe-commit] push FAILED (status=$PUSH_STATUS) — commit is durable locally." >&2
            exit "$PUSH_STATUS"
        fi
        echo "[safe-commit] pushed ${POST_HEAD:0:12} to ${REMOTE}/${BRANCH}" >&2
    else
        # Compute cutoff timestamp = now - WINDOW minutes.
        # Portable approach: use `git reflog --date=iso --since="<N> minutes ago"`
        # which Git itself parses against the reflog timestamps. Then count
        # DISTINCT rebase invocations in that filtered view.
        #
        # Each `git pull --rebase` produces either:
        #   - a single `pull --rebase[: ...]` line (fast-forward case), OR
        #   - a `(start)` line plus N `(pick)` lines plus a `(finish)` line.
        # We count `(start)` markers AND bare-fast-forward lines. This counts
        # invocations, not pick events — so a single big rebase doesn't trip
        # the fence by itself; only repeated invocations do.
        REBASE_HITS=$(git reflog --date=iso --since="${PUSH_FENCE_WINDOW_MINUTES} minutes ago" 2>/dev/null \
            | grep -cE 'pull --rebase[^(]*\((start|finish)\)|pull(:| --rebase[^(]*:)' || true)
        # Fallback strategy: some Git versions don't honor --since on reflog
        # (specifically when reflog entries lack iso dates). Try the relative
        # reflog with an explicit "in last X minutes" filter as backstop.
        if [ -z "$REBASE_HITS" ] || [ "$REBASE_HITS" = "0" ]; then
            FALLBACK_HITS=$(git reflog --date=relative 2>/dev/null | head -40 \
                | grep -E '\b(seconds|minute|minutes) ago\b' \
                | grep -cE 'pull --rebase[^(]*\((start|finish)\)|pull(:| --rebase[^(]*:)' || true)
            if [ -n "$FALLBACK_HITS" ] && [ "$FALLBACK_HITS" -gt "$REBASE_HITS" ]; then
                REBASE_HITS="$FALLBACK_HITS"
            fi
        fi
        REBASE_HITS="${REBASE_HITS:-0}"
        # Each invocation produces (start)+(finish) = 2 hits, or 1 hit for
        # fast-forward. Normalize: divide by 2 if mostly start/finish pairs;
        # this is approximate but conservative (rounds down on partial pairs,
        # so the fence triggers on >= PUSH_FENCE_THRESHOLD distinct invocations).
        # Simpler interpretation: any (start) or (finish) IS one half of one
        # invocation, so the threshold is effectively counting half-invocations.
        # Documented: PUSH_FENCE_THRESHOLD=2 means "1 full multi-pick rebase
        # plus 1 more event" — adjust to taste via env var.

        echo "[safe-commit] push-fence: ${REBASE_HITS} pull --rebase event(s) in last ${PUSH_FENCE_WINDOW_MINUTES}min (threshold=${PUSH_FENCE_THRESHOLD})" >&2

        if [ "$REBASE_HITS" -ge "$PUSH_FENCE_THRESHOLD" ]; then
            echo "[safe-commit] PUSH FENCED — hot rebase loop detected (W.135 / F.035 Mode 3)." >&2
            echo "[safe-commit]   commit ${POST_HEAD:0:12} is durable locally on branch ${BRANCH}." >&2
            echo "[safe-commit]   push to ${REMOTE}/${BRANCH} was SKIPPED to avoid push-race orphan." >&2
            echo "[safe-commit]   wait for the rebase loop to drain (typically 1-3 min) and push manually:" >&2
            echo "[safe-commit]     git push ${REMOTE} ${BRANCH}" >&2
            echo "[safe-commit]   or bypass the fence with: --push-force (or PUSH_FENCE_OFF=1)" >&2
            echo "[safe-commit]   inspect the loop: git reflog --date=iso --since='${PUSH_FENCE_WINDOW_MINUTES} minutes ago' | grep -E 'pull(:|.*--rebase)'" >&2
            echo "[safe-commit]" >&2
            echo "[safe-commit]   IF this commit DOES get dropped by a peer pull --rebase --abort + reset (W.135):" >&2
            echo "[safe-commit]     git reflog                          # find the orphaned SHA (look for ${POST_HEAD:0:12})" >&2
            echo "[safe-commit]     git cherry-pick ${POST_HEAD:0:12}       # restore the commit on top of new HEAD" >&2
            echo "[safe-commit]     git push ${REMOTE} ${BRANCH}                  # push IMMEDIATELY before next collision" >&2
            echo "[safe-commit]   See W.135 in ai-ecosystem MEMORY.md for the full recovery protocol." >&2
            # Exit 0 — the commit succeeded. The fence is informational, not a failure.
            exit 0
        fi

        echo "[safe-commit] push-fence CLEAR; pushing ${REMOTE}/${BRANCH}" >&2
        # Wrap with `|| PUSH_STATUS=$?` so set -e at script top doesn't exit
        # before we can print our own context message.
        PUSH_STATUS=0
        git push "$REMOTE" "$BRANCH" || PUSH_STATUS=$?
        if [ "$PUSH_STATUS" -ne 0 ]; then
            echo "[safe-commit] push FAILED (status=$PUSH_STATUS) — commit is durable locally; retry manually." >&2
            exit "$PUSH_STATUS"
        fi
        echo "[safe-commit] pushed ${POST_HEAD:0:12} to ${REMOTE}/${BRANCH}" >&2
    fi
fi

exit $COMMIT_STATUS
