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
}

export interface FoundationDAOState {
  treasuryBalanceX402: number;
  activeProposals: Proposal[];
  membersCount: number;
}

const defaultConfig: FoundationDAOConfig = {
  governanceToken: 'HOLO_GOV',
  quorumPercent: 33,
  executionDelayHours: 48,
  multisigOwnersCount: 9
};

export function createFoundationDAOHandler(): TraitHandler<FoundationDAOConfig> {
  return {
    name: 'foundation_dao',
    defaultConfig,
    onAttach(n: HSPlusNode, c: FoundationDAOConfig, ctx: TraitContext) {
      n.__daoState = { treasuryBalanceX402: 5000000, activeProposals: [], membersCount: 150 };
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
         const proposal: Proposal = {
           id: `prop_${Date.now()}`, title: e.payload?.title as string || 'General Update',
           votesFor: 0, votesAgainst: 0, status: 'active'
         };
         s.activeProposals.push(proposal);
         ctx.emit?.('dao:proposal_created', { proposal });
      } else if (e.type === 'dao:vote') {
         const pid = e.payload?.proposalId as string;
         const prop = s.activeProposals.find(p => p.id === pid);
         if (prop && prop.status === 'active') {
           const w = e.payload?.weight;
           if (typeof w === 'number') {
             if (e.payload?.support) prop.votesFor += w;
             else prop.votesAgainst += w;
           }
           
           // Check quorum completion mocked
           if ((prop.votesFor + prop.votesAgainst) > (s.membersCount * (c.quorumPercent / 100))) {
              prop.status = prop.votesFor > prop.votesAgainst ? 'passed' : 'rejected';
              ctx.emit?.('dao:proposal_concluded', { id: prop.id, status: prop.status });
              
              if (prop.status === 'passed') {
                setTimeout(() => { prop.status = 'executed'; ctx.emit?.('dao:executed', { id: prop.id }); }, c.executionDelayHours * 3600);
              }
           }
         }
      }
    }
  };
}
