/**
 * Hand-off fix (v): tool-result caps reach the model capped (12k read, 8k stdout head+tail).
 * Roots resolve at module load, so env is stubbed before the dynamic import (as tools-roots.test.ts).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'hs-agent-caps-'));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let runTool: (use: any) => Promise<any>;

beforeAll(async () => {
  process.env.HOLOSCRIPT_AGENT_READ_ROOTS = root;
  // The small caps apply only under the edge-small profile (PR #553 review note 3).
  process.env.HOLOSCRIPT_AGENT_CLAIM_PROFILE = 'edge-small';
  ({ runTool } = await import('../tools.js'));
});

describe('read_file cap (default 12k chars, was 200k)', () => {
  it('truncates a 50k-char file to 12k + a marker naming the full size', async () => {
    const p = join(root, 'big.txt');
    writeFileSync(p, 'r'.repeat(50_000));
    const res = await runTool({
      type: 'tool_use',
      id: 'r1',
      name: 'read_file',
      input: { path: p },
    });
    expect(res.is_error).toBeFalsy();
    expect(res.content.length).toBeLessThan(12_100);
    expect(res.content).toMatch(/…\[truncated, full file is 50000 chars\]$/);
  });
  it('HOLOSCRIPT_AGENT_READ_CAP_CHARS overrides at call time', async () => {
    const p = join(root, 'mid.txt');
    writeFileSync(p, 's'.repeat(5_000));
    process.env.HOLOSCRIPT_AGENT_READ_CAP_CHARS = '1000';
    try {
      const res = await runTool({
        type: 'tool_use',
        id: 'r2',
        name: 'read_file',
        input: { path: p },
      });
      expect(res.content.startsWith('s'.repeat(1000) + '\n…[truncated')).toBe(true);
    } finally {
      delete process.env.HOLOSCRIPT_AGENT_READ_CAP_CHARS;
    }
  });
  it('small files pass through unchanged', async () => {
    const p = join(root, 'small.txt');
    writeFileSync(p, 'hello');
    const res = await runTool({
      type: 'tool_use',
      id: 'r3',
      name: 'read_file',
      input: { path: p },
    });
    expect(res.content).toBe('hello');
  });
});

describe('caps are edge-small only; other profiles get full output by default', () => {
  it('promptCaps: edge-small 12k/8k/8k; big-context, legacy and unset get 200k/200k/uncapped', async () => {
    const { promptCaps } = await import('../handoff.js');
    expect(promptCaps({ HOLOSCRIPT_AGENT_CLAIM_PROFILE: 'edge-small' })).toEqual({
      readChars: 12_000,
      responseChars: 8_000,
      stdoutChars: 8_000,
    });
    expect(promptCaps({ HOLOSCRIPT_AGENT_CLAIM_PROFILE: ' Edge-Small ' }).readChars).toBe(12_000);
    for (const env of [{}, { HOLOSCRIPT_AGENT_CLAIM_PROFILE: 'big-context' }, { HOLOSCRIPT_AGENT_CLAIM_PROFILE: 'legacy' }]) {
      expect(promptCaps(env)).toEqual({
        readChars: 200_000,
        responseChars: 200_000,
        stdoutChars: Number.POSITIVE_INFINITY,
      });
    }
    // explicit env override still wins in any profile
    expect(
      promptCaps({ HOLOSCRIPT_AGENT_CLAIM_PROFILE: 'big-context', HOLOSCRIPT_AGENT_READ_CAP_CHARS: '500' }).readChars
    ).toBe(500);
  });
  it('read_file under big-context returns a 50k-char file whole; bash output is not capped', async () => {
    const p = join(root, 'big-ctx.txt');
    writeFileSync(p, 'b'.repeat(50_000));
    process.env.HOLOSCRIPT_AGENT_CLAIM_PROFILE = 'big-context';
    try {
      const res = await runTool({ type: 'tool_use', id: 'bc1', name: 'read_file', input: { path: p } });
      expect(res.is_error).toBeFalsy();
      expect(res.content).toBe('b'.repeat(50_000));
    } finally {
      process.env.HOLOSCRIPT_AGENT_CLAIM_PROFILE = 'edge-small';
    }
  });
});
