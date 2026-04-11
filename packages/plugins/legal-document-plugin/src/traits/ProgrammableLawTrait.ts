/** @programmable_law Trait — Ethics and legal constraints enforced at the semantic layer. @trait programmable_law */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface ProgrammableLawConfig {
  jurisdiction: string;
  enforceContractLaw: boolean;
  strictLiability: boolean;
  maxLiabilityCapX402: number;
}

export interface ProgrammableLawState {
  complianceStatus: 'compliant' | 'warning' | 'breach';
  activeContracts: string[];
  incurredLiabilityX402: number;
  breachLog: string[];
}

const defaultConfig: ProgrammableLawConfig = {
  jurisdiction: 'GlobalSovereignMesh',
  enforceContractLaw: true,
  strictLiability: true,
  maxLiabilityCapX402: 1000000
};

export function createProgrammableLawHandler(): TraitHandler<ProgrammableLawConfig> {
  return {
    name: 'programmable_law',
    defaultConfig,
    onAttach(n: HSPlusNode, c: ProgrammableLawConfig, ctx: TraitContext) {
      n.__lawState = {
        complianceStatus: 'compliant',
        activeContracts: [],
        incurredLiabilityX402: 0,
        breachLog: []
      };
      ctx.emit?.('programmable_law:bound', { jurisdiction: c.jurisdiction });
    },
    onDetach(n: HSPlusNode, _c: ProgrammableLawConfig, ctx: TraitContext) {
      delete n.__lawState;
      ctx.emit?.('programmable_law:unbound');
    },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: ProgrammableLawConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__lawState as ProgrammableLawState | undefined;
      if (!s) return;
      
      if (e.type === 'programmable_law:evaluate_action') {
        const actionCode = e.payload?.actionCode as string;
        
        // Semantic checking bounds
        if (actionCode === 'UNAUTHORIZED_DATA_ACCESS' || actionCode === 'VIOLENCE') {
           s.complianceStatus = 'breach';
           s.breachLog.push(`Breach detected: ${actionCode} under ${c.jurisdiction}`);
           s.incurredLiabilityX402 += 50000;
           ctx.emit?.('programmable_law:breach', { liability: s.incurredLiabilityX402 });
        } else {
           ctx.emit?.('programmable_law:cleared');
        }
      }
    },
  };
}
