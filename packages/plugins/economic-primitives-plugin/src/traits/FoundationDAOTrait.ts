/** @foundation_dao Trait — Non-profit multi-disciplinary token governance. @trait foundation_dao */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface FoundationDAOConfig {
  governanceToken: string;
  quorumPercent: number;
  executionDelayHours: number;
  multisigOwnersCount: number;
}

export interface Proposal {
  id: string;
  title: string;
  votesFor: number;
  votesAgainst: number;
  status: 'active' | 'passed' | 'rejected' | 'executed';
  zoneId?: string;
  requestedAmountX402?: number;
  createdAtMs: number;
  executableAtMs?: number;
  voterWeights: Record<string, { support: boolean; weight: number }>;
}

export interface FundingAllocation {
  proposalId: string;
  zoneId: string;
  amountX402: number;
  allocatedAtMs: number;
}

export interface FoundationDAOState {
  treasuryBalanceX402: number;
  activeProposals: Proposal[];
  membersCount: number;
  allocations: FundingAllocation[];
}

const defaultConfig: FoundationDAOConfig = {
  governanceToken: 'HOLO_GOV',
  quorumPercent: 33,
  executionDelayHours: 48,
  multisigOwnersCount: 9
};

export function createFoundationDAOHandler(): TraitHandler<FoundationDAOConfig> {
  const applyVote = (proposal: Proposal, voterId: string, support: boolean, weight: number) => {
    const safeWeight = Number.isFinite(weight) && weight > 0 ? weight : 1;
    const previous = proposal.voterWeights[voterId];
    if (previous) {
      if (previous.support) proposal.votesFor -= previous.weight;
      else proposal.votesAgainst -= previous.weight;
    }

    proposal.voterWeights[voterId] = { support, weight: safeWeight };
    if (support) proposal.votesFor += safeWeight;
    else proposal.votesAgainst += safeWeight;
  };

  const maybeConcludeProposal = (
    proposal: Proposal,
    config: FoundationDAOConfig,
    state: FoundationDAOState,
    ctx: TraitContext,
    nowMs: number
  ) => {
    const totalVotes = proposal.votesFor + proposal.votesAgainst;
    const quorumThreshold = state.membersCount * (config.quorumPercent / 100);
    if (totalVotes <= quorumThreshold || proposal.status !== 'active') return;

    proposal.status = proposal.votesFor > proposal.votesAgainst ? 'passed' : 'rejected';
    ctx.emit?.('dao:proposal_concluded', {
      id: proposal.id,
      status: proposal.status,
      votesFor: proposal.votesFor,
      votesAgainst: proposal.votesAgainst,
    });

    if (proposal.status === 'passed') {
      const delayMs = Math.max(0, config.executionDelayHours) * 3600 * 1000;
      proposal.executableAtMs = nowMs + delayMs;
      ctx.emit?.('dao:execution_scheduled', {
        id: proposal.id,
        executableAtMs: proposal.executableAtMs,
      });
    }
  };

  const executeProposal = (
    proposal: Proposal,
    state: FoundationDAOState,
    ctx: TraitContext,
    nowMs: number
  ) => {
    if (proposal.status !== 'passed') return;
    if (proposal.executableAtMs && nowMs < proposal.executableAtMs) return;

    if (typeof proposal.requestedAmountX402 === 'number' && proposal.requestedAmountX402 > 0) {
      const zoneId = proposal.zoneId || 'unscoped_zone';
      if (state.treasuryBalanceX402 < proposal.requestedAmountX402) {
        ctx.emit?.('dao:funding_failed', {
          proposalId: proposal.id,
          zoneId,
          requestedAmountX402: proposal.requestedAmountX402,
          treasuryBalanceX402: state.treasuryBalanceX402,
        });
        return;
      }

      state.treasuryBalanceX402 -= proposal.requestedAmountX402;
      state.allocations.push({
        proposalId: proposal.id,
        zoneId,
        amountX402: proposal.requestedAmountX402,
        allocatedAtMs: nowMs,
      });

      ctx.emit?.('dao:funding_allocated', {
        proposalId: proposal.id,
        zoneId,
        amountX402: proposal.requestedAmountX402,
        treasuryBalanceX402: state.treasuryBalanceX402,
      });
    }

    proposal.status = 'executed';
    ctx.emit?.('dao:executed', { id: proposal.id });
  };

  return {
    name: 'foundation_dao',
    defaultConfig,
    onAttach(n: HSPlusNode, c: FoundationDAOConfig, ctx: TraitContext) {
      n.__daoState = {
        treasuryBalanceX402: 5000000,
        activeProposals: [],
        membersCount: 150,
        allocations: [],
      };
      ctx.emit?.('dao:initialized');
    },
    onDetach(n: HSPlusNode, _c: FoundationDAOConfig, _ctx: TraitContext) {
      delete n.__daoState;
    },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: FoundationDAOConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__daoState as FoundationDAOState;
      if (!s) return;
      if (e.type === 'dao:propose') {
         const nowMs = Date.now();
         const proposal: Proposal = {
           id: `prop_${nowMs}`,
           title: (e.payload?.title as string) || 'General Update',
           votesFor: 0,
           votesAgainst: 0,
           status: 'active',
           zoneId: typeof e.payload?.zoneId === 'string' ? (e.payload.zoneId as string) : undefined,
           requestedAmountX402:
             typeof e.payload?.requestedAmountX402 === 'number'
               ? (e.payload.requestedAmountX402 as number)
               : undefined,
           createdAtMs: nowMs,
           voterWeights: {},
         };
         s.activeProposals.push(proposal);
         ctx.emit?.('dao:proposal_created', { proposal });
      } else if (e.type === 'dao:vote') {
         const pid = e.payload?.proposalId as string;
         const prop = s.activeProposals.find(p => p.id === pid);
         if (prop && prop.status === 'active') {
           const voterId = typeof e.payload?.voterId === 'string' ? (e.payload.voterId as string) : 'anonymous_voter';
           const support = Boolean(e.payload?.support);
           const weight = typeof e.payload?.weight === 'number' ? (e.payload.weight as number) : 1;
           applyVote(prop, voterId, support, weight);
           maybeConcludeProposal(prop, c, s, ctx, Date.now());
           executeProposal(prop, s, ctx, Date.now());
         }
      } else if (e.type === 'dao:autonomous_vote') {
         const pid = e.payload?.proposalId as string;
         const prop = s.activeProposals.find(p => p.id === pid);
         if (!prop || prop.status !== 'active') return;

         const agents = Array.isArray(e.payload?.agents)
           ? (e.payload?.agents as Array<Record<string, unknown>>)
           : [];

         for (const agent of agents) {
           const voterId = typeof agent.agentId === 'string' ? (agent.agentId as string) : 'agent';
           const support =
             typeof agent.support === 'boolean'
               ? (agent.support as boolean)
               : prop.requestedAmountX402
                 ? prop.requestedAmountX402 <= s.treasuryBalanceX402
                 : true;
           const weight = typeof agent.weight === 'number' ? (agent.weight as number) : 1;
           applyVote(prop, voterId, support, weight);
         }

         maybeConcludeProposal(prop, c, s, ctx, Date.now());
        executeProposal(prop, s, ctx, Date.now());
      } else if (e.type === 'dao:execute') {
         const nowMs =
           typeof e.payload?.nowMs === 'number' ? (e.payload.nowMs as number) : Date.now();

         if (typeof e.payload?.proposalId === 'string') {
           const prop = s.activeProposals.find(p => p.id === e.payload!.proposalId);
           if (prop) executeProposal(prop, s, ctx, nowMs);
         } else {
           s.activeProposals.forEach((p) => executeProposal(p, s, ctx, nowMs));
         }
      }
    }
  };
}
