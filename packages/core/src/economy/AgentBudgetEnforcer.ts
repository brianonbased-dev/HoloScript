/**
 * AgentBudgetEnforcer — Per-agent budget caps with enforcement
 *
 * Tracks spending per agent with configurable enforcement modes
 * (warn, soft, hard) and budget periods. Includes circuit breaker
 * for consecutive failures or overspend.
 *
 * Part of HoloScript v5.8 "Live Economy".
 *
 * @version 1.0.0
 */

import type { TelemetryCollector } from '../debug/TelemetryCollector';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Enforcement mode for budget limits.
 */
export type EnforcementMode = 'warn' | 'soft' | 'hard';

/**
 * Budget period type.
 */
export type BudgetPeriod = 'per-request' | 'per-session' | 'daily' | 'monthly';

/**
 * Budget configuration for an agent.
 */
export interface AgentBudget {
  /** Agent ID */
  agentId: string;
  /** Maximum spend per period (USDC base units, 6 decimals) */
  maxSpend: number;
  /** Budget period */
  period: BudgetPeriod;
  /** Enforcement mode */
  mode: EnforcementMode;
  /** Warning threshold (fraction 0-1, e.g. 0.8 = warn at 80%) */
  warnThreshold?: number;
  /** Circuit breaker: max consecutive failures before tripping */
  circuitBreakerThreshold?: number;
}

/**
 * Current budget state for an agent.
 */
export interface BudgetState {
  /** Agent ID */
  agentId: string;
  /** Amount spent in current period (USDC base units) */
  spent: number;
  /** Budget limit (USDC base units) */
  limit: number;
  /** Budget remaining (USDC base units) */
  remaining: number;
  /** Whether budget is exhausted */
  exhausted: boolean;
  /** Whether warning threshold is reached */
  warning: boolean;
  /** Current enforcement mode */
  mode: EnforcementMode;
  /** Current period */
  period: BudgetPeriod;
  /** Period start (ISO 8601) */
  periodStart: string;
  /** Number of requests in this period */
  requestCount: number;
  /** Circuit breaker state */
  circuitBreaker: CircuitBreakerState;
}

/**
 * Circuit breaker state.
 */
export interface CircuitBreakerState {
  /** Whether the circuit breaker is open (tripped) */
  isOpen: boolean;
  /** Consecutive failure count */
  consecutiveFailures: number;
  /** Maximum consecutive failures */
  threshold: number;
  /** When the circuit breaker was tripped (ISO 8601, null if not tripped) */
  trippedAt: string | null;
  /** When the circuit breaker will reset (ISO 8601, null if not tripped) */
  resetAt: string | null;
}

/**
 * Result of a spend authorization check.
 */
export interface SpendAuthorizationResult {
  /** Whether the spend is authorized */
  authorized: boolean;
  /** Reason for denial */
  reason?: string;
  /** Current budget state */
  state: BudgetState;
  /** Whether this is a warning (authorized but near limit) */
  warning?: boolean;
  /** Warning message */
  warningMessage?: string;
}

/**
 * AgentBudgetEnforcer configuration.
 */
export interface BudgetEnforcerConfig {
  /** Default budget for agents without explicit config */
  defaultBudget?: Partial<AgentBudget>;
  /** Circuit breaker reset timeout (ms, default: 60s) */
  circuitBreakerResetMs?: number;
  /** Telemetry collector */
  telemetry?: TelemetryCollector;
}

// =============================================================================
// INTERNAL TRACKING
// =============================================================================

interface AgentTracker {
  budget: AgentBudget;
  spent: number;
  requestCount: number;
  periodStart: number;
  consecutiveFailures: number;
  circuitBreakerTrippedAt: number | null;
  sessionId: string;
}

// =============================================================================
// AGENT BUDGET ENFORCER
// =============================================================================

export class AgentBudgetEnforcer {
  private trackers: Map<string, AgentTracker> = new Map();
  private config: Required<Omit<BudgetEnforcerConfig, 'telemetry' | 'defaultBudget'>> & {
    telemetry?: TelemetryCollector;
    defaultBudget: AgentBudget;
  };
  private sessionCounter = 0;

  constructor(config?: BudgetEnforcerConfig) {
    this.config = {
      defaultBudget: {
        agentId: '',
        maxSpend: 10_000_000, // $10.00 default
        period: 'daily',
        mode: 'soft',
        warnThreshold: 0.8,
        circuitBreakerThreshold: 5,
        ...config?.defaultBudget,
      } as AgentBudget,
      circuitBreakerResetMs: config?.circuitBreakerResetMs ?? 60_000,
      telemetry: config?.telemetry,
    };
  }

  // ===========================================================================
  // BUDGET MANAGEMENT
  // ===========================================================================

  /**
   * Set budget for an agent.
   */
  setBudget(budget: AgentBudget): void {
    const existing = this.trackers.get(budget.agentId);
    if (existing) {
      existing.budget = { ...budget };
    } else {
      this.trackers.set(budget.agentId, {
        budget: { ...budget },
        spent: 0,
        requestCount: 0,
        periodStart: Date.now(),
        consecutiveFailures: 0,
        circuitBreakerTrippedAt: null,
        sessionId: `session-${++this.sessionCounter}`,
      });
    }
  }

  /**
   * Get budget configuration for an agent.
   */
  getBudget(agentId: string): AgentBudget | undefined {
    return this.trackers.get(agentId)?.budget;
  }

  /**
   * Remove budget for an agent.
   */
  removeBudget(agentId: string): boolean {
    return this.trackers.delete(agentId);
  }

  // ===========================================================================
  // AUTHORIZATION
  // ===========================================================================

  /**
   * Check if an agent is authorized to spend a given amount.
   */
  authorize(agentId: string, amount: number): SpendAuthorizationResult {
    const tracker = this.getOrCreateTracker(agentId);
    this.checkPeriodReset(tracker);

    const state = this.buildState(tracker);

    // Check circuit breaker first
    if (state.circuitBreaker.isOpen) {
      // Check if reset time has passed
      if (tracker.circuitBreakerTrippedAt) {
        const elapsed = Date.now() - tracker.circuitBreakerTrippedAt;
        if (elapsed >= this.config.circuitBreakerResetMs) {
          // Reset circuit breaker
          tracker.consecutiveFailures = 0;
          tracker.circuitBreakerTrippedAt = null;
        } else {
          this.emitTelemetry('budget_circuit_breaker_blocked', { agentId, amount });
          return {
            authorized: false,
            reason: `Circuit breaker open: ${tracker.consecutiveFailures} consecutive failures. Resets in ${Math.ceil((this.config.circuitBreakerResetMs - elapsed) / 1000)}s`,
            state: this.buildState(tracker),
          };
        }
      }
    }

    // Check budget
    const wouldExceed = tracker.spent + amount > tracker.budget.maxSpend;
    const warnThreshold = tracker.budget.warnThreshold ?? 0.8;
    const atWarningLevel = (tracker.spent + amount) / tracker.budget.maxSpend >= warnThreshold;

    if (wouldExceed) {
      switch (tracker.budget.mode) {
        case 'hard':
          this.emitTelemetry('budget_hard_denied', {
            agentId,
            amount,
            spent: tracker.spent,
            limit: tracker.budget.maxSpend,
          });
          return {
            authorized: false,
            reason: `Budget exhausted (hard limit): spent ${tracker.spent} + ${amount} > limit ${tracker.budget.maxSpend}`,
            state: this.buildState(tracker),
          };

        case 'soft':
          this.emitTelemetry('budget_soft_denied', { agentId, amount, spent: tracker.spent });
          return {
            authorized: false,
            reason: `Budget exhausted (soft limit): spent ${tracker.spent} + ${amount} > limit ${tracker.budget.maxSpend}`,
            state: this.buildState(tracker),
          };

        case 'warn':
          // Allow but warn
          this.emitTelemetry('budget_warn_overspend', { agentId, amount });
          return {
            authorized: true,
            state: this.buildState(tracker),
            warning: true,
            warningMessage: `Budget exceeded: spent ${tracker.spent} + ${amount} > limit ${tracker.budget.maxSpend}`,
          };
      }
    }

    // Check warning level
    if (atWarningLevel && !wouldExceed) {
      return {
        authorized: true,
        state: this.buildState(tracker),
        warning: true,
        warningMessage: `Approaching budget limit: ${Math.round(((tracker.spent + amount) / tracker.budget.maxSpend) * 100)}% used`,
      };
    }

    return {
      authorized: true,
      state: this.buildState(tracker),
    };
  }

  /**
   * Record a spend. Call after a successful tool execution.
   */
  recordSpend(agentId: string, amount: number): void {
    const tracker = this.getOrCreateTracker(agentId);
    this.checkPeriodReset(tracker);
    tracker.spent += amount;
    tracker.requestCount++;
    tracker.consecutiveFailures = 0; // Reset on success

    this.emitTelemetry('budget_spend_recorded', { agentId, amount, totalSpent: tracker.spent });
  }

  /**
   * Record a failure. Increments circuit breaker counter.
   */
  recordFailure(agentId: string): void {
    const tracker = this.getOrCreateTracker(agentId);
    tracker.consecutiveFailures++;

    const threshold = tracker.budget.circuitBreakerThreshold ?? 5;
    if (tracker.consecutiveFailures >= threshold && !tracker.circuitBreakerTrippedAt) {
      tracker.circuitBreakerTrippedAt = Date.now();
      this.emitTelemetry('budget_circuit_breaker_tripped', {
        agentId,
        failures: tracker.consecutiveFailures,
        threshold,
      });
    }
  }

  // ===========================================================================
  // QUERIES
  // ===========================================================================

  /**
   * Get current budget state for an agent.
   */
  getState(agentId: string): BudgetState | undefined {
    const tracker = this.trackers.get(agentId);
    if (!tracker) return undefined;
    this.checkPeriodReset(tracker);
    return this.buildState(tracker);
  }

  /**
   * Get all agent budget states.
   */
  getAllStates(): BudgetState[] {
    return [...this.trackers.keys()].map((id) => this.getState(id)!).filter(Boolean);
  }

  /**
   * Get agents that are over budget.
   */
  getOverBudgetAgents(): BudgetState[] {
    return this.getAllStates().filter((s) => s.exhausted || s.circuitBreaker.isOpen);
  }

  /**
   * Reset an agent's period spending.
   */
  resetSpending(agentId: string): void {
    const tracker = this.trackers.get(agentId);
    if (tracker) {
      tracker.spent = 0;
      tracker.requestCount = 0;
      tracker.periodStart = Date.now();
      tracker.consecutiveFailures = 0;
      tracker.circuitBreakerTrippedAt = null;
      tracker.sessionId = `session-${++this.sessionCounter}`;
    }
  }

  /**
   * Reset circuit breaker for an agent.
   */
  resetCircuitBreaker(agentId: string): void {
    const tracker = this.trackers.get(agentId);
    if (tracker) {
      tracker.consecutiveFailures = 0;
      tracker.circuitBreakerTrippedAt = null;
    }
  }

  // ===========================================================================
  // INTERNALS
  // ===========================================================================

  private getOrCreateTracker(agentId: string): AgentTracker {
    let tracker = this.trackers.get(agentId);
    if (!tracker) {
      tracker = {
        budget: { ...this.config.defaultBudget, agentId },
        spent: 0,
        requestCount: 0,
        periodStart: Date.now(),
        consecutiveFailures: 0,
        circuitBreakerTrippedAt: null,
        sessionId: `session-${++this.sessionCounter}`,
      };
      this.trackers.set(agentId, tracker);
    }
    return tracker;
  }

  private checkPeriodReset(tracker: AgentTracker): void {
    const now = Date.now();
    const elapsed = now - tracker.periodStart;

    let shouldReset = false;
    switch (tracker.budget.period) {
      case 'per-request':
        shouldReset = tracker.requestCount > 0;
        break;
      case 'per-session':
        // Sessions don't auto-reset — must call resetSpending()
        break;
      case 'daily':
        shouldReset = elapsed >= 86400_000;
        break;
      case 'monthly':
        shouldReset = elapsed >= 30 * 86400_000;
        break;
    }

    if (shouldReset) {
      tracker.spent = 0;
      tracker.requestCount = 0;
      tracker.periodStart = now;
      tracker.sessionId = `session-${++this.sessionCounter}`;
    }
  }

  private buildState(tracker: AgentTracker): BudgetState {
    const remaining = Math.max(0, tracker.budget.maxSpend - tracker.spent);
    const warnThreshold = tracker.budget.warnThreshold ?? 0.8;
    const cbThreshold = tracker.budget.circuitBreakerThreshold ?? 5;

    return {
      agentId: tracker.budget.agentId,
      spent: tracker.spent,
      limit: tracker.budget.maxSpend,
      remaining,
      exhausted: remaining === 0,
      warning: tracker.spent / tracker.budget.maxSpend >= warnThreshold,
      mode: tracker.budget.mode,
      period: tracker.budget.period,
      periodStart: new Date(tracker.periodStart).toISOString(),
      requestCount: tracker.requestCount,
      circuitBreaker: {
        isOpen:
          tracker.circuitBreakerTrippedAt !== null &&
          Date.now() - tracker.circuitBreakerTrippedAt < this.config.circuitBreakerResetMs,
        consecutiveFailures: tracker.consecutiveFailures,
        threshold: cbThreshold,
        trippedAt: tracker.circuitBreakerTrippedAt
          ? new Date(tracker.circuitBreakerTrippedAt).toISOString()
          : null,
        resetAt: tracker.circuitBreakerTrippedAt
          ? new Date(
              tracker.circuitBreakerTrippedAt + this.config.circuitBreakerResetMs
            ).toISOString()
          : null,
      },
    };
  }

  private emitTelemetry(type: string, data?: Record<string, unknown>): void {
    this.config.telemetry?.record({
      type,
      severity: type.includes('denied') || type.includes('tripped') ? 'warning' : 'info',
      agentId: (data?.agentId as string) || 'budget-enforcer',
      data,
    });
  }
}
