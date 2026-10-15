/**
 * /health reports the running commit so an outage can be tied to a deploy
 * (2026-10-15). Only a hex commit id is ever echoed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getBuildCommit } from '../build-identity';

const SHA = 'A9B27915647DF37B6CE7662A8B3DB3EAB14A3413';

describe('getBuildCommit', () => {
  it('reads RAILWAY_GIT_COMMIT_SHA first, lower-cased, with an 8-char short form', () => {
    expect(getBuildCommit({ RAILWAY_GIT_COMMIT_SHA: SHA, GIT_COMMIT: 'deadbeef' })).toEqual({
      sha: SHA.toLowerCase(),
      short: 'a9b27915',
      source: 'RAILWAY_GIT_COMMIT_SHA',
    });
  });

  it('falls back to a build-time HOLOSCRIPT_BUILD_SHA', () => {
    expect(getBuildCommit({ HOLOSCRIPT_BUILD_SHA: 'abc1234' })).toMatchObject({
      sha: 'abc1234',
      source: 'HOLOSCRIPT_BUILD_SHA',
    });
  });

  it('is null, not guessed, when nothing is set', () => {
    expect(getBuildCommit({})).toEqual({ sha: null, short: null, source: null });
  });

  it('never echoes a value that is not a hex commit id', () => {
    const r = getBuildCommit({
      RAILWAY_GIT_COMMIT_SHA: 'sk-live-not-a-sha',
      HOLOSCRIPT_BUILD_SHA: 'postgres://user:pw@db/x',
      GITHUB_SHA: 'abc',
    });
    expect(r).toEqual({ sha: null, short: null, source: null });
  });
});

describe('/health wiring', () => {
  it('the /health handler includes commit: getBuildCommit()', () => {
    const src = readFileSync(join(__dirname, '..', 'http-server.ts'), 'utf8');
    const start = src.indexOf("if (url === '/health')");
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, start + 1500);
    expect(block).toContain('commit: getBuildCommit()');
  });
});
