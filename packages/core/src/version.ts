/**
 * HoloScript Version Module
 *
 * Provides build-time version and git commit information.
 * Values are injected at build time by tsup's `define` option.
 *
 * Usage:
 *   import { HOLOSCRIPT_VERSION, GIT_COMMIT_SHA, getVersionString } from '@holoscript/core';
 *   const version = getVersionString(); // "5.1.0+abc1234"
 */

/** Injected at build time by tsup define */
declare const __HOLOSCRIPT_VERSION__: string;
declare const __GIT_COMMIT_SHA__: string;
declare const __BUILD_TIMESTAMP__: string;

/**
 * The semantic version of @holoscript/core (e.g. "5.1.0").
 * Falls back to 'dev' when running from source without a build step.
 */
export const HOLOSCRIPT_VERSION: string =
  typeof __HOLOSCRIPT_VERSION__ !== 'undefined' ? __HOLOSCRIPT_VERSION__ : 'dev';

/**
 * The short git commit SHA at build time (e.g. "abc1234").
 * Falls back to 'unknown' when running from source without a build step.
 */
export const GIT_COMMIT_SHA: string =
  typeof __GIT_COMMIT_SHA__ !== 'undefined' ? __GIT_COMMIT_SHA__ : 'unknown';

/**
 * ISO-8601 timestamp of when the build was produced.
 * Falls back to 'unknown' when running from source without a build step.
 */
export const BUILD_TIMESTAMP: string =
  typeof __BUILD_TIMESTAMP__ !== 'undefined' ? __BUILD_TIMESTAMP__ : 'unknown';

/**
 * Returns a combined version string suitable for display.
 * Format: "<version>+<sha>" (e.g. "5.1.0+abc1234")
 */
export function getVersionString(): string {
  const sha = GIT_COMMIT_SHA !== 'unknown' ? `+${GIT_COMMIT_SHA}` : '';
  return `${HOLOSCRIPT_VERSION}${sha}`;
}

/**
 * Returns full version metadata as a structured object.
 */
export function getVersionInfo(): {
  version: string;
  gitCommitSha: string;
  buildTimestamp: string;
  versionString: string;
} {
  return {
    version: HOLOSCRIPT_VERSION,
    gitCommitSha: GIT_COMMIT_SHA,
    buildTimestamp: BUILD_TIMESTAMP,
    versionString: getVersionString(),
  };
}
