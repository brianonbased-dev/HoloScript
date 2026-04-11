/** @pcb_layout Trait — PCB design and layout. @trait pcb_layout */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type PCBLayer = 'top_copper' | 'bottom_copper' | 'inner1' | 'inner2' | 'top_silk' | 'bottom_silk' | 'solder_mask' | 'paste';
export interface Pad { id: string; x: number; y: number; diameter: number; drill?: number; shape: 'round' | 'square' | 'oblong'; net: string; }
export interface Trace { id: string; net: string; widthMm: number; layer: PCBLayer; points: Array<{ x: number; y: number }>; }
export interface PCBLayoutConfig { widthMm: number; heightMm: number; layers: number; pads: Pad[]; traces: Trace[]; copperWeightOz: number; minTraceWidthMm: number; minClearanceMm: number; }

const defaultConfig: PCBLayoutConfig = { widthMm: 100, heightMm: 100, layers: 2, pads: [], traces: [], copperWeightOz: 1, minTraceWidthMm: 0.15, minClearanceMm: 0.15 };

export function createPCBLayoutHandler(): TraitHandler<PCBLayoutConfig> {
  return { name: 'pcb_layout', defaultConfig,
    onAttach(n: HSPlusNode, c: PCBLayoutConfig, ctx: TraitContext) { n.__pcbState = { drcErrors: 0, netCount: new Set([...c.pads.map(p => p.net), ...c.traces.map(t => t.net)]).size, isValid: true }; ctx.emit?.('pcb:loaded', { pads: c.pads.length, traces: c.traces.length }); },
    onDetach(n: HSPlusNode, _c: PCBLayoutConfig, ctx: TraitContext) { delete n.__pcbState; ctx.emit?.('pcb:unloaded'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: PCBLayoutConfig, ctx: TraitContext, e: TraitEvent) {
      if (e.type === 'pcb:run_drc') {
        const errors: string[] = [];
        for (const t of c.traces) { if (t.widthMm < c.minTraceWidthMm) errors.push(`Trace ${t.id}: width ${t.widthMm}mm < min ${c.minTraceWidthMm}mm`); }
        const s = n.__pcbState as Record<string, unknown>;
        if (s) { s.drcErrors = errors.length; s.isValid = errors.length === 0; }
        ctx.emit?.('pcb:drc_result', { errors: errors.length, pass: errors.length === 0, details: errors.slice(0, 10) });
      }
    },
  };
}
