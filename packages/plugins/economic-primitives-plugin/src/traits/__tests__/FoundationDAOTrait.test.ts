import { describe, expect, it } from 'vitest';
import { createFoundationDAOHandler } from '../FoundationDAOTrait';
import type { HSPlusNode } from '../types';

describe('FoundationDAOTrait', () => {
  it('initializes DAO state on attach', () => {
    const handler = createFoundationDAOHandler();
    const node: HSPlusNode = { id: 'dao-1' };
    const events: Array<{ type: string; payload?: unknown }> = [];

    handler.onAttach(node, handler.defaultConfig, {
      emit: (type, payload) => events.push({ type, payload }),
    });

    const state = node.__daoState as any;
    expect(state).toBeDefined();
    expect(state.treasuryBalanceX402).toBe(5000000);
    expect(state.allocations).toEqual([]);
    expect(events.map((e) => e.type)).toContain('dao:initialized');
  });

  it('deduplicates weighted votes per voter and concludes with quorum', () => {
    const handler = createFoundationDAOHandler();
    const node: HSPlusNode = { id: 'dao-2' };
    const emitted: string[] = [];

    const config = {
      ...handler.defaultConfig,
      quorumPercent: 1,
      executionDelayHours: 999, // keep proposal in passed state for assertion
    };

    handler.onAttach(node, config, { emit: (type) => emitted.push(type) });

    handler.onEvent(node, config, { emit: (type) => emitted.push(type) }, {
      type: 'dao:propose',
      payload: { title: 'Fund autonomous zone indexing' },
    });

    const state = node.__daoState as any;
    const proposal = state.activeProposals[0];

    handler.onEvent(node, config, { emit: (type) => emitted.push(type) }, {
      type: 'dao:vote',
      payload: { proposalId: proposal.id, voterId: 'agent_a', support: true, weight: 2 },
    });

    handler.onEvent(node, config, { emit: (type) => emitted.push(type) }, {
      type: 'dao:vote',
      payload: { proposalId: proposal.id, voterId: 'agent_a', support: false, weight: 1 },
    });

    expect(proposal.votesFor).toBe(0);
    expect(proposal.votesAgainst).toBe(1);
    expect(proposal.status).toBe('rejected');
    expect(emitted).toContain('dao:proposal_concluded');
  });

  it('supports autonomous agentic voting and executes funding allocation', () => {
    const handler = createFoundationDAOHandler();
    const node: HSPlusNode = { id: 'dao-3' };
    const emitted: Array<{ type: string; payload?: any }> = [];

    const config = {
      ...handler.defaultConfig,
      quorumPercent: 1,
      executionDelayHours: 0,
    };

    handler.onAttach(node, config, {
      emit: (type, payload) => emitted.push({ type, payload }),
    });

    handler.onEvent(node, config, { emit: (type, payload) => emitted.push({ type, payload }) }, {
      type: 'dao:propose',
      payload: {
        title: 'Fund sovereign spatial zone Z1',
        zoneId: 'zone-z1',
        requestedAmountX402: 250000,
      },
    });

    const state = node.__daoState as any;
    const proposal = state.activeProposals[0];

    handler.onEvent(node, config, { emit: (type, payload) => emitted.push({ type, payload }) }, {
      type: 'dao:autonomous_vote',
      payload: {
        proposalId: proposal.id,
        agents: [
          { agentId: 'agent_a', support: true, weight: 2 },
          { agentId: 'agent_b', support: true, weight: 2 },
        ],
      },
    });

    expect(proposal.status).toBe('executed');
    expect(state.allocations).toHaveLength(1);
    expect(state.allocations[0].zoneId).toBe('zone-z1');
    expect(state.allocations[0].amountX402).toBe(250000);
    expect(state.treasuryBalanceX402).toBe(5000000 - 250000);

    const eventTypes = emitted.map((e) => e.type);
    expect(eventTypes).toContain('dao:funding_allocated');
    expect(eventTypes).toContain('dao:executed');
  });

  it('emits funding_failed when treasury is insufficient', () => {
    const handler = createFoundationDAOHandler();
    const node: HSPlusNode = { id: 'dao-4' };
    const emitted: Array<{ type: string; payload?: any }> = [];

    const config = {
      ...handler.defaultConfig,
      quorumPercent: 1,
      executionDelayHours: 0,
    };

    handler.onAttach(node, config, {
      emit: (type, payload) => emitted.push({ type, payload }),
    });

    const state = node.__daoState as any;
    state.treasuryBalanceX402 = 100;

    handler.onEvent(node, config, { emit: (type, payload) => emitted.push({ type, payload }) }, {
      type: 'dao:propose',
      payload: {
        title: 'Huge funding ask',
        zoneId: 'zone-z2',
        requestedAmountX402: 5000,
      },
    });

    const proposal = state.activeProposals[0];

    handler.onEvent(node, config, { emit: (type, payload) => emitted.push({ type, payload }) }, {
      type: 'dao:autonomous_vote',
      payload: {
        proposalId: proposal.id,
        agents: [{ agentId: 'agent_a', support: true, weight: 5 }],
      },
    });

    expect(proposal.status).toBe('passed');
    expect(state.allocations).toHaveLength(0);
    expect(state.treasuryBalanceX402).toBe(100);
    expect(emitted.map((e) => e.type)).toContain('dao:funding_failed');
  });
});
