import { EventEmitter } from 'events';
import {
  HSPlusNode,
  TraitHandler,
  TraitContext,
  TraitEvent,
} from '../TraitTypes';

export interface DAOProposal {
  id: string;
  description: string;
  status: 'active' | 'passed' | 'rejected' | 'executed';
  createdAt: number;
  votesFor: number;
  votesAgainst: number;
  quorum: number;
  deadline: number;
  actions: Array<{ type: string; payload: any }>;
}

export interface FoundationDAOConfig {
  quorumThreshold: number;
  votingPeriod: number; // in seconds
  tokenAddress?: string; // For token-weighted voting
  liquidDemocracy: boolean;
}

/**
 * FoundationDAOTrait
 * Core governance logic for sovereign entities and worlds.
 */
export class FoundationDAOTrait extends EventEmitter {
  private proposals: Map<string, DAOProposal> = new Map();
  private config: FoundationDAOConfig;
  private treasuryBalance: number = 0;

  constructor(config: FoundationDAOConfig) {
    super();
    this.config = {
      quorumThreshold: 0.1, // 10%
      votingPeriod: 3 * 24 * 60 * 60, // 3 days
      liquidDemocracy: false,
      ...config,
    };
  }

  createProposal(description: string, actions: Array<{ type: string; payload: any }>): string {
    const id = `prop_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const proposal: DAOProposal = {
      id,
      description,
      status: 'active',
      createdAt: Date.now(),
      votesFor: 0,
      votesAgainst: 0,
      quorum: 100, // placeholder: should be calculated based on supply
      deadline: Date.now() + this.config.votingPeriod * 1000,
      actions,
    };
    this.proposals.set(id, proposal);
    this.emit('proposal_created', proposal);
    return id;
  }

  vote(proposalId: string, support: boolean, weight: number = 1): void {
    const proposal = this.proposals.get(proposalId);
    if (!proposal || proposal.status !== 'active') return;

    if (Date.now() > proposal.deadline) {
      this.finalizeProposal(proposalId);
      return;
    }

    if (support) {
      proposal.votesFor += weight;
    } else {
      proposal.votesAgainst += weight;
    }

    this.emit('voted', { proposalId, support, weight });
  }

  finalizeProposal(proposalId: string): void {
    const proposal = this.proposals.get(proposalId);
    if (!proposal || proposal.status !== 'active') return;

    const totalVotes = proposal.votesFor + proposal.votesAgainst;
    if (totalVotes >= proposal.quorum && proposal.votesFor > proposal.votesAgainst) {
      proposal.status = 'passed';
      this.emit('proposal_passed', proposal);
    } else {
      proposal.status = 'rejected';
      this.emit('proposal_rejected', proposal);
    }
  }

  executeProposal(proposalId: string): void {
    const proposal = this.proposals.get(proposalId);
    if (!proposal || proposal.status !== 'passed') return;

    proposal.status = 'executed';
    this.emit('proposal_executed', proposal);

    // In a real implementation, this would trigger the actual actions in the engine
    for (const action of proposal.actions) {
      this.emit('action_triggered', action);
    }
  }

  getTreasuryBalance(): number {
    return this.treasuryBalance;
  }

  deposit(amount: number): void {
    this.treasuryBalance += amount;
    this.emit('treasury_deposit', { amount, newBalance: this.treasuryBalance });
  }

  getProposals(): DAOProposal[] {
    return Array.from(this.proposals.values());
  }

  getConfig(): FoundationDAOConfig {
    return { ...this.config };
  }
}

export const foundationDAOHandler: TraitHandler = {
  name: 'foundation_dao',
  onAttach(node: HSPlusNode, config: any, _ctx: TraitContext): void {
    const instance = new FoundationDAOTrait(config);
    (node as any).__foundation_dao_instance = instance;
  },
  onDetach(node: HSPlusNode): void {
    delete (node as any).__foundation_dao_instance;
  },
  onEvent(node: HSPlusNode, _config: any, _ctx: TraitContext, event: TraitEvent): void {
    const instance = (node as any).__foundation_dao_instance as FoundationDAOTrait;
    if (!instance) return;

    if (event.type === 'dao:propose' && event.payload) {
      instance.createProposal(event.payload.description, event.payload.actions);
    } else if (event.type === 'dao:vote' && event.payload) {
      instance.vote(event.payload.proposalId, event.payload.support, event.payload.weight);
    }
  }
};
