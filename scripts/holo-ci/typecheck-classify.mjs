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
export function classifyTypecheckResult(code, out, { timedOut = false } = {}) {
  const errors = countTsDiagnostics(out);
  return {
    ok: code === 0 && !timedOut,
    errors,
    // Non-zero exit with zero parseable diagnostics == the check never executed. A run the
    // gate stopped at its time limit never finished, whatever it printed first.
    toolingFailure: timedOut || (code !== 0 && errors === 0),
    timedOut,
  };
}

/**
 * How long one package's tsc may run before the gate stops it. The limit exists to catch a hung
 * tsc, not a slow machine. It was a fixed 180s: on 2026-09-29, with the laptop at 100% CPU from
 * other sessions' test runs, a cold `tsc --noEmit -p packages/studio` took 4m49s alone, so every
 * merge from main that touched studio was blocked as "tsc could not run". The default is now 600s,
 * and HOLO_TYPECHECK_TIMEOUT_SECONDS (a positive whole number) overrides it.
 */
export const DEFAULT_TYPECHECK_TIMEOUT_SECONDS = 600;

export function resolveTypecheckTimeoutMs(env = process.env) {
  const raw = String(env?.HOLO_TYPECHECK_TIMEOUT_SECONDS ?? '').trim();
  const seconds = /^\d+$/.test(raw) ? Number(raw) : NaN;
  return (seconds > 0 ? seconds : DEFAULT_TYPECHECK_TIMEOUT_SECONDS) * 1000;
}

/**
 * The repair to print for packages whose tsc never finished. A timeout and a missing tsc are
 * different faults with different fixes; the gate used to answer both with "pnpm install
 * --force", which does nothing for a machine that is merely busy.
 */
export function toolingRemedy(results) {
  const lines = [];
  const timedOut = results.filter((r) => r.timedOut).map((r) => r.pkg);
  const other = results.filter((r) => !r.timedOut).map((r) => r.pkg);
  if (timedOut.length) {
    lines.push(
      `Timed out (${timedOut.join(', ')}): tsc was still running at the limit, which is a slow or busy machine, not a broken install. ` +
        'Run the same tsc once by hand (packages with "incremental" in tsconfig, studio among them, then re-check fast), retry the commit, ' +
        'or raise HOLO_TYPECHECK_TIMEOUT_SECONDS.'
    );
  }
  if (other.length) {
    lines.push(
      `Could not start (${other.join(', ')}): likely a missing or broken node_modules/typescript. ` +
        'Fix: pnpm install --force (recreates missing node_modules/.bin shims), then re-run.'
    );
  }
  return lines;
}
