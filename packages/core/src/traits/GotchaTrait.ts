/**
 * GotchaTrait — Meta-trait for declarative gotcha/failure-mode documentation
 *
 * Captures known failure modes with severity levels, mitigation strategies,
 * and trigger conditions. Makes gotchas machine-checkable and surfaceable
 * through Studio/LSP/MCP tooling.
 *
 * Events emitted:
 *  gotcha_registered   { node, warning, severity, mitigation }
 *  gotcha_triggered    { node, warning, severity, triggerEvent }
 *  gotcha_query_result { node, gotchas }
 *
 * CLASS handler:
 *  @onGotchaTrigger — invoked when a gotcha's triggers_on event fires at runtime
 *
 * Compilation modes:
 *  - info:     dev=log, production=silent
 *  - warning:  dev=warn, production=warn
 *  - critical: dev=error, production=fail (with --enforce-gotchas)
 *
 * @see proposals/WISDOM_AND_GOTCHA_TRAITS_v1.md
 * @version 1.0.0
 */

import type { TraitHandler, TraitContext } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';

// ─── Types ────────────────────────────────────────────────────────────────────

export type GotchaSeverity = 'info' | 'warning' | 'critical';

export interface GotchaConfig {
  /** Warning message describing the failure mode */
  warning: string;
  /** Severity level */
  severity: GotchaSeverity;
  /** Mitigation strategy: description string or trait names */
  mitigation: string;
  /** Events that trigger this gotcha check */
  triggers_on: string[];
}

export interface GotchaEntry {
  warning: string;
  severity: GotchaSeverity;
  mitigation: string;
  triggers_on: string[];
  nodeId: string | undefined;
  registeredAt: number;
  triggerCount: number;
}

interface GotchaState {
  initialized: boolean;
  entry: GotchaEntry;
}

type GotchaNode = HSPlusNode & {
  __gotchaState?: GotchaState;
};

/** Module-level registry for all gotcha entries across the composition */
const gotchaRegistry: Map<string, GotchaEntry[]> = new Map();

// ─── Public API ───────────────────────────────────────────────────────────────

/** Query all gotcha entries, optionally filtered by severity */
export function listGotchas(severity?: GotchaSeverity): GotchaEntry[] {
  const all: GotchaEntry[] = [];
  for (const entries of gotchaRegistry.values()) {
    all.push(...entries);
  }
  if (severity) {
    return all.filter((g) => g.severity === severity);
  }
  return all;
}

/** Query gotchas that trigger on a specific event */
export function getGotchasForEvent(eventType: string): GotchaEntry[] {
  return gotchaRegistry.get(eventType) ?? [];
}

/** Clear all gotcha entries (for testing) */
export function clearGotchaRegistry(): void {
  gotchaRegistry.clear();
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: GotchaConfig = {
  warning: '',
  severity: 'warning',
  mitigation: '',
  triggers_on: [],
};

const SEVERITY_ORDER: Record<GotchaSeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

// ─── Handler ──────────────────────────────────────────────────────────────────

export const gotchaHandler: TraitHandler<GotchaConfig> = {
  name: 'gotcha',
  defaultConfig: DEFAULT_CONFIG,

  onAttach(node: HSPlusNode, config: GotchaConfig, context: TraitContext): void {
    const gNode = node as GotchaNode;

    if (!config.warning) {
      context.emit('gotcha_error', {
        node,
        error: '@gotcha requires a non-empty warning',
      });
      return;
    }

    const validSeverities: GotchaSeverity[] = ['info', 'warning', 'critical'];
    if (!validSeverities.includes(config.severity)) {
      context.emit('gotcha_error', {
        node,
        error: `@gotcha severity must be one of: ${validSeverities.join(', ')}. Got "${config.severity}"`,
      });
      return;
    }

    const entry: GotchaEntry = {
      warning: config.warning,
      severity: config.severity,
      mitigation: config.mitigation || '',
      triggers_on: config.triggers_on || [],
      nodeId: node.id,
      registeredAt: Date.now(),
      triggerCount: 0,
    };

    gNode.__gotchaState = {
      initialized: true,
      entry,
    };

    // Register in module-level registry indexed by trigger event
    if (entry.triggers_on.length > 0) {
      for (const trigger of entry.triggers_on) {
        if (!gotchaRegistry.has(trigger)) {
          gotchaRegistry.set(trigger, []);
        }
        gotchaRegistry.get(trigger)!.push(entry);
      }
    } else {
      // Global gotcha (always active)
      if (!gotchaRegistry.has('_always')) {
        gotchaRegistry.set('_always', []);
      }
      gotchaRegistry.get('_always')!.push(entry);
    }

    context.emit('gotcha_registered', {
      node,
      warning: entry.warning,
      severity: entry.severity,
      mitigation: entry.mitigation,
      triggers_on: entry.triggers_on,
    });

    // Immediately emit for critical gotchas at attach time
    if (SEVERITY_ORDER[entry.severity] >= SEVERITY_ORDER.critical) {
      context.emit('gotcha_triggered', {
        node,
        warning: entry.warning,
        severity: entry.severity,
        mitigation: entry.mitigation,
        triggerEvent: 'attach',
        immediate: true,
      });
    }
  },

  onDetach(node: HSPlusNode): void {
    const gNode = node as GotchaNode;
    const state = gNode.__gotchaState;
    if (state?.initialized) {
      // Remove from registry
      for (const [key, entries] of gotchaRegistry) {
        const idx = entries.indexOf(state.entry);
        if (idx >= 0) {
          entries.splice(idx, 1);
          if (entries.length === 0) gotchaRegistry.delete(key);
        }
      }
    }
    delete gNode.__gotchaState;
  },

  onUpdate(): void {
    // No per-frame work
  },

  onEvent(
    node: HSPlusNode,
    _config: GotchaConfig,
    context: TraitContext,
    event: { type: string; [key: string]: unknown }
  ): void {
    const gNode = node as GotchaNode;
    const state = gNode.__gotchaState;
    if (!state?.initialized) return;

    // CLASS handler: @onGotchaTrigger — check if this event matches triggers_on
    if (state.entry.triggers_on.includes(event.type)) {
      state.entry.triggerCount++;

      context.emit('gotcha_triggered', {
        node,
        warning: state.entry.warning,
        severity: state.entry.severity,
        mitigation: state.entry.mitigation,
        triggerEvent: event.type,
        triggerCount: state.entry.triggerCount,
      });
    }

    // Handle gotcha query (from Studio/LSP/MCP)
    if (event.type === 'gotcha_query') {
      const severityFilter = event.severity as GotchaSeverity | undefined;
      const results = listGotchas(severityFilter);

      context.emit('gotcha_query_result', {
        node,
        severity: severityFilter,
        gotchas: results,
        count: results.length,
      });
    }
  },
};
