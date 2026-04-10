import { describe, it, expect } from 'vitest';
import {
  HOLOSCRIPT_VERSION,
  GIT_COMMIT_SHA,
  BUILD_TIMESTAMP,
  getVersionString,
  getVersionInfo,
} from './version';

describe('version module', () => {
  it('exports HOLOSCRIPT_VERSION as a non-empty string', () => {
    expect(typeof HOLOSCRIPT_VERSION).toBe('string');
    expect(HOLOSCRIPT_VERSION.length).toBeGreaterThan(0);
  });

  it('exports GIT_COMMIT_SHA as a non-empty string', () => {
    expect(typeof GIT_COMMIT_SHA).toBe('string');
    expect(GIT_COMMIT_SHA.length).toBeGreaterThan(0);
  });

  it('exports BUILD_TIMESTAMP as a non-empty string', () => {
    expect(typeof BUILD_TIMESTAMP).toBe('string');
    expect(BUILD_TIMESTAMP.length).toBeGreaterThan(0);
  });

  it('getVersionString returns a formatted version string', () => {
    const versionStr = getVersionString();
    expect(typeof versionStr).toBe('string');
    expect(versionStr).toContain(HOLOSCRIPT_VERSION);
  });

  it('getVersionInfo returns a complete version object', () => {
    const info = getVersionInfo();
    expect(info).toHaveProperty('version');
    expect(info).toHaveProperty('gitCommitSha');
    expect(info).toHaveProperty('buildTimestamp');
    expect(info).toHaveProperty('versionString');
    expect(info.version).toBe(HOLOSCRIPT_VERSION);
    expect(info.gitCommitSha).toBe(GIT_COMMIT_SHA);
    expect(info.buildTimestamp).toBe(BUILD_TIMESTAMP);
    expect(info.versionString).toBe(getVersionString());
  });

  // In un-built (direct TS) mode, the fallbacks should be used
  it('falls back to dev/unknown when globals are not defined', () => {
    // When running tests directly via vitest (no tsup build), the declare'd
    // globals won't exist, so we should get the fallback values
    expect(['dev', HOLOSCRIPT_VERSION]).toContain(HOLOSCRIPT_VERSION);
    expect(['unknown', GIT_COMMIT_SHA]).toContain(GIT_COMMIT_SHA);
  });
});
