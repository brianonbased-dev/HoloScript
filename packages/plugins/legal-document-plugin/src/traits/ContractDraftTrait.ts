/** @contract_draft Trait — Contract authoring and clause management. @trait contract_draft */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type ContractType = 'nda' | 'employment' | 'service' | 'license' | 'lease' | 'partnership' | 'sale';
export interface Clause { id: string; title: string; body: string; required: boolean; negotiable: boolean; }
export interface ContractDraftConfig { contractType: ContractType; title: string; parties: string[]; clauses: Clause[]; effectiveDate: string; expirationDate?: string; governingLaw: string; }
export interface ContractDraftState { status: 'draft' | 'review' | 'negotiation' | 'final' | 'executed'; version: number; lastModified: number; }

const defaultConfig: ContractDraftConfig = { contractType: 'service', title: '', parties: [], clauses: [], effectiveDate: '', governingLaw: '' };

export function createContractDraftHandler(): TraitHandler<ContractDraftConfig> {
  return { name: 'contract_draft', defaultConfig,
    onAttach(n: HSPlusNode, c: ContractDraftConfig, ctx: TraitContext) { n.__contractState = { status: 'draft', version: 1, lastModified: Date.now() }; ctx.emit?.('contract:created', { type: c.contractType, parties: c.parties.length }); },
    onDetach(n: HSPlusNode, _c: ContractDraftConfig, ctx: TraitContext) { delete n.__contractState; ctx.emit?.('contract:discarded'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, _c: ContractDraftConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__contractState as ContractDraftState | undefined; if (!s) return;
      if (e.type === 'contract:advance') { const flow: ContractDraftState['status'][] = ['draft','review','negotiation','final','executed']; const i = flow.indexOf(s.status); if (i < flow.length - 1) { s.status = flow[i+1]; s.version++; s.lastModified = Date.now(); ctx.emit?.('contract:status_changed', { status: s.status, version: s.version }); } }
      if (e.type === 'contract:redline') { s.version++; s.lastModified = Date.now(); ctx.emit?.('contract:redlined', { version: s.version }); }
    },
  };
}
