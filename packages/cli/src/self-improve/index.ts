/**
 * Self-Improve CLI Module
 *
 * Provides the `holoscript self-improve` command that wires
 * the core SelfImproveCommand into the CLI with real I/O.
 *
 * @module self-improve
 */

export { runSelfImprove } from './runSelfImprove';
export { CliSelfImproveIO } from './CliSelfImproveIO';
export type { CliSelfImproveOptions } from './CliSelfImproveIO';
