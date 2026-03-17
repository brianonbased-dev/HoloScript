/**
 * ForgetPolicyTrait — Wisdom/Gotcha Atom #3
 *
 * Deterministic retention/deletion policy for memory-bearing scopes.
 * Composes with @memory_crystal / @agent_memory for safe forgetting.
 *
 * Gotcha guarded: Accidental permanent deletion with no accountability.
 *
 * Events emitted:
 *  forget_policy_attached  { node, after, when, audit }
 *  forget_evaluate         { node, candidateCount, policy }
 *  forget_apply            { node, deletedCount, auditEntries }
 *  forget_audit_entry      { node, key, reason, timestamp }
 *  forget_error            { node, error }
 *
 * @see proposals/WISDOM_GOTCHA_ATOMS_BATCH1_RFC.md
 * @version 1.0.0
 */

import type { TraitHandler, TraitContext } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
import type { AgentMemoryState, Memory } from './AgentMemoryTrait';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ForgetPolicyConfig {
  /** Duration after which memories are eligible for deletion (e.g. "30d", "12h", "7d") */
  after: string;
  /** Predicate expression for conditional deletion (e.g. "relevance < 0.2", "accessCount < 3") */
  when: string;
  /** Enable immutable audit log of all deletions */
  audit: boolean;
  /** Evaluation interval in ms (how often to check and apply policy) */
  eval_interval_ms: number;
  /** Dry-run mode: evaluate but don't delete (for testing policies) */
  dry_run: boolean;
  /** Maximum deletions per evaluation cycle (prevents mass deletion) */
  max_deletes_per_cycle: number;
}

export interface AuditEntry {
  key: string;
  content_preview: string;
  reason: string;
  timestamp: number;
  tags: string[];
}

interface ForgetState {
  initialized: boolean;
  lastEvalAt: number;
  totalEvaluations: number;
  totalDeleted: number;
  auditLog: AuditEntry[];
  afterMs: number;
}

type ForgetNode = HSPlusNode & {
  __forgetPolicyState?: ForgetState;
  __agentMemoryState?: AgentMemoryState;
};

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: ForgetPolicyConfig = {
  after: '30d',
  when: '',
  audit: true,
  eval_interval_ms: 60_000, // every 60 seconds
  dry_run: false,
  max_deletes_per_cycle: 100,
};

// ─── Duration Parser ──────────────────────────────────────────────────────────

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)$/i);
  if (!match) return -1;

  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'ms': return value;
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    case 'w': return value * 7 * 24 * 60 * 60 * 1000;
    default: return -1;
  }
}

// ─── Predicate Evaluator ──────────────────────────────────────────────────────

type PredicateOp = '<' | '>' | '<=' | '>=' | '==' | '!=';

interface ParsedPredicate {
  field: string;
  op: PredicateOp;
  value: number;
}

function parsePredicate(expr: string): ParsedPredicate | null {
  if (!expr || expr.trim() === '') return null;

  const match = expr.trim().match(/^(\w+)\s*(<=|>=|<|>|==|!=)\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;

  return {
    field: match[1],
    op: match[2] as PredicateOp,
    value: parseFloat(match[3]),
  };
}

function evaluatePredicate(predicate: ParsedPredicate, memory: Memory): boolean {
  let fieldValue: number;

  switch (predicate.field) {
    case 'accessCount':
      fieldValue = memory.accessCount;
      break;
    case 'age':
      fieldValue = Date.now() - memory.createdAt;
      break;
    case 'idleTime':
      fieldValue = Date.now() - memory.accessedAt;
      break;
    case 'tagCount':
      fieldValue = memory.tags.length;
      break;
    case 'contentLength':
      fieldValue = memory.content.length;
      break;
    default:
      return false; // Unknown field
  }

  switch (predicate.op) {
    case '<': return fieldValue < predicate.value;
    case '>': return fieldValue > predicate.value;
    case '<=': return fieldValue <= predicate.value;
    case '>=': return fieldValue >= predicate.value;
    case '==': return fieldValue === predicate.value;
    case '!=': return fieldValue !== predicate.value;
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const forgetPolicyHandler: TraitHandler<ForgetPolicyConfig> = {
  name: 'forget_policy',
  defaultConfig: DEFAULT_CONFIG,

  onAttach(node: HSPlusNode, config: ForgetPolicyConfig, context: TraitContext): void {
    const forgetNode = node as ForgetNode;

    // Validate duration
    const afterMs = parseDuration(config.after);
    if (afterMs < 0) {
      context.emit('forget_error', {
        node,
        error: `Invalid duration: "${config.after}". Use format like "30d", "12h", "7d", "1w".`,
      });
      return;
    }

    // Validate predicate
    if (config.when) {
      const predicate = parsePredicate(config.when);
      if (!predicate) {
        context.emit('forget_error', {
          node,
          error: `Invalid predicate: "${config.when}". Use format like "accessCount < 3" or "idleTime > 86400000".`,
        });
        return;
      }
    }

    // Warn in production if audit is disabled
    if (!config.audit) {
      context.emit('forget_error', {
        node,
        error: 'audit=false: deletion records will not be kept. Enable audit for production use.',
      });
    }

    const state: ForgetState = {
      initialized: true,
      lastEvalAt: 0,
      totalEvaluations: 0,
      totalDeleted: 0,
      auditLog: [],
      afterMs,
    };
    forgetNode.__forgetPolicyState = state;

    context.emit('forget_policy_attached', {
      node,
      after: config.after,
      afterMs,
      when: config.when || '(none)',
      audit: config.audit,
      dryRun: config.dry_run,
    });
  },

  onDetach(node: HSPlusNode, _config: ForgetPolicyConfig, context: TraitContext): void {
    const forgetNode = node as ForgetNode;
    const state = forgetNode.__forgetPolicyState;
    if (state) {
      context.emit('forget_policy_detached', {
        node,
        totalEvaluations: state.totalEvaluations,
        totalDeleted: state.totalDeleted,
        auditLogSize: state.auditLog.length,
      });
    }
    delete forgetNode.__forgetPolicyState;
  },

  onUpdate(node: HSPlusNode, config: ForgetPolicyConfig, context: TraitContext): void {
    const forgetNode = node as ForgetNode;
    const state = forgetNode.__forgetPolicyState;
    const memState = forgetNode.__agentMemoryState;
    if (!state?.initialized || !memState) return;

    // Respect evaluation interval
    const now = Date.now();
    if (now - state.lastEvalAt < config.eval_interval_ms) return;
    state.lastEvalAt = now;
    state.totalEvaluations++;

    // Find candidates matching the policy
    const predicate = config.when ? parsePredicate(config.when) : null;
    const candidates: Memory[] = [];

    for (const memory of memState.memories.values()) {
      const age = now - memory.createdAt;

      // Check duration condition
      if (age < state.afterMs) continue;

      // Check predicate condition (if specified)
      if (predicate && !evaluatePredicate(predicate, memory)) continue;

      candidates.push(memory);
    }

    context.emit('forget_evaluate', {
      node,
      candidateCount: candidates.length,
      policy: { after: config.after, when: config.when },
      dryRun: config.dry_run,
    });

    if (candidates.length === 0) return;

    // Apply deletions (with max per cycle guard)
    const toDelete = candidates.slice(0, config.max_deletes_per_cycle);
    const auditEntries: AuditEntry[] = [];

    for (const memory of toDelete) {
      const reason = config.when
        ? `after=${config.after}, when=${config.when}`
        : `after=${config.after}`;

      if (config.audit) {
        const entry: AuditEntry = {
          key: memory.key,
          content_preview: memory.content.slice(0, 100),
          reason,
          timestamp: now,
          tags: [...memory.tags],
        };
        auditEntries.push(entry);
        state.auditLog.push(entry);

        context.emit('forget_audit_entry', { node, ...entry });
      }

      if (!config.dry_run) {
        memState.memories.delete(memory.key);
        state.totalDeleted++;
      }
    }

    context.emit('forget_apply', {
      node,
      deletedCount: config.dry_run ? 0 : toDelete.length,
      wouldDelete: config.dry_run ? toDelete.length : undefined,
      auditEntries: auditEntries.length,
      dryRun: config.dry_run,
    });
  },

  onEvent(node: HSPlusNode, config: ForgetPolicyConfig, context: TraitContext, event: { type: string; [key: string]: unknown }): void {
    const forgetNode = node as ForgetNode;
    const state = forgetNode.__forgetPolicyState;
    if (!state?.initialized) return;

    // Manual forget request
    if (event.type === 'forget_execute') {
      state.lastEvalAt = 0; // Reset interval to force immediate evaluation
      return;
    }

    // Export audit log
    if (event.type === 'forget_audit_export') {
      context.emit('forget_audit_log', {
        node,
        entries: [...state.auditLog],
        totalEvaluations: state.totalEvaluations,
        totalDeleted: state.totalDeleted,
      });
    }
  },
};
