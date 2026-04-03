/**
 * HITL (Human-in-the-Loop) Trait
 *
 * Critical for agentic AI systems - 40% of agentic AI projects get cancelled
 * without proper HITL architecture (Deloitte 2026).
 *
 * Research Reference: uAA2++ Protocol - "HITL Architecture ADD to v3.1"
 *
 * Features:
 * - Approval gates for high-risk actions
 * - Confidence thresholds for autonomous vs. supervised operation
 * - Escalation policies with multi-level approval chains
 * - Audit logging for all decisions
 * - Rollback capabilities for failed autonomous actions
 *
 * @version 3.1.0
 * @milestone v3.1 (March 2026)
 */

import type { TraitHandler, HSPlusNode, TraitContext } from './TraitTypes';
import { HITLAuditLogger } from '../utils/HITLAuditLogger';
import { logger } from '../logger';
import { ConstitutionalValidator, constitutionalRule } from '../utils/ConstitutionalValidator';

// =============================================================================
// TYPES
// =============================================================================

type _ConfidenceLevel = 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'auto_approved';
type EscalationLevel = 'none' | 'notify' | 'soft_block' | 'hard_block' | 'emergency_stop';
type ActionCategory = 'read' | 'write' | 'execute' | 'delete' | 'transfer' | 'financial' | 'admin';

interface ApprovalRequest {
  id: string;
  timestamp: number;
  agentId: string;
  action: string;
  category: ActionCategory;
  description: string;
  confidence: number;
  riskScore: number;
  context: Record<string, unknown>;
  status: ApprovalStatus;
  approver?: string;
  approvalTime?: number;
  expiresAt: number;
  metadata: Record<string, unknown>;
}

interface EscalationRule {
  condition: EscalationCondition;
  level: EscalationLevel;
  notifyChannels: string[];
  timeout: number; // ms, 0 = wait forever
  autoApproveOnTimeout: boolean;
  requiresReason: boolean;
}

interface EscalationCondition {
  type:
    | 'confidence_below'
    | 'risk_above'
    | 'category_match'
    | 'keyword_match'
    | 'action_count'
    | 'time_based';
  value: number | string | string[];
}

interface AuditLogEntry {
  id: string;
  timestamp: number;
  agentId: string;
  action: string;
  decision: 'autonomous' | 'approved' | 'rejected' | 'escalated';
  confidence: number;
  riskScore: number;
  approver?: string;
  reason?: string;
  outcome?: 'success' | 'failure' | 'partial' | 'rollback';
  rollbackAvailable: boolean;
  rollbackId?: string;
  isViolation?: boolean;
  violations?: any[];
}

interface RollbackCheckpoint {
  id: string;
  timestamp: number;
  agentId: string;
  action: string;
  stateBefore: Record<string, unknown>;
  stateAfter?: Record<string, unknown>;
  canRollback: boolean;
  expiresAt: number;
}

interface HITLState {
  isEnabled: boolean;
  currentMode: 'autonomous' | 'supervised' | 'manual';
  pendingApprovals: ApprovalRequest[];
  auditLog: AuditLogEntry[];
  rollbackCheckpoints: RollbackCheckpoint[];
  actionCountThisSession: number;
  lastEscalationTime: number;
  activeApprover: string | null;
  sessionStartTime: number;
  permissions: Record<string, { approvals: number; confidenceBonus: number }>;
}

interface HITLConfig {
  /** Operating mode */
  mode: 'autonomous' | 'supervised' | 'manual';
  /** Confidence threshold for autonomous operation (0-1) */
  confidence_threshold: number;
  /** Risk threshold for escalation (0-1) */
  risk_threshold: number;
  /** Categories that always require approval */
  always_approve_categories: ActionCategory[];
  /** Categories that never require approval */
  never_approve_categories: ActionCategory[];
  /** Escalation rules */
  escalation_rules: EscalationRule[];
  /** Approval timeout in ms (0 = wait forever) */
  approval_timeout: number;
  /** Auto-approve on timeout */
  auto_approve_on_timeout: boolean;
  /** Max actions before mandatory human review */
  max_autonomous_actions: number;
  /** Enable audit logging */
  enable_audit_log: boolean;
  /** Enable rollback checkpoints */
  enable_rollback: boolean;
  /** Rollback checkpoint retention (ms) */
  rollback_retention: number;
  /** Notification webhook URL */
  notification_webhook: string;
  /** Approved human operators (wallet addresses or user IDs) */
  approved_operators: string[];
  /** Agent Constitution - high-level spatial rules */
  constitution: constitutionalRule[];
}

// =============================================================================
// HANDLER
// =============================================================================

export const hitlHandler: TraitHandler<HITLConfig> = {
  name: 'hitl',

  defaultConfig: {
    mode: 'supervised',
    confidence_threshold: 0.8,
    risk_threshold: 0.5,
    always_approve_categories: ['financial', 'admin', 'delete'],
    never_approve_categories: ['read'],
    escalation_rules: [
      {
        condition: { type: 'confidence_below', value: 0.5 },
        level: 'hard_block',
        notifyChannels: ['email', 'push'],
        timeout: 300000, // 5 minutes
        autoApproveOnTimeout: false,
        requiresReason: true,
      },
      {
        condition: { type: 'risk_above', value: 0.8 },
        level: 'emergency_stop',
        notifyChannels: ['email', 'push', 'sms'],
        timeout: 0,
        autoApproveOnTimeout: false,
        requiresReason: true,
      },
    ],
    approval_timeout: 600000, // 10 minutes
    auto_approve_on_timeout: false,
    max_autonomous_actions: 100,
    enable_audit_log: true,
    enable_rollback: true,
    rollback_retention: 86400000, // 24 hours
    notification_webhook: '',
    approved_operators: [],
    constitution: [],
  },

  onAttach(node, config, context) {
    const state: HITLState = {
      isEnabled: true,
      currentMode: config.mode,
      pendingApprovals: [],
      auditLog: [],
      rollbackCheckpoints: [],
      actionCountThisSession: 0,
      lastEscalationTime: 0,
      activeApprover: null,
      sessionStartTime: Date.now(),
      permissions: {},
    };
    node.__hitlState = state;

    context.emit?.('hitl_initialized', {
      node,
      mode: config.mode,
      thresholds: {
        confidence: config.confidence_threshold,
        risk: config.risk_threshold,
      },
    });
  },

  onDetach(node, config, context) {
    const state = node.__hitlState as HITLState;
    if (state && config.enable_audit_log) {
      // Persist audit log before detaching
      context.emit?.('hitl_audit_persist', {
        node,
        auditLog: state.auditLog,
        rollbackCheckpoints: state.rollbackCheckpoints,
      });
    }
    delete node.__hitlState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__hitlState as HITLState;
    if (!state) return;

    // Check for expired approvals
    const now = Date.now();
    state.pendingApprovals = state.pendingApprovals.map((approval) => {
      if (approval.status === 'pending' && approval.expiresAt <= now) {
        const newStatus: ApprovalStatus = config.auto_approve_on_timeout
          ? 'auto_approved'
          : 'expired';

        context.emit?.('hitl_approval_resolved', {
          node,
          approval: { ...approval, status: newStatus },
          reason: config.auto_approve_on_timeout ? 'timeout_auto_approve' : 'timeout_expired',
        });

        return { ...approval, status: newStatus };
      }
      return approval;
    });

    // Clean expired rollback checkpoints
    if (config.enable_rollback) {
      state.rollbackCheckpoints = state.rollbackCheckpoints.filter((cp) => cp.expiresAt > now);
    }

    // Check if max autonomous actions reached
    if (
      state.currentMode === 'autonomous' &&
      state.actionCountThisSession >= config.max_autonomous_actions
    ) {
      state.currentMode = 'supervised';
      context.emit?.('hitl_mode_change', {
        node,
        fromMode: 'autonomous',
        toMode: 'supervised',
        reason: 'max_autonomous_actions_reached',
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__hitlState as HITLState;
    if (!state) return;

    // Handle action request from agent
    if (event.type === 'agent_action_request') {
      const { action, category, confidence, riskScore, description, metadata } = event.payload as {
        action: string;
        category: ActionCategory;
        confidence: number;
        riskScore: number;
        description: string;
        metadata: Record<string, unknown>;
      };

      const decision = evaluateAction(node, state, config, {
        action,
        category,
        confidence,
        riskScore,
        description,
      });

      if (decision.approved) {
        // Auto-approve
        state.actionCountThisSession++;

        if (config.enable_rollback) {
          createRollbackCheckpoint(state, config, {
            action,
            agentId: node.id || 'unknown',
            stateBefore: (metadata.stateBefore as Record<string, unknown>) || {},
          });
        }

        if (config.enable_audit_log) {
          logAction(state, {
            action,
            agentId: node.id || 'unknown',
            decision: 'autonomous',
            confidence,
            riskScore,
            isViolation: decision.isViolation,
            violations: decision.violations,
          });
        }

        context.emit?.('hitl_action_approved', {
          node,
          action,
          reason: decision.reason,
          autonomous: true,
        });
      } else {
        // Require approval
        if (decision.isViolation) {
          context.emit?.('hitl_violation_caught', {
            node,
            action,
            violations: decision.violations,
          });
        }

        const approval = createApprovalRequest(state, config, {
          action,
          category,
          confidence,
          riskScore,
          description,
          metadata,
          agentId: node.id || 'unknown',
        });

        state.pendingApprovals.push(approval);
        notifyApprovers(config, approval, context);

        context.emit?.('hitl_approval_required', {
          node,
          approval,
          escalationLevel: decision.escalationLevel,
        });
      }
    }

    // Handle operator approval
    if (event.type === 'operator_approval') {
      const { approvalId, approved, reason, operator } = event.payload as {
        approvalId: string;
        approved: boolean;
        reason?: string;
        operator: string;
      };

      // Verify operator is authorized
      if (config.approved_operators.length > 0 && !config.approved_operators.includes(operator)) {
        context.emit?.('hitl_unauthorized_operator', { node, operator, approvalId });
        return;
      }

      const approval = state.pendingApprovals.find((a) => a.id === approvalId);
      if (approval) {
        approval.status = approved ? 'approved' : 'rejected';
        approval.approver = operator;
        approval.approvalTime = Date.now();

        if (config.enable_audit_log) {
          logAction(state, {
            action: approval.action,
            agentId: approval.agentId,
            decision: approved ? 'approved' : 'rejected',
            confidence: approval.confidence,
            riskScore: approval.riskScore,
            approver: operator,
            reason,
          });

          // Stateful Permission Tracking: Update approvals for this action category
          if (approved) {
            const permKey = `${approval.category}:${approval.action}`;
            const perm = state.permissions[permKey] || { approvals: 0, confidenceBonus: 0 };
            perm.approvals++;
            // For every 5 approvals, give a 0.05 confidence bonus (max 0.2)
            perm.confidenceBonus = Math.min(0.2, Math.floor(perm.approvals / 5) * 0.05);
            state.permissions[permKey] = perm;
          }
        }

        context.emit?.('hitl_approval_resolved', {
          node,
          approval,
          reason: reason || (approved ? 'operator_approved' : 'operator_rejected'),
        });
      }
    }

    // Handle rollback request (v3.1: Full rollback execution)
    if (event.type === 'rollback_request' && config.enable_rollback) {
      const { checkpointId } = event.payload as { checkpointId: string };
      const checkpoint = state.rollbackCheckpoints.find((cp) => cp.id === checkpointId);

      if (checkpoint && checkpoint.canRollback && checkpoint.expiresAt > Date.now()) {
        // v3.1: Actually apply the state rollback to the node
        if (checkpoint.stateBefore) {
          checkpoint.stateAfter = { ...(node as any) };
          for (const [key, value] of Object.entries(checkpoint.stateBefore)) {
            (node as any)[key] = value;
          }
        }
        checkpoint.canRollback = false; // Mark as used

        context.emit?.('hitl_rollback_executed', {
          node,
          checkpoint,
          stateBefore: checkpoint.stateBefore,
          stateAfter: checkpoint.stateAfter,
        });

        if (config.enable_audit_log) {
          logAction(state, {
            action: checkpoint.action,
            agentId: checkpoint.agentId,
            decision: 'rejected',
            confidence: 0,
            riskScore: 1,
            reason: 'rollback_executed',
          });
          const auditEntry = state.auditLog.find((a) => a.rollbackId === checkpointId);
          if (auditEntry) {
            auditEntry.outcome = 'rollback';
          }
        }
      } else if (checkpoint && !checkpoint.canRollback) {
        context.emit?.('hitl_rollback_failed', {
          node,
          checkpointId,
          reason: 'already_rolled_back',
        });
      } else if (checkpoint && checkpoint.expiresAt <= Date.now()) {
        context.emit?.('hitl_rollback_failed', {
          node,
          checkpointId,
          reason: 'expired',
        });
      }
    }

    // v3.1: Handle audit log flush request
    if (event.type === 'flush_audit_log') {
      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      const { endpoint, batchSize } = ((event.payload as TraitEventPayload) || {}) as {
        endpoint?: string;
        batchSize?: number;
      };
      const target = endpoint || config.notification_webhook;
      if (target) {
        flushAuditLog(state, target, batchSize || 50, context, node);
      }
    }

    // Handle mode change request
    if (event.type === 'hitl_mode_change_request') {
      const { newMode, operator } = event.payload as {
        newMode: 'autonomous' | 'supervised' | 'manual';
        operator: string;
      };

      if (config.approved_operators.length === 0 || config.approved_operators.includes(operator)) {
        const oldMode = state.currentMode;
        state.currentMode = newMode;

        if (newMode === 'autonomous') {
          state.actionCountThisSession = 0;
        }

        context.emit?.('hitl_mode_changed', {
          node,
          fromMode: oldMode,
          toMode: newMode,
          operator,
        });
      }
    }
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

interface ActionEvaluation {
  action: string;
  category: ActionCategory;
  confidence: number;
  riskScore: number;
  description?: string;
}

interface EvaluationResult {
  approved: boolean;
  reason: string;
  escalationLevel: EscalationLevel;
  isViolation?: boolean;
  violations?: any[];
}

function evaluateAction(
  node: HSPlusNode,
  state: HITLState,
  config: HITLConfig,
  action: ActionEvaluation
): EvaluationResult {
  // 1. Constitutional Gating (New in v3.4)
  const validation = ConstitutionalValidator.validate(
    {
      name: action.action,
      category: action.category,
      description: action.description || '',
    },
    config.constitution
  );

  if (!validation.allowed) {
    return {
      approved: false,
      reason: 'constitutional_violation',
      escalationLevel: validation.escalationLevel,
      isViolation: true,
      violations: validation.violations,
    };
  }

  // 2. Permission Persistence (Confidence Buffer)
  const permKey = `${action.category}:${action.action}`;
  const bonus = state.permissions[permKey]?.confidenceBonus || 0;
  const effectiveConfidence = action.confidence + bonus;

  // Manual mode requires all approvals
  if (state.currentMode === 'manual') {
    return { approved: false, reason: 'manual_mode', escalationLevel: 'hard_block' };
  }

  // Check never-approve categories
  if (config.never_approve_categories.includes(action.category)) {
    return { approved: true, reason: 'category_exempt', escalationLevel: 'none' };
  }

  // Check always-approve categories
  if (config.always_approve_categories.includes(action.category)) {
    return { approved: false, reason: 'category_requires_approval', escalationLevel: 'hard_block' };
  }

  // Check confidence threshold with effective confidence
  if (effectiveConfidence < config.confidence_threshold) {
    const level = effectiveConfidence < 0.5 ? 'hard_block' : 'soft_block';
    return { approved: false, reason: 'low_confidence', escalationLevel: level };
  }

  // Check risk threshold
  if (action.riskScore > config.risk_threshold) {
    const level = action.riskScore > 0.8 ? 'emergency_stop' : 'hard_block';
    return { approved: false, reason: 'high_risk', escalationLevel: level };
  }

  // Apply escalation rules
  for (const rule of config.escalation_rules) {
    if (matchesCondition(rule.condition, action)) {
      if (rule.level === 'emergency_stop' || rule.level === 'hard_block') {
        return { approved: false, reason: 'escalation_rule', escalationLevel: rule.level };
      }
    }
  }

  // Supervised mode: approve if passes all checks
  return { approved: true, reason: 'passed_checks', escalationLevel: 'none' };
}

function matchesCondition(condition: EscalationCondition, action: ActionEvaluation): boolean {
  switch (condition.type) {
    case 'confidence_below':
      return action.confidence < (condition.value as number);
    case 'risk_above':
      return action.riskScore > (condition.value as number);
    case 'category_match':
      return Array.isArray(condition.value)
        ? condition.value.includes(action.category)
        : condition.value === action.category;
    default:
      return false;
  }
}

function createApprovalRequest(
  state: HITLState,
  config: HITLConfig,
  params: {
    action: string;
    category: ActionCategory;
    confidence: number;
    riskScore: number;
    description: string;
    metadata: Record<string, unknown>;
    agentId: string;
  }
): ApprovalRequest {
  return {
    id: `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    agentId: params.agentId,
    action: params.action,
    category: params.category,
    description: params.description,
    confidence: params.confidence,
    riskScore: params.riskScore,
    context: params.metadata,
    status: 'pending',
    expiresAt: Date.now() + config.approval_timeout,
    metadata: {},
  };
}

function createRollbackCheckpoint(
  state: HITLState,
  config: HITLConfig,
  params: { action: string; agentId: string; stateBefore: Record<string, unknown> }
): void {
  const checkpoint: RollbackCheckpoint = {
    id: `rollback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    agentId: params.agentId,
    action: params.action,
    stateBefore: params.stateBefore,
    canRollback: true,
    expiresAt: Date.now() + config.rollback_retention,
  };
  state.rollbackCheckpoints.push(checkpoint);
}

function logAction(
  state: HITLState,
  params: {
    action: string;
    agentId: string;
    decision: 'autonomous' | 'approved' | 'rejected' | 'escalated';
    confidence: number;
    riskScore: number;
    approver?: string;
    reason?: string;
    isViolation?: boolean;
    violations?: any[];
  }
): void {
  const entry: AuditLogEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    agentId: params.agentId,
    action: params.action,
    decision: params.decision,
    confidence: params.confidence,
    riskScore: params.riskScore,
    approver: params.approver,
    reason: params.reason,
    rollbackAvailable: true,
    isViolation: params.isViolation,
    violations: params.violations,
  };
  state.auditLog.push(entry);

  // Persistent logging
  HITLAuditLogger.log(entry).catch((err) => {
    logger.error(`[HITLTrait] Persistent logging failed: ${err}`);
  });
}

async function notifyApprovers(
  config: HITLConfig,
  approval: ApprovalRequest,
  context: TraitContext
): Promise<void> {
  if (config.notification_webhook) {
    try {
      context.emit?.('hitl_notification_sent', {
        webhook: config.notification_webhook,
        approval,
        operators: config.approved_operators,
      });

      // Real backend request with auto-approve from response
      if (typeof fetch !== 'undefined') {
        const response = await fetch(config.notification_webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'hitl_approval_request',
            approval,
            timestamp: Date.now(),
          }),
        });

        // v3.1: Parse webhook response for auto-approve/reject
        if (response.ok) {
          try {
            const body = await response.json();
            if (body.decision === 'approve' || body.decision === 'reject') {
              context.emit?.('hitl_webhook_auto_decision', {
                approvalId: approval.id,
                decision: body.decision,
                reason: body.reason || 'webhook_auto',
                operator: body.operator || 'webhook',
              });
            }
          } catch {
            // Response not JSON — that's fine, just a notification
          }
        }
      }
    } catch (error) {
      context.emit?.('hitl_notification_failed', {
        webhook: config.notification_webhook,
        approvalId: approval.id,
        error: String(error),
      });
      logger.error(`[HITLTrait] Failed to notify approvers: ${error}`);
    }
  }
}

/**
 * v3.1: Batch flush audit log entries to an external endpoint
 */
async function flushAuditLog(
  state: HITLState,
  endpoint: string,
  batchSize: number,
  context: TraitContext,
  node: HSPlusNode
): Promise<void> {
  const entries = state.auditLog.splice(0, batchSize);
  if (entries.length === 0) return;

  try {
    if (typeof fetch !== 'undefined') {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'hitl_audit_batch',
          entries,
          count: entries.length,
          timestamp: Date.now(),
        }),
      });
    }
    context.emit?.('hitl_audit_flushed', {
      node,
      count: entries.length,
      endpoint,
    });
  } catch (error) {
    // Put entries back on failure
    state.auditLog.unshift(...entries);
    context.emit?.('hitl_audit_flush_failed', {
      node,
      count: entries.length,
      error: String(error),
    });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  HITLConfig,
  HITLState,
  ApprovalRequest,
  AuditLogEntry,
  RollbackCheckpoint,
  EscalationRule,
  EscalationCondition,
  ActionCategory,
  ApprovalStatus,
  EscalationLevel,
  ActionEvaluation,
  EvaluationResult,
};

export { evaluateAction, matchesCondition, createApprovalRequest, createRollbackCheckpoint };
