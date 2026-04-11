/** @quality_gate Trait — Inspection checkpoint. @trait quality_gate */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface InspectionCriteria { id: string; name: string; type: 'visual' | 'dimensional' | 'functional' | 'electrical'; tolerance: number; unit: string; }
export interface QualityGateConfig { criteria: InspectionCriteria[]; passThreshold: number; autoReject: boolean; stationId: string; }
export interface QualityGateState { inspected: number; passed: number; failed: number; passRate: number; }

const defaultConfig: QualityGateConfig = { criteria: [], passThreshold: 95, autoReject: true, stationId: '' };

export function createQualityGateHandler(): TraitHandler<QualityGateConfig> {
  return { name: 'quality_gate', defaultConfig,
    onAttach(n: HSPlusNode, _c: QualityGateConfig, ctx: TraitContext) { n.__qcState = { inspected: 0, passed: 0, failed: 0, passRate: 100 }; ctx.emit?.('qc:ready'); },
    onDetach(n: HSPlusNode, _c: QualityGateConfig, ctx: TraitContext) { delete n.__qcState; ctx.emit?.('qc:removed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: QualityGateConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__qcState as QualityGateState | undefined; if (!s) return;
      if (e.type === 'qc:inspect') {
        s.inspected++;
        const pass = (e.payload?.pass as boolean) ?? true;
        if (pass) s.passed++; else s.failed++;
        s.passRate = s.inspected > 0 ? (s.passed / s.inspected) * 100 : 100;
        ctx.emit?.('qc:inspected', { pass, passRate: s.passRate });
        if (s.passRate < c.passThreshold) ctx.emit?.('qc:threshold_breach', { passRate: s.passRate, threshold: c.passThreshold });
      }
    },
  };
}
