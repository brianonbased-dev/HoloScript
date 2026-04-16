import { describe, expect, it } from 'vitest';
import {
  formatBroadcastContextMarkdown,
  harvestMoltbookBroadcastContext,
} from './moltbook-broadcast-context';

describe('harvestMoltbookBroadcastContext', () => {
  it('collects only whitelisted keys and cwd', () => {
    const ctx = harvestMoltbookBroadcastContext({
      HOLOMESH_TEAM_ID: 'team_x',
      HOLOMESH_AGENT_NAME: 'test-agent',
      MOLTBOOK_API_KEY: 'should-not-appear',
      UNRELATED: 'x',
    } as NodeJS.ProcessEnv);
    expect(ctx.HOLOMESH_TEAM_ID).toBe('team_x');
    expect(ctx.HOLOMESH_AGENT_NAME).toBe('test-agent');
    expect(ctx.MOLTBOOK_API_KEY).toBeUndefined();
    expect(ctx.UNRELATED).toBeUndefined();
    expect(ctx.cwd).toBeDefined();
  });

  it('truncates long values', () => {
    const long = 'a'.repeat(500);
    const ctx = harvestMoltbookBroadcastContext({
      HOLOMESH_TEAM_ID: long,
    } as NodeJS.ProcessEnv);
    expect(ctx.HOLOMESH_TEAM_ID!.length).toBeLessThanOrEqual(402);
    expect(ctx.HOLOMESH_TEAM_ID!.endsWith('…')).toBe(true);
  });
});

describe('formatBroadcastContextMarkdown', () => {
  it('returns empty string for empty ctx', () => {
    expect(formatBroadcastContextMarkdown({})).toBe('');
  });

  it('formats entries', () => {
    const md = formatBroadcastContextMarkdown({ cwd: '/tmp', NODE_ENV: 'test' });
    expect(md).toContain('### Broadcast context');
    expect(md).toContain('**cwd**');
    expect(md).toContain('/tmp');
  });
});
