/**
 * Self-Target Configuration — Special handling for when HoloScript
 * improves its own codebase.
 *
 * Includes hardcoded DNA for the HoloScript monorepo and a denylist
 * of files that must never be modified by the pipeline.
 */

import type { DaemonProjectDNA } from '../daemon/types';
import * as path from 'path';

// ─── HoloScript Self-DNA ─────────────────────────────────────────────────────

/**
 * Hardcoded Project DNA for the HoloScript monorepo.
 * Used when mode === 'self-target' so the pipeline doesn't need to re-absorb.
 */
export const HOLOSCRIPT_SELF_DNA: DaemonProjectDNA = {
  kind: 'spatial',
  confidence: 0.99,
  detectedStack: ['typescript', 'tsx', 'react', 'next.js', 'three.js', 'holoscript', 'vitest'],
  recommendedProfile: 'deep',
  notes: [
    'Self-improvement mode: HoloScript improving its own codebase',
    'Monorepo with 50+ packages',
    'Core: ZERO type errors, 0.999 quality score',
  ],
  projectDNA: {
    kind: 'spatial',
    confidence: 0.99,
    languages: ['ts', 'tsx', 'js', 'wgsl', 'holo', 'hsplus'],
    frameworks: ['react', 'next.js', 'three.js', 'vitest', 'holoscript'],
    packageManagers: ['pnpm'],
    runtimes: ['node'],
    repoShape: 'monorepo',
    riskSignals: ['large-codebase'],
    strengths: ['has-tests', 'typed', 'has-ci', 'documented', 'linted'],
    recommendedProfile: 'spatial',
    recommendedMode: 'deep',
  },
};

// ─── Self-Target Denylist ────────────────────────────────────────────────────

/**
 * Files and paths that the recursive pipeline must NEVER modify when
 * operating in self-target mode. This prevents the pipeline from
 * modifying its own orchestration logic (safety guard).
 */
export const SELF_TARGET_DENYLIST: string[] = [
  // Daemon state — touching this can corrupt cycle tracking (W.090)
  'daemon-state.json',
  // The pipeline's own orchestration
  'src/lib/recursive/',
  'compositions/recursive-pipeline.hsplus',
  // Core daemon action handlers
  'packages/core/src/cli/daemon-actions.ts',
  'packages/core/src/cli/daemon-error-taxonomy.ts',
  // Daemon composition
  'compositions/holodaemon.hsplus',
  'compositions/self-improve-daemon.hsplus',
  // Security-sensitive
  '.env',
  '.env.local',
  'credentials',
  // Lock files
  'pnpm-lock.yaml',
  'package-lock.json',
];

/**
 * Check if a file path is safe to modify in self-target mode.
 * Returns false if the file matches any denylist entry.
 */
export function isSelfTargetSafe(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return !SELF_TARGET_DENYLIST.some((denied) => normalized.includes(denied));
}

/**
 * Resolve the HoloScript project root path.
 * Checks HOLOSCRIPT_ROOT env var first, then walks up from cwd.
 */
export function getHoloScriptProjectPath(): string {
  if (process.env.HOLOSCRIPT_ROOT) {
    return process.env.HOLOSCRIPT_ROOT;
  }
  // Default: assume Studio is running from packages/studio within the monorepo
  return path.resolve(process.cwd(), '..', '..');
}
