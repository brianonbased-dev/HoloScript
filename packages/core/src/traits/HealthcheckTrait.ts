/**
 * HealthcheckTrait — v5.1
 *
 * Liveness / readiness probes with configurable checks.
 *
 * Events:
 *  healthcheck:run       (command) Run all checks
 *  healthcheck:result    { status, checks[], timestamp }
 *  healthcheck:register  { checkId, type }
 *  healthcheck:check_ok  { checkId }
 *  healthcheck:check_fail { checkId, error }
 *
 * @version 1.0.0
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface HealthcheckConfig {
  auto_interval_ms: number;
  timeout_ms: number;
}

interface HealthCheck {
  id: string;
  type: 'liveness' | 'readiness' | 'startup';
  lastStatus: 'pass' | 'fail' | 'unknown';
  lastChecked: number;
  error: string | null;
}

export const healthcheckHandler: TraitHandler<HealthcheckConfig> = {
  name: 'healthcheck',
  defaultConfig: { auto_interval_ms: 30000, timeout_ms: 5000 },

  onAttach(node: HSPlusNode): void {
    node.__healthcheckState = { checks: new Map<string, HealthCheck>(), lastRun: 0 };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__healthcheckState;
  },

  onUpdate(
    node: HSPlusNode,
    config: HealthcheckConfig,
    context: TraitContext,
    _delta: number
  ): void {
    if (config.auto_interval_ms <= 0) return;
    const state = node.__healthcheckState as
      | { checks: Map<string, HealthCheck>; lastRun: number }
      | undefined;
    if (!state) return;
    const now = Date.now();
    if (now - state.lastRun >= config.auto_interval_ms) {
      state.lastRun = now;
      emitResult(state, context);
    }
  },

  onEvent(
    node: HSPlusNode,
    _config: HealthcheckConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__healthcheckState as
      | { checks: Map<string, HealthCheck>; lastRun: number }
      | undefined;
    if (!state) return;
    const eventType = typeof event === 'string' ? event : event.type;

    switch (eventType) {
      case 'healthcheck:register': {
        const checkId = event.checkId as string;
        if (!checkId) break;
        state.checks.set(checkId, {
          id: checkId,
          type: (event.type as 'liveness' | 'readiness' | 'startup') ?? 'liveness',
          lastStatus: 'unknown',
          lastChecked: 0,
          error: null,
        });
        break;
      }
      case 'healthcheck:check_ok': {
        const check = state.checks.get(event.checkId as string);
        if (check) {
          check.lastStatus = 'pass';
          check.lastChecked = Date.now();
          check.error = null;
        }
        break;
      }
      case 'healthcheck:check_fail': {
        const check = state.checks.get(event.checkId as string);
        if (check) {
          check.lastStatus = 'fail';
          check.lastChecked = Date.now();
          check.error = (event.error as string) ?? 'unknown';
        }
        break;
      }
      case 'healthcheck:run': {
        state.lastRun = Date.now();
        emitResult(state, context);
        break;
      }
    }
  },
};

function emitResult(state: { checks: Map<string, HealthCheck> }, context: TraitContext): void {
  const checks = [...state.checks.values()];
  const allPass = checks.every((c) => c.lastStatus === 'pass');
  const anyFail = checks.some((c) => c.lastStatus === 'fail');
  context.emit?.('healthcheck:result', {
    status: anyFail ? 'unhealthy' : allPass ? 'healthy' : 'degraded',
    checks: checks.map((c) => ({ id: c.id, type: c.type, status: c.lastStatus, error: c.error })),
    timestamp: Date.now(),
  });
}

export default healthcheckHandler;
