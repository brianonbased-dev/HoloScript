/** @wisdom Trait — Compile-time wisdom annotation that generates compiler warnings and suggestions.
 *
 * ```hsplus
 * @wisdom { id: "W.035" message: "Radix sort outperforms bitonic for N > 64K" severity: "info" autoFix: true }
 * ```
 * @trait wisdom
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type WisdomSeverity = 'info' | 'warning' | 'error' | 'suggestion';
export type WisdomDomain = 'performance' | 'security' | 'correctness' | 'style' | 'compatibility' | 'architecture';

export interface WisdomConfig {
  id: string;
  message: string;
  severity: WisdomSeverity;
  domain: WisdomDomain;
  autoFix: boolean;
  fixDescription?: string;
  fixTransform?: string;
  appliesTo: string[];
  references: string[];
  confidence: number;
}

export interface WisdomState {
  triggered: boolean;
  triggeredAt: number | null;
  fixApplied: boolean;
  suppressedByUser: boolean;
}

const defaultConfig: WisdomConfig = { id: '', message: '', severity: 'info', domain: 'correctness', autoFix: false, appliesTo: [], references: [], confidence: 0.9 };

export function createWisdomHandler(): TraitHandler<WisdomConfig> {
  return { name: 'wisdom', defaultConfig,
    onAttach(n: HSPlusNode, c: WisdomConfig, ctx: TraitContext) {
      n.__wisdomState = { triggered: false, triggeredAt: null, fixApplied: false, suppressedByUser: false };
      ctx.emit?.('wisdom:registered', { id: c.id, severity: c.severity, domain: c.domain });
    },
    onDetach(n: HSPlusNode, _c: WisdomConfig, ctx: TraitContext) { delete n.__wisdomState; ctx.emit?.('wisdom:unregistered'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: WisdomConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__wisdomState as WisdomState | undefined; if (!s) return;
      if (e.type === 'wisdom:check') {
        const context = e.payload?.context as string ?? '';
        const matches = c.appliesTo.length === 0 || c.appliesTo.some(pattern => context.includes(pattern));
        if (matches && !s.suppressedByUser) {
          s.triggered = true; s.triggeredAt = Date.now();
          ctx.emit?.('wisdom:triggered', { id: c.id, severity: c.severity, message: c.message, autoFix: c.autoFix, fixDescription: c.fixDescription });
        }
      }
      if (e.type === 'wisdom:apply_fix' && c.autoFix && s.triggered) {
        s.fixApplied = true;
        ctx.emit?.('wisdom:fix_applied', { id: c.id, transform: c.fixTransform });
      }
      if (e.type === 'wisdom:suppress') { s.suppressedByUser = true; ctx.emit?.('wisdom:suppressed', { id: c.id }); }
    },
  };
}
