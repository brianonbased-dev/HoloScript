/** @defect_tracking Trait — Defect logging and classification. @trait defect_tracking */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type DefectSeverity = 'critical' | 'major' | 'minor' | 'cosmetic';
export interface Defect { id: string; severity: DefectSeverity; description: string; stationId: string; timestamp: number; resolved: boolean; }
export interface DefectTrackingConfig { categories: string[]; autoEscalateCritical: boolean; maxOpenDefects: number; }

const defaultConfig: DefectTrackingConfig = { categories: ['dimensional', 'surface', 'functional', 'material'], autoEscalateCritical: true, maxOpenDefects: 50 };

export function createDefectTrackingHandler(): TraitHandler<DefectTrackingConfig> {
  return { name: 'defect_tracking', defaultConfig,
    onAttach(n: HSPlusNode, _c: DefectTrackingConfig, ctx: TraitContext) { n.__defectState = { defects: [], openCount: 0 }; ctx.emit?.('defect:tracker_ready'); },
    onDetach(n: HSPlusNode, _c: DefectTrackingConfig, ctx: TraitContext) { delete n.__defectState; ctx.emit?.('defect:tracker_removed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: DefectTrackingConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__defectState as { defects: Defect[]; openCount: number } | undefined; if (!s) return;
      if (e.type === 'defect:log') {
        const defect: Defect = { id: `DEF-${s.defects.length + 1}`, severity: (e.payload?.severity as DefectSeverity) || 'minor', description: (e.payload?.description as string) || '', stationId: (e.payload?.stationId as string) || '', timestamp: Date.now(), resolved: false };
        s.defects.push(defect); s.openCount++;
        ctx.emit?.('defect:logged', { id: defect.id, severity: defect.severity });
        if (defect.severity === 'critical' && c.autoEscalateCritical) ctx.emit?.('defect:escalated', { id: defect.id });
      }
      if (e.type === 'defect:resolve') { const d = s.defects.find(d => d.id === e.payload?.id); if (d && !d.resolved) { d.resolved = true; s.openCount--; ctx.emit?.('defect:resolved', { id: d.id }); } }
    },
  };
}
