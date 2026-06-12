/**
 * Tests for the HoloClaw embodiment artifact (non-headless agents).
 */

import { describe, it, expect } from 'vitest';
import {
  avatarHueForSkill,
  activityChannelForSkill,
  buildAgentAvatarHolo,
  buildEmbodiedAgentCard,
  buildEmbodimentActivityEntry,
  type HoloClawAgentIdentity,
} from '../embodiment';

const ID: HoloClawAgentIdentity = {
  skill: 'research',
  agentId: 'holoclaw-research-1a2b3c4d',
  teamId: 'team_1777834718247_unr35n',
  handle: 'holoclaw-research',
  pid: 4242,
  startedAt: '2026-06-12T00:00:00.000Z',
};

describe('avatarHueForSkill', () => {
  it('is deterministic and in range 0-359', () => {
    const a = avatarHueForSkill('research');
    const b = avatarHueForSkill('research');
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(360);
  });

  it('differs across distinct skills', () => {
    expect(avatarHueForSkill('research')).not.toBe(avatarHueForSkill('self-improve'));
  });
});

describe('activityChannelForSkill', () => {
  it('matches the daemon outbox channel convention', () => {
    expect(activityChannelForSkill('research')).toBe('skill:research');
  });
});

describe('buildAgentAvatarHolo', () => {
  it('emits a .holo composition with real avatar + presence traits', () => {
    const holo = buildAgentAvatarHolo(ID, 'running');
    expect(holo).toContain('composition "HoloClaw — research"');
    expect(holo).toContain('@avatar_embodiment(');
    expect(holo).toContain('@presence(sync:');
    expect(holo).toContain('object "HoloClawAgent_research"');
    expect(holo).toContain('status: "running"');
    expect(holo).toContain('agentId: "holoclaw-research-1a2b3c4d"');
  });

  it('sanitizes skill names with hyphens into a valid object identifier', () => {
    const holo = buildAgentAvatarHolo({ ...ID, skill: 'self-improve' }, 'running');
    expect(holo).toContain('object "HoloClawAgent_self_improve"');
  });
});

describe('buildEmbodiedAgentCard', () => {
  it('carries identity, status, presence, channel, hue, and the avatar holo', () => {
    const card = buildEmbodiedAgentCard(ID, 'running', true);
    expect(card.agentId).toBe(ID.agentId);
    expect(card.handle).toBe('holoclaw-research');
    expect(card.skill).toBe('research');
    expect(card.status).toBe('running');
    expect(card.presence).toBe(true);
    expect(card.activityChannel).toBe('skill:research');
    expect(card.pid).toBe(4242);
    expect(card.hue).toBe(avatarHueForSkill('research'));
    expect(card.avatarHolo).toContain('composition "HoloClaw — research"');
  });

  it('omits pid/startedAt when not provided', () => {
    const card = buildEmbodiedAgentCard(
      { skill: 'research', agentId: 'a', teamId: 't', handle: 'h' },
      'spawning',
      false
    );
    expect(card.pid).toBeUndefined();
    expect(card.startedAt).toBeUndefined();
    expect(card.presence).toBe(false);
  });
});

describe('buildEmbodimentActivityEntry', () => {
  it('builds a structured agent_embodiment event on the embodiment channel', () => {
    const card = buildEmbodiedAgentCard(ID, 'running', true);
    const entry = buildEmbodimentActivityEntry(card, '2026-06-12T01:00:00.000Z');
    expect(entry.channel).toBe('holoclaw:embodiment');
    expect(entry.timestamp).toBe('2026-06-12T01:00:00.000Z');
    expect(entry.message).toContain('holoclaw-research');
    expect(entry.message).toContain('status:running');
    expect(entry.metadata?.kind).toBe('agent_embodiment');
    expect(entry.metadata?.agentId).toBe(ID.agentId);
    expect(entry.metadata?.avatarHolo).toContain('@avatar_embodiment(');
  });

  it('marks a stopped agent so the deck retires the avatar', () => {
    const card = buildEmbodiedAgentCard(ID, 'stopped', false);
    const entry = buildEmbodimentActivityEntry(card);
    expect(entry.message).toContain('⬡✕');
    expect(entry.metadata?.status).toBe('stopped');
  });
});
