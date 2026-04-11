/** @case_management Trait — Legal case tracking. @trait case_management */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type CaseStatus = 'intake' | 'discovery' | 'pleading' | 'trial' | 'appeal' | 'settled' | 'closed';
export interface CaseManagementConfig { caseNumber: string; title: string; clientId: string; opposingParty: string; caseType: string; filingDate: string; courtJurisdiction: string; }
export interface CaseManagementState { status: CaseStatus; documents: number; deadlines: number; billableHours: number; }

const defaultConfig: CaseManagementConfig = { caseNumber: '', title: '', clientId: '', opposingParty: '', caseType: '', filingDate: '', courtJurisdiction: '' };

export function createCaseManagementHandler(): TraitHandler<CaseManagementConfig> {
  return { name: 'case_management', defaultConfig,
    onAttach(n: HSPlusNode, _c: CaseManagementConfig, ctx: TraitContext) { n.__caseState = { status: 'intake' as CaseStatus, documents: 0, deadlines: 0, billableHours: 0 }; ctx.emit?.('case:opened'); },
    onDetach(n: HSPlusNode, _c: CaseManagementConfig, ctx: TraitContext) { delete n.__caseState; ctx.emit?.('case:archived'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, _c: CaseManagementConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__caseState as CaseManagementState | undefined; if (!s) return;
      if (e.type === 'case:advance_status') { const flow: CaseStatus[] = ['intake','discovery','pleading','trial','appeal','settled','closed']; const i = flow.indexOf(s.status); if (i < flow.length - 1) { s.status = flow[i+1]; ctx.emit?.('case:status_changed', { status: s.status }); } }
      if (e.type === 'case:log_hours') { s.billableHours += (e.payload?.hours as number) ?? 0; ctx.emit?.('case:hours_logged', { total: s.billableHours }); }
      if (e.type === 'case:add_document') { s.documents++; ctx.emit?.('case:document_added', { count: s.documents }); }
    },
  };
}
