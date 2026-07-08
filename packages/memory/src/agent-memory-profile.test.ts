import { describe, expect, it } from 'vitest';

import {
  AGENT_MEMORY_PROFILE_SCHEMA,
  HOLOSCRIPT_AGENT_RUNTIME_PACKAGE,
  buildAgentMemoryProfile,
  memoryEntryFromAgentProfile,
} from './agent-memory-profile.js';

describe('agent memory profiles', () => {
  it('models HoloScript edge agents without making Jetson the default', () => {
    const profile = buildAgentMemoryProfile({
      agentId: 'edge-builder',
      family: 'holoscript',
      workspaceId: 'edge-fleet',
      nodeProfile: 'jetson-reference',
      mcpUrl: 'http://edge-node.example.test:7411/mcp',
      tags: ['owned-metal'],
      capabilities: ['compile', 'memory'],
    });

    expect(profile.schema).toBe(AGENT_MEMORY_PROFILE_SCHEMA);
    expect(profile.runtimePackage).toBe(HOLOSCRIPT_AGENT_RUNTIME_PACKAGE);
    expect(profile.workspaceId).toBe('edge-fleet');
    expect(profile.node.jetsonReferenceProfile).toBe(true);
    expect(profile.node.rule).toContain('not a package default');
    expect(profile.tags).toEqual(['agent-profile', 'holoscript', 'owned-metal']);
  });

  it('converts a profile into a regular memory entry payload', () => {
    const profile = buildAgentMemoryProfile({
      agentId: 'agent-a',
      family: 'openai',
    });
    const entry = memoryEntryFromAgentProfile(profile);

    expect(entry.authorAgent).toBe('agent-a');
    expect(entry.section).toBe('D');
    expect(entry.type).toBe('pattern');
    expect(entry.domain).toBe('agent-profile');
    expect(entry.tags).toEqual(['agent-profile', 'openai']);
    expect(JSON.parse(entry.content).schema).toBe(AGENT_MEMORY_PROFILE_SCHEMA);
  });
});
