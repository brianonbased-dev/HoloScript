/**
 * Tests for embodied-agent roster derivation (HoloClaw deck data wiring).
 */

import { describe, it, expect } from 'vitest';
import { deriveEmbodiedAgents, type ActivityLike } from '../embodiedAgents';

function embodiment(
  agentId: string,
  status: string,
  extra: Record<string, unknown> = {}
): ActivityLike {
  return {
    metadata: {
      kind: 'agent_embodiment',
      agentId,
      handle: `holoclaw-${agentId}`,
      skill: 'research',
      status,
      presence: true,
      hue: 200,
      ...extra,
    },
  };
}

describe('deriveEmbodiedAgents', () => {
  it('returns [] for an empty feed', () => {
    expect(deriveEmbodiedAgents([])).toEqual([]);
  });

  it('ignores non-embodiment and malformed entries', () => {
    const entries: ActivityLike[] = [
      { metadata: { kind: 'skill_log', message: 'hi' } },
      { metadata: undefined },
      {},
      { metadata: { kind: 'agent_embodiment' } }, // no agentId
    ];
    expect(deriveEmbodiedAgents(entries)).toEqual([]);
  });

  it('builds an agent from an agent_embodiment event', () => {
    const agents = deriveEmbodiedAgents([
      embodiment('a1', 'running', { hue: 123, handle: 'holoclaw-research' }),
    ]);
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      agentId: 'a1',
      handle: 'holoclaw-research',
      skill: 'research',
      status: 'running',
      presence: true,
      hue: 123,
    });
  });

  it('keeps the latest status per agent (feed is newest-first)', () => {
    // newest first: idle is newer than running
    const entries = [embodiment('a1', 'idle'), embodiment('a1', 'running')];
    const agents = deriveEmbodiedAgents(entries);
    expect(agents).toHaveLength(1);
    expect(agents[0].status).toBe('idle');
  });

  it('retires a stopped agent', () => {
    const entries = [embodiment('a1', 'stopped'), embodiment('a1', 'running')];
    expect(deriveEmbodiedAgents(entries)).toEqual([]);
  });

  it('keeps other agents when one stops', () => {
    const entries = [
      embodiment('a2', 'running'),
      embodiment('a1', 'stopped'),
      embodiment('a1', 'running'),
    ];
    expect(deriveEmbodiedAgents(entries).map((a) => a.agentId)).toEqual(['a2']);
  });

  it('defaults unknown status to idle, missing handle to agentId, missing presence/hue safely', () => {
    const agents = deriveEmbodiedAgents([
      { metadata: { kind: 'agent_embodiment', agentId: 'x', status: 'weird' } },
    ]);
    expect(agents[0].status).toBe('idle');
    expect(agents[0].handle).toBe('x');
    expect(agents[0].presence).toBe(false);
    expect(agents[0].hue).toBe(0);
  });
});
