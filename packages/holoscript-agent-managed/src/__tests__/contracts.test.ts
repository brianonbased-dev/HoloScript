import { describe, expect, it } from 'vitest';

import {
  MAX_INITIAL_EVENTS,
  buildManagedAgentCreateInput,
  buildManagedAgentSessionCreateInput,
  buildManagedAgentThreadStreamRequest,
  buildManagedAgentUpdateContract,
  type ManagedAgentInitialEvent,
} from '../contracts';

describe('Managed Agents control-plane contracts', () => {
  it('preserves model effort and makes update concurrency explicit', () => {
    const created = buildManagedAgentCreateInput({
      name: 'Repository agent',
      model: {
        id: 'claude-opus-4-8',
        effort: { type: 'max' },
      },
    });
    const optimistic = buildManagedAgentUpdateContract({
      version: 7,
      description: 'Validated update',
    });
    const unconditional = buildManagedAgentUpdateContract({
      description: 'Last writer wins',
    });

    expect(created.model).toEqual({
      id: 'claude-opus-4-8',
      effort: { type: 'max' },
    });
    expect(optimistic.concurrency).toBe('optimistic');
    expect(unconditional.concurrency).toBe('last-write-wins');
    expect(() => buildManagedAgentUpdateContract({ version: 0 })).toThrow(/greater than or equal/);
  });

  it('accepts only the supported bounded initial session events', () => {
    const initialEvents: ManagedAgentInitialEvent[] = [
      {
        type: 'user.message',
        content: [{ type: 'text', text: 'Inspect the repository.' }],
      },
      {
        type: 'user.define_outcome',
        rubric: { criteria: [{ name: 'tests', target: 'pass' }] },
      },
    ];
    const request = buildManagedAgentSessionCreateInput({
      agent: 'agent_fixture',
      environment_id: 'env_fixture',
      initial_events: initialEvents,
    });

    expect(request.initial_events).toEqual(initialEvents);
    expect(() =>
      buildManagedAgentSessionCreateInput({
        agent: 'agent_fixture',
        environment_id: 'env_fixture',
        initial_events: Array.from({ length: MAX_INITIAL_EVENTS + 1 }, () => ({
          type: 'user.message' as const,
          content: [{ type: 'text' as const, text: 'work' }],
        })),
      })
    ).toThrow(/at most 50/);
    expect(() =>
      buildManagedAgentSessionCreateInput({
        agent: 'agent_fixture',
        environment_id: 'env_fixture',
        initial_events: [
          { type: 'user.define_outcome', rubric: { id: 1 } },
          { type: 'user.define_outcome', rubric: { id: 2 } },
        ],
      })
    ).toThrow(/at most one/);
  });

  it('builds a thread-scoped event-delta request without cross-thread ambiguity', () => {
    const request = buildManagedAgentThreadStreamRequest({
      sessionId: 'session fixture',
      threadId: 'thread/child',
      eventDeltas: ['agent.message', 'agent.thinking', 'agent.message'],
    });

    expect(request.scope).toBe('thread');
    expect(request.path).toBe('/v1/sessions/session%20fixture/threads/thread%2Fchild/stream');
    expect(request.eventDeltas).toEqual(['agent.message', 'agent.thinking']);
    expect(request.query).toBe(
      'event_deltas%5B%5D=agent.message&event_deltas%5B%5D=agent.thinking'
    );
  });
});
