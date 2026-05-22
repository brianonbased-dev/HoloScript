import { createHash } from 'crypto';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonRecord = { [key: string]: JsonValue };

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface PlayerSecuritySnapshot {
  playerId: string;
  tick: number;
  position?: Vector3;
  velocity?: Vector3;
  resources?: Record<string, number>;
  cooldowns?: Record<string, number>;
}

export interface AuthoritativeWorldState {
  tick: number;
  players: Record<string, PlayerSecuritySnapshot>;
  acceptedActionIds?: readonly string[];
}

export interface ProposedGameAction {
  actionId: string;
  playerId: string;
  type: string;
  tick: number;
  payload: JsonRecord;
  clientTimeMs?: number;
  signature?: string;
}

export type GuardSeverity = 'info' | 'warning' | 'error';
export type GuardDisposition = 'accept' | 'review' | 'reject' | 'quarantine' | 'kick' | 'ban';

export interface GuardViolation {
  ruleId: string;
  severity: GuardSeverity;
  message: string;
  evidence: JsonRecord;
}

export interface RuleEvaluationContext {
  nowTick: number;
  tickRateHz: number;
  maxLagTicks: number;
}

export interface AuthoritativeRule {
  id: string;
  description: string;
  evaluate(
    action: ProposedGameAction,
    state: AuthoritativeWorldState,
    context: RuleEvaluationContext
  ): GuardViolation[];
}

export interface AiWatchdogSignal {
  label: string;
  score: number;
  reasons: string[];
  evidenceRef?: string;
}

export interface WatchdogThresholds {
  review: number;
  quarantine: number;
  kick: number;
  ban: number;
}

export interface WatchdogAssessment {
  score: number;
  labels: string[];
  reasons: string[];
  evidenceRefs: string[];
}

export interface GameSecurityGuardOptions {
  rules?: AuthoritativeRule[];
  tickRateHz?: number;
  maxLagTicks?: number;
  watchdogThresholds?: Partial<WatchdogThresholds>;
}

export interface GuardDecision {
  actionId: string;
  playerId: string;
  actionType: string;
  tick: number;
  stateAccepted: boolean;
  disposition: GuardDisposition;
  violations: GuardViolation[];
  watchdog: WatchdogAssessment;
  evidenceHash: string;
  replayKey: string;
}

export interface GameSecurityReceipt {
  schema: 'holoscript.game-security.receipt.v0.1.0';
  plugin: 'game-security';
  pluginVersion: string;
  runId: string;
  actionId: string;
  playerId: string;
  actionType: string;
  stateAccepted: boolean;
  disposition: GuardDisposition;
  evidenceHash: string;
  replayKey: string;
  acceptance: {
    accepted: boolean;
    violations: Array<{ criterion: string; message: string }>;
  };
  watchdogScore: number;
  payloadHash: string;
}

const DEFAULT_THRESHOLDS: WatchdogThresholds = {
  review: 0.5,
  quarantine: 0.75,
  kick: 0.9,
  ban: 0.98,
};

export class AuthoritativeActionGuard {
  private readonly rules: AuthoritativeRule[];
  private readonly tickRateHz: number;
  private readonly maxLagTicks: number;
  private readonly watchdogThresholds: WatchdogThresholds;
  private readonly seenActionIds = new Set<string>();
  private readonly decisions: GuardDecision[] = [];

  constructor(options: GameSecurityGuardOptions = {}) {
    this.rules = options.rules ?? [];
    this.tickRateHz = options.tickRateHz ?? 60;
    this.maxLagTicks = options.maxLagTicks ?? 12;
    this.watchdogThresholds = { ...DEFAULT_THRESHOLDS, ...options.watchdogThresholds };
  }

  evaluate(
    action: ProposedGameAction,
    state: AuthoritativeWorldState,
    watchdogSignals: AiWatchdogSignal[] = []
  ): GuardDecision {
    const context: RuleEvaluationContext = {
      nowTick: state.tick,
      tickRateHz: this.tickRateHz,
      maxLagTicks: this.maxLagTicks,
    };
    const violations = [
      ...this.evaluateProtocolRules(action, state),
      ...this.rules.flatMap((rule) => rule.evaluate(action, state, context)),
    ];
    const watchdog = combineWatchdogSignals(watchdogSignals);
    const disposition = chooseDisposition(violations, watchdog, this.watchdogThresholds);
    const stateAccepted = disposition === 'accept' || disposition === 'review';
    const evidenceBase = {
      action,
      stateTick: state.tick,
      disposition,
      stateAccepted,
      violations,
      watchdog,
    };
    const evidenceHash = stableHash(evidenceBase);
    const decision: GuardDecision = {
      actionId: action.actionId,
      playerId: action.playerId,
      actionType: action.type,
      tick: action.tick,
      stateAccepted,
      disposition,
      violations,
      watchdog,
      evidenceHash,
      replayKey: `game-sec:${action.playerId}:${action.tick}:${evidenceHash.slice(0, 16)}`,
    };

    this.seenActionIds.add(action.actionId);
    this.decisions.push(decision);
    return decision;
  }

  getDecisions(): GuardDecision[] {
    return [...this.decisions];
  }

  clearEvidence(): void {
    this.decisions.length = 0;
    this.seenActionIds.clear();
  }

  private evaluateProtocolRules(
    action: ProposedGameAction,
    state: AuthoritativeWorldState
  ): GuardViolation[] {
    const violations: GuardViolation[] = [];
    const acceptedIds = new Set(state.acceptedActionIds ?? []);

    if (this.seenActionIds.has(action.actionId) || acceptedIds.has(action.actionId)) {
      violations.push({
        ruleId: 'protocol.unique_action_id',
        severity: 'error',
        message: `Duplicate actionId "${action.actionId}" cannot enter authoritative state`,
        evidence: { actionId: action.actionId },
      });
    }

    if (action.tick < state.tick - this.maxLagTicks) {
      violations.push({
        ruleId: 'protocol.max_lag_ticks',
        severity: 'error',
        message: `Action tick ${action.tick} is too far behind authoritative tick ${state.tick}`,
        evidence: { actionTick: action.tick, stateTick: state.tick, maxLagTicks: this.maxLagTicks },
      });
    }

    if (action.tick > state.tick + 1) {
      violations.push({
        ruleId: 'protocol.future_tick',
        severity: 'error',
        message: `Action tick ${action.tick} is ahead of authoritative tick ${state.tick}`,
        evidence: { actionTick: action.tick, stateTick: state.tick },
      });
    }

    if (!state.players[action.playerId]) {
      violations.push({
        ruleId: 'protocol.known_player',
        severity: 'error',
        message: `Unknown player "${action.playerId}" cannot submit authoritative actions`,
        evidence: { playerId: action.playerId },
      });
    }

    return violations;
  }
}

export function createGameSecurityGuard(
  options: GameSecurityGuardOptions = {}
): AuthoritativeActionGuard {
  return new AuthoritativeActionGuard(options);
}

export function createMovementEnvelopeRule(options: {
  maxMetersPerSecond: number;
  maxAccelerationMetersPerSecondSquared?: number;
}): AuthoritativeRule {
  return {
    id: 'movement.envelope',
    description: 'Rejects impossible movement against authoritative position history.',
    evaluate(action, state, context) {
      if (action.type !== 'move') return [];
      const previous = state.players[action.playerId];
      const nextPosition = readVector3(action.payload.position);
      if (!previous?.position || !nextPosition) return [];

      const elapsedTicks = Math.max(1, action.tick - previous.tick);
      const elapsedSeconds = elapsedTicks / context.tickRateHz;
      const distance = distance3(previous.position, nextPosition);
      const speed = distance / elapsedSeconds;
      const violations: GuardViolation[] = [];

      if (speed > options.maxMetersPerSecond) {
        violations.push({
          ruleId: 'movement.max_speed',
          severity: 'error',
          message: `Movement speed ${round(speed)}m/s exceeds ${options.maxMetersPerSecond}m/s`,
          evidence: {
            distanceMeters: round(distance),
            elapsedSeconds: round(elapsedSeconds),
            speedMetersPerSecond: round(speed),
            maxMetersPerSecond: options.maxMetersPerSecond,
          },
        });
      }

      if (
        options.maxAccelerationMetersPerSecondSquared !== undefined &&
        previous.velocity !== undefined
      ) {
        const nextVelocity = scaleVector(subtractVector(nextPosition, previous.position), 1 / elapsedSeconds);
        const acceleration =
          distance3(previous.velocity, nextVelocity) / Math.max(elapsedSeconds, Number.EPSILON);
        if (acceleration > options.maxAccelerationMetersPerSecondSquared) {
          violations.push({
            ruleId: 'movement.max_acceleration',
            severity: 'error',
            message: `Movement acceleration ${round(acceleration)}m/s^2 exceeds ${options.maxAccelerationMetersPerSecondSquared}m/s^2`,
            evidence: {
              accelerationMetersPerSecondSquared: round(acceleration),
              maxAccelerationMetersPerSecondSquared:
                options.maxAccelerationMetersPerSecondSquared,
            },
          });
        }
      }

      return violations;
    },
  };
}

export function createCooldownRule(cooldownTicksByAction: Record<string, number>): AuthoritativeRule {
  return {
    id: 'action.cooldown',
    description: 'Rejects actions attempted before their authoritative cooldown expires.',
    evaluate(action, state) {
      const previous = state.players[action.playerId];
      const configuredCooldown = cooldownTicksByAction[action.type];
      const nextAllowedTick = previous?.cooldowns?.[action.type];
      if (configuredCooldown === undefined || nextAllowedTick === undefined) return [];
      if (action.tick >= nextAllowedTick) return [];

      return [
        {
          ruleId: 'action.cooldown',
          severity: 'error',
          message: `Action "${action.type}" is on cooldown until tick ${nextAllowedTick}`,
          evidence: {
            actionType: action.type,
            actionTick: action.tick,
            nextAllowedTick,
            configuredCooldownTicks: configuredCooldown,
          },
        },
      ];
    },
  };
}

export function createResourceSpendRule(resourcePayloadKey = 'cost'): AuthoritativeRule {
  return {
    id: 'resource.spend_authority',
    description: 'Rejects resource spends that exceed authoritative balances.',
    evaluate(action, state) {
      const previous = state.players[action.playerId];
      const requestedSpend = readNumberRecord(action.payload[resourcePayloadKey]);
      if (!previous?.resources || !requestedSpend) return [];

      const violations: GuardViolation[] = [];
      for (const [resource, amount] of Object.entries(requestedSpend)) {
        const available = previous.resources[resource] ?? 0;
        if (amount > available) {
          violations.push({
            ruleId: 'resource.insufficient_balance',
            severity: 'error',
            message: `Resource spend "${resource}" requested ${amount}, only ${available} authoritative`,
            evidence: { resource, requested: amount, available },
          });
        }
      }
      return violations;
    },
  };
}

export function combineWatchdogSignals(signals: AiWatchdogSignal[]): WatchdogAssessment {
  const normalized = signals.map((signal) => ({
    ...signal,
    score: clamp01(signal.score),
  }));
  const score = normalized.reduce((max, signal) => Math.max(max, signal.score), 0);
  return {
    score,
    labels: [...new Set(normalized.map((signal) => signal.label))],
    reasons: [...new Set(normalized.flatMap((signal) => signal.reasons))],
    evidenceRefs: [
      ...new Set(
        normalized
          .map((signal) => signal.evidenceRef)
          .filter((ref): ref is string => typeof ref === 'string' && ref.length > 0)
      ),
    ],
  };
}

export function buildGameSecurityReceipt(
  decision: GuardDecision,
  options: { runId?: string; pluginVersion?: string } = {}
): GameSecurityReceipt {
  const receiptWithoutHash = {
    schema: 'holoscript.game-security.receipt.v0.1.0' as const,
    plugin: 'game-security' as const,
    pluginVersion: options.pluginVersion ?? '0.1.0',
    runId: options.runId ?? decision.replayKey,
    actionId: decision.actionId,
    playerId: decision.playerId,
    actionType: decision.actionType,
    stateAccepted: decision.stateAccepted,
    disposition: decision.disposition,
    evidenceHash: decision.evidenceHash,
    replayKey: decision.replayKey,
    acceptance: {
      accepted: decision.stateAccepted,
      violations: decision.violations.map((violation) => ({
        criterion: violation.ruleId,
        message: violation.message,
      })),
    },
    watchdogScore: decision.watchdog.score,
  };

  return {
    ...receiptWithoutHash,
    payloadHash: stableHash(receiptWithoutHash),
  };
}

export function stableHash(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableStringify(value)).digest('hex')}`;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value)) ?? 'undefined';
}

function chooseDisposition(
  violations: GuardViolation[],
  watchdog: WatchdogAssessment,
  thresholds: WatchdogThresholds
): GuardDisposition {
  const hasHardViolation = violations.some((violation) => violation.severity === 'error');
  if (hasHardViolation) {
    if (watchdog.score >= thresholds.ban) return 'ban';
    if (watchdog.score >= thresholds.kick) return 'kick';
    return 'reject';
  }
  if (watchdog.score >= thresholds.ban) return 'ban';
  if (watchdog.score >= thresholds.kick) return 'kick';
  if (watchdog.score >= thresholds.quarantine) return 'quarantine';
  if (watchdog.score >= thresholds.review) return 'review';
  return 'accept';
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const entry = record[key];
      if (entry !== undefined) {
        sorted[key] = canonicalize(entry);
      }
    }
    return sorted;
  }
  return value;
}

function readVector3(value: JsonValue | undefined): Vector3 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as JsonRecord;
  if (
    typeof record.x !== 'number' ||
    typeof record.y !== 'number' ||
    typeof record.z !== 'number'
  ) {
    return null;
  }
  return { x: record.x, y: record.y, z: record.z };
}

function readNumberRecord(value: JsonValue | undefined): Record<string, number> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'number') return null;
    result[key] = entry;
  }
  return result;
}

function subtractVector(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scaleVector(v: Vector3, scale: number): Vector3 {
  return { x: v.x * scale, y: v.y * scale, z: v.z * scale };
}

function distance3(a: Vector3, b: Vector3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
