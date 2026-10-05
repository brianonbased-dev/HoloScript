/**
 * Shared honesty labels for daemon jobs. The runner's summary and the Studio
 * job card read the same words, so a heal that scanned files but built no
 * graph can never look like an empty repo or a success.
 */

/** "Blocked — Absorb empty (N files scanned)". Never a success state. */
export function absorbEmptyLabel(filesScanned: number): string {
  return `Blocked — Absorb empty (${filesScanned} file${filesScanned === 1 ? '' : 's'} scanned)`;
}
