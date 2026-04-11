/** @interoperability_badge Trait — Verifies trait meets interop standards and earns a guarantee badge.
 *
 * Checks: typed config, event schema compliance, lifecycle completeness, no global state mutation,
 * deterministic onUpdate, serializable state, cross-platform safe.
 *
 * @trait interoperability_badge
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type BadgeLevel = 'none' | 'bronze' | 'silver' | 'gold' | 'platinum';
export interface AuditCheck { name: string; passed: boolean; message: string; weight: number; }

export interface InteroperabilityBadgeConfig {
  traitName: string;
  targetVersion: string;
  checks: string[];
  requiredBadgeLevel: BadgeLevel;
  autoRemediate: boolean;
}

export interface InteroperabilityBadgeState {
  badgeLevel: BadgeLevel;
  score: number;
  maxScore: number;
  passedChecks: string[];
  failedChecks: AuditCheck[];
  auditedAt: number | null;
}

const defaultConfig: InteroperabilityBadgeConfig = { traitName: '', targetVersion: '1.0.0', checks: ['typed_config', 'event_schema', 'lifecycle_complete', 'no_global_mutation', 'deterministic_update', 'serializable_state'], requiredBadgeLevel: 'silver', autoRemediate: false };

function scoreToBadge(score: number, max: number): BadgeLevel {
  const pct = max > 0 ? score / max : 0;
  if (pct >= 0.95) return 'platinum';
  if (pct >= 0.85) return 'gold';
  if (pct >= 0.70) return 'silver';
  if (pct >= 0.50) return 'bronze';
  return 'none';
}

export function createInteroperabilityBadgeHandler(): TraitHandler<InteroperabilityBadgeConfig> {
  return { name: 'interoperability_badge', defaultConfig,
    onAttach(n: HSPlusNode, c: InteroperabilityBadgeConfig, ctx: TraitContext) {
      n.__badgeState = { badgeLevel: 'none' as BadgeLevel, score: 0, maxScore: c.checks.length * 10, passedChecks: [], failedChecks: [], auditedAt: null };
      ctx.emit?.('badge:registered', { trait: c.traitName, checks: c.checks.length });
    },
    onDetach(n: HSPlusNode, _c: InteroperabilityBadgeConfig, ctx: TraitContext) { delete n.__badgeState; ctx.emit?.('badge:removed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: InteroperabilityBadgeConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__badgeState as InteroperabilityBadgeState | undefined; if (!s) return;
      if (e.type === 'badge:audit') {
        const results = (e.payload?.results as AuditCheck[]) ?? [];
        s.passedChecks = results.filter(r => r.passed).map(r => r.name);
        s.failedChecks = results.filter(r => !r.passed);
        s.score = results.reduce((sum, r) => sum + (r.passed ? r.weight : 0), 0);
        s.badgeLevel = scoreToBadge(s.score, s.maxScore);
        s.auditedAt = Date.now();
        const meetsRequirement = ['none','bronze','silver','gold','platinum'].indexOf(s.badgeLevel) >= ['none','bronze','silver','gold','platinum'].indexOf(c.requiredBadgeLevel);
        ctx.emit?.('badge:audited', { trait: c.traitName, badge: s.badgeLevel, score: s.score, max: s.maxScore, passed: s.passedChecks.length, failed: s.failedChecks.length, meetsRequirement });
        if (!meetsRequirement) ctx.emit?.('badge:below_requirement', { current: s.badgeLevel, required: c.requiredBadgeLevel, failedChecks: s.failedChecks.map(f => f.name) });
      }
    },
  };
}
