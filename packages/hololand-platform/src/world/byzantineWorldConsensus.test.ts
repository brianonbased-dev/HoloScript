import { describe, it, expect } from 'vitest';
import { resolveWorldCreation, type WorldProposal, type WorldCreationVote } from './byzantineWorldConsensus';

const cfg = { totalAgents: 4, byzantineFaults: 1 };

describe('resolveWorldCreation', () => {
  it('accepts when quorum approves the same proposal', () => {
    const proposals: WorldProposal[] = [
      { id: 'p1', proposerId: 'a1', contentHash: 'h1' },
      { id: 'p2', proposerId: 'a2', contentHash: 'h2' },
    ];
    const votes: WorldCreationVote[] = [
      { proposalId: 'p1', voterId: 'v1', approve: true },
      { proposalId: 'p1', voterId: 'v2', approve: true },
      { proposalId: 'p1', voterId: 'v3', approve: true },
    ];
    const r = resolveWorldCreation(proposals, votes, cfg);
    expect(r.status).toBe('accepted');
    if (r.status === 'accepted') {
      expect(r.winningProposal.id).toBe('p1');
      expect(r.approvingVoters.sort()).toEqual(['v1', 'v2', 'v3']);
      expect(r.quorumSize).toBe(3);
    }
  });

  it('rejects ensemble too small for f', () => {
    const r = resolveWorldCreation(
      [{ id: 'p1', proposerId: 'a', contentHash: 'h' }],
      [],
      { totalAgents: 3, byzantineFaults: 1 }
    );
    expect(r.status).toBe('rejected');
  });

  it('is pending when best count is below quorum', () => {
    const proposals: WorldProposal[] = [{ id: 'p1', proposerId: 'a1', contentHash: 'h1' }];
    const votes: WorldCreationVote[] = [
      { proposalId: 'p1', voterId: 'v1', approve: true },
      { proposalId: 'p1', voterId: 'v2', approve: true },
    ];
    const r = resolveWorldCreation(proposals, votes, cfg);
    expect(r.status).toBe('pending');
  });

  it('uses last vote per voter (equivocation)', () => {
    const proposals: WorldProposal[] = [
      { id: 'p1', proposerId: 'a1', contentHash: 'h1' },
      { id: 'p2', proposerId: 'a2', contentHash: 'h2' },
    ];
    const votes: WorldCreationVote[] = [
      { proposalId: 'p1', voterId: 'v1', approve: true },
      { proposalId: 'p2', voterId: 'v1', approve: true },
      { proposalId: 'p2', voterId: 'v2', approve: true },
      { proposalId: 'p2', voterId: 'v3', approve: true },
    ];
    const r = resolveWorldCreation(proposals, votes, cfg);
    expect(r.status).toBe('accepted');
    if (r.status === 'accepted') {
      expect(r.winningProposal.id).toBe('p2');
    }
  });

  it('breaks ties by lexicographically smaller proposal id', () => {
    const proposals: WorldProposal[] = [
      { id: 'm2', proposerId: 'a', contentHash: 'b' },
      { id: 'm1', proposerId: 'a', contentHash: 'a' },
    ];
    const votes: WorldCreationVote[] = [
      { proposalId: 'm1', voterId: 'v1', approve: true },
      { proposalId: 'm1', voterId: 'v2', approve: true },
      { proposalId: 'm1', voterId: 'v3', approve: true },
      { proposalId: 'm2', voterId: 'v4', approve: true },
      { proposalId: 'm2', voterId: 'v5', approve: true },
      { proposalId: 'm2', voterId: 'v6', approve: true },
    ];
    const r = resolveWorldCreation(proposals, votes, cfg);
    expect(r.status).toBe('accepted');
    if (r.status === 'accepted') {
      expect(r.winningProposal.id).toBe('m1');
    }
  });
});
