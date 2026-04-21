/** @voting_record Trait — Public voting record and election results display. @trait voting_record */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type VoteType = 'council_vote' | 'ballot_measure' | 'election' | 'referendum' | 'committee_vote';
export type VoteOutcome = 'passed' | 'failed' | 'tabled' | 'withdrawn' | 'tied' | 'pending';

export interface VoteCast {
  memberId: string;
  memberName: string;
  vote: 'aye' | 'nay' | 'abstain' | 'absent';
  timestamp?: string;
}

export interface VotingRecordConfig {
  voteId: string;
  voteType: VoteType;
  title: string;
  description: string;
  motionText: string;
  scheduledAt: string; // ISO datetime
  requiredMajority: 'simple' | 'supermajority' | 'unanimous'; // simple=50%+1, supermajority=2/3, unanimous=100%
  eligibleVoters: string[]; // member IDs
  showLiveResults: boolean;
  showMemberVotes: boolean; // public record
}

export interface VotingRecordState {
  outcome: VoteOutcome;
  votes: VoteCast[];
  ayeCount: number;
  nayCount: number;
  abstainCount: number;
  absentCount: number;
  totalEligible: number;
  participationRate: number; // 0-1
  quorumMet: boolean;
  isOpen: boolean;
  closedAt?: string;
}

const MAJORITY_THRESHOLDS = { simple: 0.5, supermajority: 2 / 3, unanimous: 1 } as const;

function computeOutcome(state: VotingRecordState, config: VotingRecordConfig): VoteOutcome {
  if (state.isOpen) return 'pending';
  const total = state.ayeCount + state.nayCount + state.abstainCount;
  if (total === 0) return 'pending';
  const threshold = MAJORITY_THRESHOLDS[config.requiredMajority];
  const ayeRatio = state.ayeCount / total;
  if (state.ayeCount === state.nayCount) return 'tied';
  return ayeRatio > threshold ? 'passed' : 'failed';
}

const defaultConfig: VotingRecordConfig = {
  voteId: '',
  voteType: 'council_vote',
  title: '',
  description: '',
  motionText: '',
  scheduledAt: new Date().toISOString(),
  requiredMajority: 'simple',
  eligibleVoters: [],
  showLiveResults: true,
  showMemberVotes: true,
};

export function createVotingRecordHandler(): TraitHandler<VotingRecordConfig> {
  return {
    name: 'voting_record',
    defaultConfig,
    onAttach(node: HSPlusNode, config: VotingRecordConfig, ctx: TraitContext) {
      node.__votingState = {
        outcome: 'pending' as VoteOutcome,
        votes: [],
        ayeCount: 0, nayCount: 0, abstainCount: 0,
        absentCount: config.eligibleVoters.length,
        totalEligible: config.eligibleVoters.length,
        participationRate: 0,
        quorumMet: false,
        isOpen: false,
      } satisfies VotingRecordState;
      ctx.emit?.('vote:created', { voteId: config.voteId, type: config.voteType });
    },
    onDetach(node: HSPlusNode, _config: VotingRecordConfig, ctx: TraitContext) {
      delete node.__votingState;
      ctx.emit?.('vote:removed');
    },
    onUpdate() {},
    onEvent(node: HSPlusNode, config: VotingRecordConfig, ctx: TraitContext, event: TraitEvent) {
      const s = node.__votingState as VotingRecordState | undefined;
      if (!s) return;
      switch (event.type) {
        case 'vote:open':
          s.isOpen = true;
          ctx.emit?.('vote:opened', { voteId: config.voteId, eligible: s.totalEligible });
          break;
        case 'vote:cast': {
          if (!s.isOpen) return;
          const cast = event.payload as unknown as VoteCast;
          if (!cast?.memberId || !cast?.vote) return;
          // Replace if already voted
          const existing = s.votes.findIndex(v => v.memberId === cast.memberId);
          if (existing >= 0) s.votes.splice(existing, 1);
          s.votes.push({ ...cast, timestamp: new Date().toISOString() });
          // Recount
          s.ayeCount = s.votes.filter(v => v.vote === 'aye').length;
          s.nayCount = s.votes.filter(v => v.vote === 'nay').length;
          s.abstainCount = s.votes.filter(v => v.vote === 'abstain').length;
          s.absentCount = s.totalEligible - s.votes.length;
          s.participationRate = s.votes.length / (s.totalEligible || 1);
          s.quorumMet = s.participationRate > 0.5;
          ctx.emit?.('vote:cast', { voteId: config.voteId, memberId: cast.memberId, vote: cast.vote, ayeCount: s.ayeCount, nayCount: s.nayCount });
          break;
        }
        case 'vote:close':
          s.isOpen = false;
          s.closedAt = new Date().toISOString();
          s.outcome = computeOutcome(s, config);
          ctx.emit?.('vote:closed', { voteId: config.voteId, outcome: s.outcome, ayeCount: s.ayeCount, nayCount: s.nayCount });
          break;
        case 'vote:table':
          s.isOpen = false;
          s.outcome = 'tabled';
          ctx.emit?.('vote:tabled', { voteId: config.voteId });
          break;
      }
    },
  };
}
