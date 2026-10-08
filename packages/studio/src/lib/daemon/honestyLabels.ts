/**
 * Shared honesty labels for daemon jobs. The runner's summary and the Studio
 * job card read the same words, so a heal that scanned files but built no
 * graph can never look like an empty repo or a success.
 */

/**
 * "Blocked — Absorb empty (N files scanned)". Never a success state.
 * N is the number of files in the workspace copy that was handed to the
 * scanner (not the number the scanner parsed successfully).
 */
export function absorbEmptyLabel(filesScanned: number): string {
  return `Blocked — Absorb empty (${filesScanned} file${filesScanned === 1 ? '' : 's'} scanned)`;
}

/**
 * The job stopped after Absorb + patch proposal because running the repo's own
 * tools (tsc / vitest / eslint via npx) would execute the user's code inside
 * the Studio server. Not a heal, not green.
 */
export const CHECKS_SKIPPED_LABEL = 'Absorb done, checks skipped (sandbox not enabled)';
