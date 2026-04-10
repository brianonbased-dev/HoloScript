import { describe, it, expect, beforeEach } from 'vitest';
import { DistributedClaimer } from '../distributed-claimer';
import { MeshDiscovery, GossipProtocol } from '../mesh';
import type { GossipPacket } from '../mesh';

describe('DistributedClaimer', () => {
  let mesh: MeshDiscovery;
  let gossip: GossipProtocol;
  let claimer: DistributedClaimer;

  beforeEach(() => {
    mesh = new MeshDiscovery('node-1');
    gossip = new GossipProtocol();
    claimer = new DistributedClaimer(mesh, gossip, { claimTtlMs: 5000 });
  });

  it('claims an unclaimed task', () => {
    const result = claimer.claim('task-1', 'agent-a');
    expect(result.success).toBe(true);
    expect(result.claimedBy).toBe('agent-a');
    expect(result.taskId).toBe('task-1');
  });

  it('allows the same agent to re-claim (refresh)', () => {
    claimer.claim('task-1', 'agent-a');
    const result = claimer.claim('task-1', 'agent-a');
    expect(result.success).toBe(true);
    expect(result.claimedBy).toBe('agent-a');
  });

  it('rejects lower-priority agent on conflict', () => {
    claimer.claim('task-1', 'agent-a', 3);
    const result = claimer.claim('task-1', 'agent-b', 5); // higher number = lower priority
    expect(result.success).toBe(false);
    expect(result.claimedBy).toBe('agent-a');
  });

  it('higher-priority agent wins conflict', () => {
    claimer.claim('task-1', 'agent-a', 5);
    const result = claimer.claim('task-1', 'agent-b', 2); // lower number = higher priority
    expect(result.success).toBe(true);
    expect(result.claimedBy).toBe('agent-b');
    expect(result.contested).toEqual(['agent-a']);
  });

  it('releases a claim', () => {
    claimer.claim('task-1', 'agent-a');
    const released = claimer.release('task-1', 'agent-a');
    expect(released).toBe(true);
    expect(claimer.getClaimHolder('task-1')).toBeUndefined();
  });

  it('cannot release another agent claim', () => {
    claimer.claim('task-1', 'agent-a');
    const released = claimer.release('task-1', 'agent-b');
    expect(released).toBe(false);
    expect(claimer.getClaimHolder('task-1')?.agentId).toBe('agent-a');
  });

  it('confirms a claim (extends TTL)', () => {
    claimer.claim('task-1', 'agent-a');
    const confirmed = claimer.confirm('task-1', 'agent-a');
    expect(confirmed).toBe(true);
    const record = claimer.getClaimHolder('task-1');
    expect(record).toBeDefined();
    // Confirmed claims have extended TTL (10x)
    expect(record!.expiresAt).toBeGreaterThan(Date.now() + 40_000);
  });

  it('tracks multiple active claims', () => {
    claimer.claim('task-1', 'agent-a');
    claimer.claim('task-2', 'agent-b');
    claimer.claim('task-3', 'agent-a');
    const active = claimer.getActiveClaims();
    expect(active).toHaveLength(3);
  });

  it('broadcasts claims via gossip', () => {
    claimer.claim('task-1', 'agent-a');
    expect(gossip.getPoolSize()).toBeGreaterThan(0);
  });

  it('ingests gossip claim packets', () => {
    // Simulate a remote claim arriving via gossip
    const packet: GossipPacket = {
      id: 'pkt-remote-1',
      source: 'claimer:node-2',
      version: 1,
      payload: {
        type: 'claim',
        record: {
          taskId: 'task-remote',
          agentId: 'remote-agent',
          timestamp: Date.now() * 1000,
          priority: 3,
          expiresAt: Date.now() + 30_000,
        },
      },
      timestamp: Date.now(),
    };

    claimer.ingestGossip(packet);
    const holder = claimer.getClaimHolder('task-remote');
    expect(holder).toBeDefined();
    expect(holder!.agentId).toBe('remote-agent');
  });

  it('ingests gossip release packets', () => {
    claimer.claim('task-1', 'agent-a');

    const record = claimer.getClaimHolder('task-1')!;
    const packet: GossipPacket = {
      id: 'pkt-release',
      source: 'claimer:node-2',
      version: 1,
      payload: { type: 'release', record },
      timestamp: Date.now(),
    };

    claimer.ingestGossip(packet);
    expect(claimer.getClaimHolder('task-1')).toBeUndefined();
  });

  it('resolves gossip conflicts by priority', () => {
    claimer.claim('task-1', 'agent-a', 5);

    const packet: GossipPacket = {
      id: 'pkt-conflict',
      source: 'claimer:node-2',
      version: 1,
      payload: {
        type: 'claim',
        record: {
          taskId: 'task-1',
          agentId: 'agent-remote',
          timestamp: Date.now() * 1000,
          priority: 2, // Higher priority (lower number)
          expiresAt: Date.now() + 30_000,
        },
      },
      timestamp: Date.now(),
    };

    claimer.ingestGossip(packet);
    expect(claimer.getClaimHolder('task-1')?.agentId).toBe('agent-remote');
  });
});
