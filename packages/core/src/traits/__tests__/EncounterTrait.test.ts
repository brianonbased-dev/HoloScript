import { describe, it, expect, beforeEach } from 'vitest';
import {
  encounterHandler,
  shouldFire,
  type EncounterConfig,
} from '../EncounterTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

describe('EncounterTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('encounter-1');
    ctx = createMockContext();
  });

  // ---------------------------------------------------------------------------
  // onAttach
  // ---------------------------------------------------------------------------

  it('emits encounter:ready on attach with id and trigger type', () => {
    attachTrait(
      encounterHandler,
      node,
      { encounterId: 'goblin-ambush', triggerType: 'proximity', cooldownMs: 5000 },
      ctx
    );
    const ev = getLastEvent(ctx, 'encounter:ready') as {
      encounterId: string;
      triggerType: string;
      cooldownMs: number;
    };
    expect(ev.encounterId).toBe('goblin-ambush');
    expect(ev.triggerType).toBe('proximity');
    expect(ev.cooldownMs).toBe(5000);
  });

  // ---------------------------------------------------------------------------
  // encounter:check — FALSE + TRUE pairs per G.GOLD.013
  // ---------------------------------------------------------------------------

  it('FALSE: conditionMet=false does NOT emit encounter:fire', () => {
    const cfg: Partial<EncounterConfig> = { encounterId: 'e1', triggerType: 'interaction' };
    attachTrait(encounterHandler, node, cfg, ctx);
    sendEvent(encounterHandler, node, cfg, ctx, {
      type: 'encounter:check',
      conditionMet: false,
      now: 100,
    });
    expect(getEventCount(ctx, 'encounter:fire')).toBe(0);
    expect(getEventCount(ctx, 'encounter:suppressed')).toBe(0);
  });

  it('TRUE: conditionMet=true fires once (first call) when cooldown is zero', () => {
    const cfg: Partial<EncounterConfig> = {
      encounterId: 'e2',
      triggerType: 'interaction',
      cooldownMs: 0,
    };
    attachTrait(encounterHandler, node, cfg, ctx);
    sendEvent(encounterHandler, node, cfg, ctx, {
      type: 'encounter:check',
      conditionMet: true,
      now: 100,
    });
    const ev = getLastEvent(ctx, 'encounter:fire') as {
      encounterId: string;
      firedAt: number;
      fireCount: number;
    };
    expect(ev.encounterId).toBe('e2');
    expect(ev.firedAt).toBe(100);
    expect(ev.fireCount).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // cooldown gating — FALSE + TRUE
  // ---------------------------------------------------------------------------

  it('FALSE: second check inside cooldown window emits encounter:suppressed', () => {
    const cfg: Partial<EncounterConfig> = {
      encounterId: 'e3',
      triggerType: 'time',
      cooldownMs: 1000,
    };
    attachTrait(encounterHandler, node, cfg, ctx);
    sendEvent(encounterHandler, node, cfg, ctx, {
      type: 'encounter:check',
      conditionMet: true,
      now: 0,
    });
    sendEvent(encounterHandler, node, cfg, ctx, {
      type: 'encounter:check',
      conditionMet: true,
      now: 500,
    });
    expect(getEventCount(ctx, 'encounter:fire')).toBe(1);
    expect(getEventCount(ctx, 'encounter:suppressed')).toBe(1);
    const sup = getLastEvent(ctx, 'encounter:suppressed') as { remainingMs: number };
    expect(sup.remainingMs).toBe(500);
  });

  it('TRUE: second check past cooldown window fires again', () => {
    const cfg: Partial<EncounterConfig> = {
      encounterId: 'e4',
      triggerType: 'time',
      cooldownMs: 1000,
    };
    attachTrait(encounterHandler, node, cfg, ctx);
    sendEvent(encounterHandler, node, cfg, ctx, {
      type: 'encounter:check',
      conditionMet: true,
      now: 0,
    });
    sendEvent(encounterHandler, node, cfg, ctx, {
      type: 'encounter:check',
      conditionMet: true,
      now: 1500,
    });
    expect(getEventCount(ctx, 'encounter:fire')).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // G.GOLD.015 — experienced-failure category: cooldown = 0 always fires
  // ---------------------------------------------------------------------------

  it('G.GOLD.015 edge: cooldownMs=0 means EVERY check with conditionMet=true fires', () => {
    const cfg: Partial<EncounterConfig> = {
      encounterId: 'spam',
      triggerType: 'interaction',
      cooldownMs: 0,
    };
    attachTrait(encounterHandler, node, cfg, ctx);
    for (let i = 0; i < 5; i++) {
      sendEvent(encounterHandler, node, cfg, ctx, {
        type: 'encounter:check',
        conditionMet: true,
        now: i, // every tick — cooldown of 0 should ignore the timestamps
      });
    }
    expect(getEventCount(ctx, 'encounter:fire')).toBe(5);
    expect(getEventCount(ctx, 'encounter:suppressed')).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // encounter:reset
  // ---------------------------------------------------------------------------

  it('reset clears lastFireTimestamp so next conditionMet check fires immediately', () => {
    const cfg: Partial<EncounterConfig> = {
      encounterId: 'e5',
      triggerType: 'state',
      cooldownMs: 10_000,
    };
    attachTrait(encounterHandler, node, cfg, ctx);
    sendEvent(encounterHandler, node, cfg, ctx, {
      type: 'encounter:check',
      conditionMet: true,
      now: 0,
    });
    sendEvent(encounterHandler, node, cfg, ctx, { type: 'encounter:reset' });
    sendEvent(encounterHandler, node, cfg, ctx, {
      type: 'encounter:check',
      conditionMet: true,
      now: 100, // way inside the original cooldown
    });
    expect(getEventCount(ctx, 'encounter:fire')).toBe(2);
    expect(getEventCount(ctx, 'encounter:reset_ack')).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // payload forwarding
  // ---------------------------------------------------------------------------

  it('TRUE: arbitrary check data forwarded into fire event', () => {
    const cfg: Partial<EncounterConfig> = { encounterId: 'e6', triggerType: 'proximity' };
    attachTrait(encounterHandler, node, cfg, ctx);
    const inner = { distance: 1.2, otherEntityId: 'agent-7' };
    sendEvent(encounterHandler, node, cfg, ctx, {
      type: 'encounter:check',
      conditionMet: true,
      now: 1,
      data: inner,
    });
    const ev = getLastEvent(ctx, 'encounter:fire') as { data: unknown };
    expect(ev.data).toEqual(inner);
  });

  // ---------------------------------------------------------------------------
  // shouldFire — pure helper FALSE+TRUE per G.GOLD.013
  // ---------------------------------------------------------------------------

  describe('shouldFire (pure)', () => {
    it('FALSE: now-lastFire < cooldown returns false', () => {
      expect(shouldFire(500, 0, 1000)).toBe(false);
    });

    it('TRUE: now-lastFire >= cooldown returns true', () => {
      expect(shouldFire(1000, 0, 1000)).toBe(true);
      expect(shouldFire(1500, 0, 1000)).toBe(true);
    });

    it('TRUE: cooldown=0 always returns true', () => {
      expect(shouldFire(0, 0, 0)).toBe(true);
      expect(shouldFire(1, 0, 0)).toBe(true);
    });

    it('TRUE: never-fired (lastFire=-Infinity) always returns true', () => {
      expect(shouldFire(0, Number.NEGATIVE_INFINITY, 1000)).toBe(true);
    });

    it('FALSE: negative cooldownMs is treated as 0 (defensive — never blocks)', () => {
      expect(shouldFire(0, 0, -100)).toBe(true);
    });
  });
});
