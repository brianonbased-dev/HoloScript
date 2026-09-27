#!/bin/sh
# Pass a staged path list to a node gate without putting the list on the
# command line.
#
# Windows CreateProcess rejects a command line longer than 32,767 characters.
# The pre-commit hook used to pass every staged path as one --files argument,
# so a large merge died with "Argument list too long" before the gate ran.
# This helper writes the newline-separated list to a temp file and runs:
#   node <script> --files-from <temp>
# The temp file is removed on success, on a non-zero status, and if the child
# exits the shell. Paths may contain spaces; they are one line each.
#
# Sourced by .githooks/pre-commit. Git for Windows runs that hook with sh
# (Git Bash) even when the commit was started from PowerShell. Keep this file
# free of bash-only syntax (no arrays, [[ ]], or process substitution).
#
# The caller defines run_with_timeout. A fallback is installed only when it
# is missing, so tests can source this file on their own.
#
# Usage:
#   run_node_with_files_from <timeout-seconds> <script> <newline-separated-paths>

if ! command -v run_with_timeout >/dev/null 2>&1; then
    run_with_timeout() {
        shift
        "$@"
    }
fi

run_node_with_files_from() {
    local timeout_secs="$1"
    local script="$2"
    local paths="$3"
    local list_file=""
    local status=0

    list_file=$(mktemp 2>/dev/null) || list_file=""
    if [ -z "$list_file" ]; then
        list_file="${TMPDIR:-/tmp}/holo-staged-files-$$.txt"
        : > "$list_file" || return 2
    fi

    # EXIT covers an `exit` inside run_with_timeout. The explicit rm covers
    # the normal return. The trap is cleared before return so a caller that
    # sourced this file does not keep it after the gate finishes.
    trap 'rm -f "$list_file"' EXIT INT TERM
    printf '%s\n' "$paths" > "$list_file" || status=$?
    if [ "$status" -eq 0 ]; then
        run_with_timeout "$timeout_secs" node "$script" --files-from "$list_file" || status=$?
    fi
    rm -f "$list_file"
    trap - EXIT INT TERM
    return "$status"
}
