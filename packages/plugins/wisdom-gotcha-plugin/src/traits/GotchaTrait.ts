/** @gotcha Trait — Known pitfall that triggers compile-time errors or runtime guards.
 *
 * ```hsplus
 * @gotcha { id: "G.004.05" trap: "dist/index.d.ts is hand-crafted" severity: "error" guard: "block_overwrite" }
 * ```
 * @trait gotcha
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type GotchaSeverity = 'warning' | 'error' | 'fatal';
export type GuardAction = 'warn' | 'block' | 'block_overwrite' | 'revert' | 'quarantine';

export interface GotchaConfig {
  id: string;
  trap: string;
  severity: GotchaSeverity;
  guard: GuardAction;
  filePatterns: string[];
  codePatterns: string[];
  remediation: string;
  learnedFrom?: string;
}

export interface GotchaState {
  tripped: boolean;
  trippedAt: number | null;
  guardActivated: boolean;
  tripCount: number;
}

const defaultConfig: GotchaConfig = { id: '', trap: '', severity: 'error', guard: 'warn', filePatterns: [], codePatterns: [], remediation: '' };

export function createGotchaHandler(): TraitHandler<GotchaConfig> {
  return { name: 'gotcha', defaultConfig,
    onAttach(n: HSPlusNode, c: GotchaConfig, ctx: TraitContext) {
      n.__gotchaState = { tripped: false, trippedAt: null, guardActivated: false, tripCount: 0 };
      ctx.emit?.('gotcha:armed', { id: c.id, guard: c.guard });
    },
    onDetach(n: HSPlusNode, _c: GotchaConfig, ctx: TraitContext) { delete n.__gotchaState; ctx.emit?.('gotcha:disarmed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: GotchaConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__gotchaState as GotchaState | undefined; if (!s) return;
      if (e.type === 'gotcha:check') {
        const file = (e.payload?.file as string) ?? '';
        const code = (e.payload?.code as string) ?? '';
        const fileMatch = c.filePatterns.length === 0 || c.filePatterns.some(p => file.includes(p));
        const codeMatch = c.codePatterns.length === 0 || c.codePatterns.some(p => code.includes(p));
        if (fileMatch && codeMatch) {
          s.tripped = true; s.trippedAt = Date.now(); s.tripCount++;
          if (c.guard !== 'warn') s.guardActivated = true;
          ctx.emit?.('gotcha:tripped', { id: c.id, severity: c.severity, trap: c.trap, guard: c.guard, remediation: c.remediation, blocked: c.guard !== 'warn' });
        }
      }
      if (e.type === 'gotcha:acknowledge') { s.tripped = false; s.guardActivated = false; ctx.emit?.('gotcha:acknowledged', { id: c.id }); }
    },
  };
}
