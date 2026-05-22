import { describe, expect, it } from 'vitest';
import {
  AuthoritativeActionGuard,
  buildGameSecurityReceipt,
  createCooldownRule,
  createMovementEnvelopeRule,
  createResourceSpendRule,
  stableHash,
  type AuthoritativeWorldState,
  type ProposedGameAction,
} from '../securitysolver';

function baseState(overrides: Partial<AuthoritativeWorldState> = {}): AuthoritativeWorldState {
  return {
    tick: 100,
    players: {
      player_1: {
        playerId: 'player_1',
        tick: 99,
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        resources: { ammo: 4, coins: 10 },
        cooldowns: { fire: 104 },
      },
    },
    ...overrides,
  };
}

function action(overrides: Partial<ProposedGameAction> = {}): ProposedGameAction {
  return {
    actionId: 'act_1',
    playerId: 'player_1',
    type: 'move',
    tick: 100,
    payload: { position: { x: 1, y: 0, z: 0 } },
    ...overrides,
  };
}

describe('AuthoritativeActionGuard', () => {
  it('accepts plausible movement into authoritative state', () => {
    const guard = new AuthoritativeActionGuard({
      rules: [createMovementEnvelopeRule({ maxMetersPerSecond: 80 })],
      tickRateHz: 60,
    });

    const decision = guard.evaluate(action(), baseState());

    expect(decision.stateAccepted).toBe(true);
    expect(decision.disposition).toBe('accept');
    expect(decision.violations).toHaveLength(0);
    expect(decision.replayKey).toContain('game-sec:player_1:100');
  });

  it('rejects impossible movement before it becomes authoritative state', () => {
    const guard = new AuthoritativeActionGuard({
      rules: [createMovementEnvelopeRule({ maxMetersPerSecond: 8 })],
      tickRateHz: 60,
    });

    const decision = guard.evaluate(
      action({ payload: { position: { x: 50, y: 0, z: 0 } } }),
      baseState()
    );

    expect(decision.stateAccepted).toBe(false);
    expect(decision.disposition).toBe('reject');
    expect(decision.violations.map((violation) => violation.ruleId)).toContain(
      'movement.max_speed'
    );
  });

  it('rejects duplicate action ids as replay attempts', () => {
    const guard = new AuthoritativeActionGuard();
    const first = guard.evaluate(action(), baseState());
    const second = guard.evaluate(action(), baseState());

    expect(first.stateAccepted).toBe(true);
    expect(second.stateAccepted).toBe(false);
    expect(second.violations[0].ruleId).toBe('protocol.unique_action_id');
  });

  it('rejects cooldown bypass attempts', () => {
    const guard = new AuthoritativeActionGuard({
      rules: [createCooldownRule({ fire: 5 })],
    });

    const decision = guard.evaluate(
      action({ actionId: 'act_fire', type: 'fire', payload: {} }),
      baseState()
    );

    expect(decision.stateAccepted).toBe(false);
    expect(decision.violations[0].ruleId).toBe('action.cooldown');
  });

  it('rejects resource spends above authoritative balance', () => {
    const guard = new AuthoritativeActionGuard({
      rules: [createResourceSpendRule()],
    });

    const decision = guard.evaluate(
      action({ actionId: 'act_buy', type: 'buy', payload: { cost: { coins: 12 } } }),
      baseState()
    );

    expect(decision.stateAccepted).toBe(false);
    expect(decision.violations[0].ruleId).toBe('resource.insufficient_balance');
  });

  it('lets AI watchdog quarantine high-risk but technically valid actions', () => {
    const guard = new AuthoritativeActionGuard();

    const decision = guard.evaluate(action(), baseState(), [
      {
        label: 'synthetic_input_timing',
        score: 0.82,
        reasons: ['input cadence matched automation cluster'],
        evidenceRef: 'watchdog/run-17',
      },
    ]);

    expect(decision.stateAccepted).toBe(false);
    expect(decision.disposition).toBe('quarantine');
    expect(decision.watchdog.reasons).toContain('input cadence matched automation cluster');
  });

  it('keeps lower-confidence AI watchdog findings reviewable without blocking state', () => {
    const guard = new AuthoritativeActionGuard();

    const decision = guard.evaluate(action(), baseState(), [
      {
        label: 'edge_tracking',
        score: 0.61,
        reasons: ['player stayed near max speed envelope'],
      },
    ]);

    expect(decision.stateAccepted).toBe(true);
    expect(decision.disposition).toBe('review');
  });
});

describe('game security evidence', () => {
  it('creates deterministic hashes for equivalent evidence payloads', () => {
    const a = stableHash({ z: 1, a: { b: true } });
    const b = stableHash({ a: { b: true }, z: 1 });

    expect(a).toBe(b);
    expect(a).toMatch(/^sha256:/);
  });

  it('builds a replayable receipt for rejected action evidence', () => {
    const guard = new AuthoritativeActionGuard({
      rules: [createMovementEnvelopeRule({ maxMetersPerSecond: 8 })],
    });
    const decision = guard.evaluate(
      action({ payload: { position: { x: 50, y: 0, z: 0 } } }),
      baseState()
    );

    const receipt = buildGameSecurityReceipt(decision, { runId: 'match-7' });

    expect(receipt.schema).toBe('holoscript.game-security.receipt.v0.1.0');
    expect(receipt.runId).toBe('match-7');
    expect(receipt.acceptance.accepted).toBe(false);
    expect(receipt.acceptance.violations[0].criterion).toBe('movement.max_speed');
    expect(receipt.payloadHash).toMatch(/^sha256:/);
  });
});
