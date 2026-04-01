/**
 * RaftConsensus Production Tests
 * Sprint CLIII - Raft leader election, log replication, state machine
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RaftConsensus } from '../RaftConsensus';
import { ConsensusNode } from '../ConsensusTypes';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeNode(id: string, config: Record<string, any> = {}): ConsensusNode {
  return { id, state: 'follower', term: 0, ...config };
}

/**
 * Create a small Raft cluster connected by direct message passing.
 */
function makeCluster(nodeIds: string[]) {
  const nodes = nodeIds.map(
    (id) =>
      new RaftConsensus(id, {
        electionTimeout: [50, 100],
        heartbeatInterval: 20,
        timeout: 500,
      })
  );

  // Wire up message passing
  for (const node of nodes) {
    node.setMessageSender((toId, msg) => {
      const target = nodes.find((n) => n.nodeId === toId);
      target?.handleMessage(node.nodeId, msg);
    });
  }

  // Add peers to each node's registry
  for (const node of nodes) {
    for (const peer of nodes) {
      if (peer.nodeId !== node.nodeId) {
        node.addNode(makeNode(peer.nodeId));
      }
    }
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RaftConsensus', () => {
  let node: RaftConsensus;

  beforeEach(() => {
    vi.useFakeTimers();
    node = new RaftConsensus('node-1', {
      electionTimeout: [100, 200],
      heartbeatInterval: 50,
      timeout: 1000,
    });
  });

  afterEach(() => {
    node.stop();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Construction / initial state
  // -------------------------------------------------------------------------

  describe('construction', () => {
    it('starts as follower', () => {
      expect(node.getDebugState().state).toBe('follower');
    });

    it('starts with term 0', () => {
      expect(node.getDebugState().term).toBe(0);
    });

    it('has no leader initially', () => {
      expect(node.getLeaderId()).toBeNull();
    });

    it('is not a leader initially', () => {
      expect(node.isLeader()).toBe(false);
    });

    it('includes self in nodes', () => {
      const nodes = node.getNodes();
      expect(nodes.some((n) => n.id === 'node-1')).toBe(true);
    });

    it('starts with empty state machine', () => {
      expect(node.getState().size).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // addNode / removeNode / getNodes
  // -------------------------------------------------------------------------

  describe('addNode', () => {
    it('adds a peer node', () => {
      node.addNode(makeNode('node-2'));
      expect(node.getNodes().some((n) => n.id === 'node-2')).toBe(true);
    });

    it('emits node:joined event', () => {
      const handler = vi.fn();
      node.on('node:joined', handler);
      node.addNode(makeNode('node-2'));
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('removeNode', () => {
    it('removes a peer node', () => {
      node.addNode(makeNode('node-2'));
      node.removeNode('node-2');
      expect(node.getNodes().some((n) => n.id === 'node-2')).toBe(false);
    });

    it('emits node:left event', () => {
      const handler = vi.fn();
      node.on('node:left', handler);
      node.addNode(makeNode('node-2'));
      node.removeNode('node-2');
      expect(handler).toHaveBeenCalledWith('node-2');
    });
  });

  // -------------------------------------------------------------------------
  // propose - non-leader
  // -------------------------------------------------------------------------

  describe('propose (non-leader)', () => {
    it('rejects proposal when not leader with descriptive error', async () => {
      const result = await node.propose('key', 'value');
      expect(result.accepted).toBe(false);
      // Error is either 'Not leader. Forward to X' or 'No leader elected'
      expect(result.error).toBeTruthy();
      expect(result.error!.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // get / getState
  // -------------------------------------------------------------------------

  describe('get', () => {
    it('returns undefined for missing key', () => {
      expect(node.get('nothere')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Election
  // -------------------------------------------------------------------------

  describe('election trigger', () => {
    it('transitions node to candidate after triggerElection()', () => {
      node.triggerElection();
      expect(node.getDebugState().state).toBe('candidate');
    });

    it('increments term when becoming candidate', () => {
      node.triggerElection();
      expect(node.getDebugState().term).toBe(1);
    });

    it('becomes candidate after triggerElection() (single node)', () => {
      // Single node triggers candidacy — it won't get vote responses so stays candidate
      // (or might be leader if quorum=1 is reached synchronously)
      node.triggerElection();
      const debug = node.getDebugState();
      expect(['candidate', 'leader']).toContain(debug.state);
      expect(debug.term).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Raft message handling
  // -------------------------------------------------------------------------

  describe('handleMessage - append_entries', () => {
    it('resets to follower when receiving append_entries from leader', () => {
      node.triggerElection(); // become candidate
      node.handleMessage('leader-node', {
        type: 'append_entries',
        term: 5,
        senderId: 'leader-node',
        prevLogIndex: -1,
        prevLogTerm: 0,
        entries: [],
        leaderCommit: -1,
      });
      // Higher term makes it step down to follower
      expect(node.getDebugState().state).toBe('follower');
      expect(node.getDebugState().term).toBe(5);
    });
  });

  describe('handleMessage - request_vote', () => {
    it('grants vote when conditions are met', () => {
      const votes: any[] = [];
      node.setMessageSender((_to, msg) => votes.push(msg));

      node.handleMessage('candidate', {
        type: 'request_vote',
        term: 2,
        senderId: 'candidate',
        lastLogIndex: -1,
        lastLogTerm: 0,
      });

      const response = votes.find((v) => v.type === 'request_vote_response');
      expect(response?.voteGranted).toBe(true);
    });

    it('denies vote when already voted for another candidate', () => {
      const votes: any[] = [];
      node.setMessageSender((_to, msg) => votes.push(msg));

      // Vote for candidate-a
      node.handleMessage('candidate-a', {
        type: 'request_vote',
        term: 2,
        senderId: 'candidate-a',
        lastLogIndex: -1,
        lastLogTerm: 0,
      });

      // Try to vote for candidate-b in the same term
      node.handleMessage('candidate-b', {
        type: 'request_vote',
        term: 2,
        senderId: 'candidate-b',
        lastLogIndex: -1,
        lastLogTerm: 0,
      });

      const responses = votes.filter((v) => v.type === 'request_vote_response');
      expect(responses[0].voteGranted).toBe(true);
      expect(responses[1].voteGranted).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // getDebugState
  // -------------------------------------------------------------------------

  describe('getDebugState', () => {
    it('returns all debug fields', () => {
      const debug = node.getDebugState();
      expect(debug).toMatchObject({
        nodeId: 'node-1',
        state: expect.any(String),
        term: expect.any(Number),
        votedFor: null,
        leaderId: null,
        logLength: 0,
        commitIndex: -1,
        lastApplied: -1,
      });
    });
  });

  // -------------------------------------------------------------------------
  // start / stop
  // -------------------------------------------------------------------------

  describe('start / stop', () => {
    it('starts without throwing', () => {
      expect(() => node.start()).not.toThrow();
      node.stop();
    });

    it('stop clears timers without throwing', () => {
      node.start();
      expect(() => node.stop()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Multi-node cluster integration
  // -------------------------------------------------------------------------

  describe('multi-node cluster', () => {
    let cluster: RaftConsensus[];

    beforeEach(() => {
      // Use real timers for cluster tests to avoid setInterval infinite loop
      vi.useRealTimers();
      cluster = makeCluster(['n1', 'n2', 'n3']);
    });

    afterEach(() => {
      cluster.forEach((n) => n.stop());
      vi.useFakeTimers(); // restore for subsequent single-node tests
    });

    it('cluster creation wires up 3 nodes', () => {
      expect(cluster).toHaveLength(3);
      for (const node of cluster) {
        expect(node.getNodes().length).toBe(3);
      }
    });

    it('triggering election on n1 changes its state', () => {
      cluster[0].triggerElection();
      // With wired peers responding synchronously, n1 may immediately become
      // leader (if peers grant vote in-process) or stay candidate
      const state = cluster[0].getDebugState().state;
      expect(['candidate', 'leader']).toContain(state);
      expect(cluster[0].getDebugState().term).toBeGreaterThan(0);
    });

    it('vote request from candidate is forwarded to peers', () => {
      const received: any[] = [];
      cluster[0].setMessageSender((toId, msg) => {
        const target = cluster.find((n) => n.nodeId === toId);
        if (target) {
          received.push({ toId, msg });
          target.handleMessage(cluster[0].nodeId, msg);
        }
      });

      cluster[0].triggerElection();
      const requestVotes = received.filter((r) => r.msg.type === 'request_vote');
      expect(requestVotes.length).toBeGreaterThan(0);
    });

    it('gains leader status when peers grant votes', () => {
      cluster[0].triggerElection();
      const term = cluster[0].getDebugState().term;

      cluster[0].handleMessage('n2', {
        type: 'request_vote_response',
        term,
        senderId: 'n2',
        voteGranted: true,
      });
      cluster[0].handleMessage('n3', {
        type: 'request_vote_response',
        term,
        senderId: 'n3',
        voteGranted: true,
      });

      // With 3 nodes, quorum=2. Self vote + n2 vote = 2 >= 2
      cluster[0].stop(); // stop heartbeat before assertion
      expect(cluster[0].isLeader()).toBe(true);
    });

    it('leader handles append_entries_response without throwing', () => {
      cluster[0].triggerElection();
      const term = cluster[0].getDebugState().term;
      cluster[0].handleMessage('n2', {
        type: 'request_vote_response',
        term,
        senderId: 'n2',
        voteGranted: true,
      });
      cluster[0].handleMessage('n3', {
        type: 'request_vote_response',
        term,
        senderId: 'n3',
        voteGranted: true,
      });
      cluster[0].stop();

      if (cluster[0].isLeader()) {
        cluster[0].handleMessage('n2', {
          type: 'append_entries_response',
          term,
          senderId: 'n2',
          success: true,
          matchIndex: -1,
        });
      }
    });
  });
});
