/**
 * typecheck-classify.mjs — pure classification of one `tsc --noEmit` invocation.
 *
 * WHY THIS IS ITS OWN MODULE: typecheck.mjs calls main() at import time (it is a gate
 * entry point), so a unit test cannot import it without running the whole gate. An
 * `import.meta.url === pathToFileURL(process.argv[1]).href` guard would fix that, but the
 * comparison is path-casing sensitive on Windows (this repo is reached as both
 * C:\Users\josep\... and C:\Users\Josep\...) — a mismatch would silently turn the gate into
 * a no-op, which is strictly worse than the bug it guards. So the decision logic lives here,
 * importable and testable, and typecheck.mjs consumes it.
 *
 * THE DISTINCTION (task_1784197589328_gywp): a non-zero tsc exit means one of two very
 * different things, and conflating them cost an agent ~40 minutes chasing a "type error"
 * that never existed in their diff:
 *   - tsc RAN and found problems      -> exit != 0 AND >=1 parseable `error TS####`  -> type errors
 *   - tsc NEVER RAN (tooling failure) -> exit != 0 AND ZERO parseable diagnostics    -> could not check
 * The second case (MODULE_NOT_FOUND from a missing node_modules/.bin shim, a crash, or a
 * kill after timeout) must NEVER be reported as "(0 errors)" — zero errors is what a CLEAN
 * package looks like. It never checked anything.
 *
 * @see scripts/holo-ci/typecheck.mjs
 * @see scripts/__tests__/holo-ci-typecheck-classify.test.mjs
 */

/** Count parseable TypeScript diagnostics (`error TS2322: ...`) in tsc's combined output. */
export function countTsDiagnostics(out) {
  return (String(out ?? '').match(/error TS\d+/g) || []).length;
}

/**
 * Classify a finished tsc run.
 *
 * @param {number} code  tsc's exit code
 * @param {string} out   combined stdout+stderr
 * @returns {{ ok: boolean, errors: number, toolingFailure: boolean }}
 *   ok             — tsc ran and the package is clean
 *   errors         — number of parseable `error TS####` diagnostics
 *   toolingFailure — tsc could not run at all (report the raw output, never "0 errors")
 */
export function classifyTypecheckResult(code, out) {
  const errors = countTsDiagnostics(out);
  return {
    ok: code === 0,
    errors,
    // Non-zero exit with zero parseable diagnostics == the check never executed.
    toolingFailure: code !== 0 && errors === 0,
  };
}
