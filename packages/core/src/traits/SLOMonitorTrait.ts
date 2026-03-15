/**
 * SLOMonitorTrait — v5.1
 *
 * Service Level Objective error budget tracking.
 *
 * Events:
 *  slo:define         { sloId, target, window_ms }
 *  slo:record_good    { sloId }
 *  slo:record_bad     { sloId }
 *  slo:status         { sloId, target, actual, budgetRemaining, inBudget }
 *  slo:budget_alert   { sloId, actual, target }
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

export interface SLOMonitorConfig {
  alert_on_budget_breach: boolean;
}

interface SLOEntry {
  sloId: string;
  target: number;      // e.g. 0.999
  windowMs: number;
  good: number;
  total: number;
  startedAt: number;
}

export const sloMonitorHandler: TraitHandler<SLOMonitorConfig> = {
  name: 'slo_monitor',
  defaultConfig: { alert_on_budget_breach: true },

  onAttach(node: any): void {
    node.__sloState = { slos: new Map<string, SLOEntry>() };
  },
  onDetach(node: any): void { delete node.__sloState; },
  onUpdate(): void {},

  onEvent(node: any, config: SLOMonitorConfig, context: any, event: any): void {
    const state = node.__sloState as { slos: Map<string, SLOEntry> } | undefined;
    if (!state) return;
    const eventType = typeof event === 'string' ? event : event.type;

    switch (eventType) {
      case 'slo:define': {
        const sloId = event.sloId as string;
        if (!sloId) break;
        state.slos.set(sloId, {
          sloId,
          target: (event.target as number) ?? 0.999,
          windowMs: (event.window_ms as number) ?? 86400000,
          good: 0,
          total: 0,
          startedAt: Date.now(),
        });
        break;
      }
      case 'slo:record_good': {
        const slo = state.slos.get(event.sloId as string);
        if (slo) { slo.good++; slo.total++; }
        break;
      }
      case 'slo:record_bad': {
        const slo = state.slos.get(event.sloId as string);
        if (slo) {
          slo.total++;
          if (config.alert_on_budget_breach) {
            const actual = slo.total > 0 ? slo.good / slo.total : 1;
            if (actual < slo.target) {
              context.emit?.('slo:budget_alert', { sloId: slo.sloId, actual, target: slo.target });
            }
          }
        }
        break;
      }
      case 'slo:get_status': {
        const slo = state.slos.get(event.sloId as string);
        if (slo) {
          const actual = slo.total > 0 ? slo.good / slo.total : 1;
          const budget = slo.target > 0 ? (actual - slo.target) / (1 - slo.target) : 1;
          context.emit?.('slo:status', {
            sloId: slo.sloId,
            target: slo.target,
            actual,
            budgetRemaining: Math.max(0, budget),
            inBudget: actual >= slo.target,
            good: slo.good,
            total: slo.total,
          });
        }
        break;
      }
    }
  },
};

export default sloMonitorHandler;
