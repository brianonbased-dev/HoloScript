/**
 * LotusGardenerTrait — schedule modulation + deterministic pulse tests
 *
 * The gardener IS the only lotus trait that has real onUpdate work. Tests
 * pin the deterministic pulse cadence so the cadence cannot drift across
 * platforms or runs.
 */

import { describe, it, expect } from 'vitest';
import {
  lotusGardenerHandler,
  deriveLotusGardenerSchedule,
  hashGardenerSeed,
  gardenerPulseJitter,
} from '../LotusGardenerTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

describe('LotusGardenerTrait — hashGardenerSeed', () => {
  it('hashes hex strings deterministically (matches PhyllotaxisTrait FNV-1a)', () => {
    expect(hashGardenerSeed('0x0000DEAD')).toBe(0x0000dead);
    expect(hashGardenerSeed('0xCAFEBABE')).toBe(0xcafebabe);
  });

  it('hashes plain strings deterministically across calls', () => {
    expect(hashGardenerSeed('brittney')).toBe(hashGardenerSeed('brittney'));
    expect(hashGardenerSeed('brittney')).not.toBe(hashGardenerSeed('gardener'));
  });
});

describe('LotusGardenerTrait — deriveLotusGardenerSchedule (pure)', () => {
  it('sealed state is busiest (interval_mult = 1.0, no emergency)', () => {
    const s = deriveLotusGardenerSchedule('sealed');
    expect(s.interval_mult).toBeCloseTo(1.0, 10);
    expect(s.intensity_mult).toBeCloseTo(1.0, 10);
    expect(s.droplet_mult).toBeCloseTo(1.0, 10);
    expect(s.emergency_mode).toBe(false);
  });

  it('full state is idlest (interval_mult = 4.0)', () => {
    const s = deriveLotusGardenerSchedule('full');
    expect(s.interval_mult).toBeCloseTo(4.0, 10);
    expect(s.intensity_mult).toBeLessThan(1.0);
    expect(s.droplet_mult).toBeLessThan(1.0);
  });

  it('wilted state activates emergency_mode with shorter interval', () => {
    const s = deriveLotusGardenerSchedule('wilted');
    expect(s.emergency_mode).toBe(true);
    expect(s.interval_mult).toBeCloseTo(0.5, 10);
    expect(s.intensity_mult).toBeGreaterThan(1.0);
    expect(s.droplet_mult).toBeGreaterThan(1.0);
  });

  it('interval monotonically increases sealed → budding → blooming → full', () => {
    const states = ['sealed', 'budding', 'blooming', 'full'] as const;
    const intervals = states.map((s) => deriveLotusGardenerSchedule(s).interval_mult);
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
    }
  });

  it('is deterministic', () => {
    expect(deriveLotusGardenerSchedule('blooming')).toEqual(deriveLotusGardenerSchedule('blooming'));
  });
});

describe('LotusGardenerTrait — gardenerPulseJitter (pure determinism)', () => {
  it('returns identical jitter for same (seed, counter)', () => {
    const a = gardenerPulseJitter(0xdeadbeef, 7);
    const b = gardenerPulseJitter(0xdeadbeef, 7);
    expect(a).toEqual(b);
  });

  it('returns different jitter for different counters', () => {
    const a = gardenerPulseJitter(0xdeadbeef, 7);
    const b = gardenerPulseJitter(0xdeadbeef, 8);
    expect(a).not.toEqual(b);
  });

  it('all three jitter components in [-1, 1)', () => {
    for (let counter = 0; counter < 50; counter++) {
      const j = gardenerPulseJitter(0xcafebabe, counter);
      expect(j.interval_jitter).toBeGreaterThanOrEqual(-1);
      expect(j.interval_jitter).toBeLessThan(1);
      expect(j.intensity_jitter).toBeGreaterThanOrEqual(-1);
      expect(j.intensity_jitter).toBeLessThan(1);
      expect(j.droplet_jitter).toBeGreaterThanOrEqual(-1);
      expect(j.droplet_jitter).toBeLessThan(1);
    }
  });
});

describe('LotusGardenerTrait — handler lifecycle', () => {
  it('onAttach emits lotus_gardener_attached with derived schedule', () => {
    const ctx = createMockContext();
    const node = createMockNode('gardener-test');
    attachTrait(lotusGardenerHandler, node, { seed: '0x0000DEAD' }, ctx);
    const evt = getLastEvent(ctx, 'lotus_gardener_attached') as Record<string, unknown> | undefined;
    expect(evt).toBeDefined();
    expect(evt?.bloomState).toBe('sealed');
    expect(evt?.seedHash).toBe(0x0000dead);
  });

  it('onUpdate accumulates time and fires gardener_pulse at exact interval boundary', () => {
    const ctx = createMockContext();
    const node = createMockNode('gardener-test');
    const cfg = {
      seed: '0x0000DEAD',
      base_pulse_interval_s: 5.0,
      base_pulse_intensity: 0.7,
      base_droplet_count: 8,
    };
    attachTrait(lotusGardenerHandler, node, cfg, ctx);
    ctx.clearEvents();

    // Sealed state has interval_mult = 1.0, so effective interval = 5.0s.
    // Tick 4.9s — no pulse yet.
    updateTrait(lotusGardenerHandler, node, cfg, ctx, 4.9);
    expect(getEventCount(ctx, 'gardener_pulse')).toBe(0);

    // Tick another 0.2s — total 5.1s, crossing the interval — pulse fires.
    updateTrait(lotusGardenerHandler, node, cfg, ctx, 0.2);
    expect(getEventCount(ctx, 'gardener_pulse')).toBe(1);
    expect(getEventCount(ctx, 'gardener_droplet_burst')).toBe(1);
  });

  it('pulse counter increments monotonically', () => {
    const ctx = createMockContext();
    const node = createMockNode('gardener-test');
    const cfg = { seed: '0x0000DEAD', base_pulse_interval_s: 1.0 };
    attachTrait(lotusGardenerHandler, node, cfg, ctx);
    ctx.clearEvents();

    for (let i = 0; i < 5; i++) {
      updateTrait(lotusGardenerHandler, node, cfg, ctx, 1.5);
    }
    const pulses = ctx.emittedEvents.filter((e) => e.event === 'gardener_pulse');
    expect(pulses.length).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect((pulses[i].data as { pulseCounter: number }).pulseCounter).toBe(i + 1);
    }
  });

  it('droplet count is deterministic for same (seed, counter, schedule)', () => {
    const ctx1 = createMockContext();
    const ctx2 = createMockContext();
    const cfg = {
      seed: '0x0000DEAD',
      base_pulse_interval_s: 1.0,
      base_droplet_count: 8,
    };
    const node1 = createMockNode('gardener-1');
    const node2 = createMockNode('gardener-2');
    attachTrait(lotusGardenerHandler, node1, cfg, ctx1);
    attachTrait(lotusGardenerHandler, node2, cfg, ctx2);

    for (let i = 0; i < 3; i++) {
      updateTrait(lotusGardenerHandler, node1, cfg, ctx1, 1.5);
      updateTrait(lotusGardenerHandler, node2, cfg, ctx2, 1.5);
    }
    const drops1 = ctx1.emittedEvents.filter((e) => e.event === 'gardener_droplet_burst');
    const drops2 = ctx2.emittedEvents.filter((e) => e.event === 'gardener_droplet_burst');
    expect(drops1.length).toBe(drops2.length);
    for (let i = 0; i < drops1.length; i++) {
      expect((drops1[i].data as { count: number }).count).toBe(
        (drops2[i].data as { count: number }).count
      );
    }
  });

  it('lotus_bloom_state_changed updates schedule and resets timer', () => {
    const ctx = createMockContext();
    const node = createMockNode('gardener-test');
    const cfg = { seed: '0x0000DEAD', base_pulse_interval_s: 1.0 };
    attachTrait(lotusGardenerHandler, node, cfg, ctx);
    ctx.clearEvents();

    sendEvent(lotusGardenerHandler, node, cfg, ctx, {
      type: 'lotus_bloom_state_changed',
      bloomState: 'full',
    });

    const evt = getLastEvent(ctx, 'lotus_gardener_schedule_changed') as
      | Record<string, unknown>
      | undefined;
    expect(evt).toBeDefined();
    expect(evt?.bloomState).toBe('full');
    const schedule = evt?.schedule as { interval_mult: number };
    expect(schedule.interval_mult).toBeCloseTo(4.0, 10);
  });

  it('emergency_mode propagates to gardener_pulse event payload', () => {
    const ctx = createMockContext();
    const node = createMockNode('gardener-test');
    const cfg = { seed: '0x0000DEAD', base_pulse_interval_s: 1.0 };
    attachTrait(lotusGardenerHandler, node, cfg, ctx);

    sendEvent(lotusGardenerHandler, node, cfg, ctx, {
      type: 'lotus_bloom_state_changed',
      bloomState: 'wilted',
    });
    ctx.clearEvents();

    // Wilted has interval_mult = 0.5, so effective interval = 0.5s.
    updateTrait(lotusGardenerHandler, node, cfg, ctx, 0.6);
    const evt = getLastEvent(ctx, 'gardener_pulse') as Record<string, unknown> | undefined;
    expect(evt).toBeDefined();
    expect(evt?.emergency).toBe(true);
  });

  it('lotus_gardener_query returns current state', () => {
    const ctx = createMockContext();
    const node = createMockNode('gardener-test');
    attachTrait(lotusGardenerHandler, node, { seed: '0x0000DEAD' }, ctx);
    ctx.clearEvents();

    sendEvent(lotusGardenerHandler, node, { seed: '0x0000DEAD' }, ctx, {
      type: 'lotus_gardener_query',
      queryId: 'q-g',
    });

    const evt = getLastEvent(ctx, 'lotus_gardener_response') as Record<string, unknown> | undefined;
    expect(evt).toBeDefined();
    expect(evt?.queryId).toBe('q-g');
    expect(evt?.bloomState).toBe('sealed');
    expect(evt?.pulseCounter).toBe(0);
    expect(evt?.seedHash).toBe(0x0000dead);
  });

  it('onDetach emits lotus_gardener_detached', () => {
    const ctx = createMockContext();
    const node = createMockNode('gardener-test');
    attachTrait(lotusGardenerHandler, node, { seed: '0x0000DEAD' }, ctx);
    ctx.clearEvents();
    lotusGardenerHandler.onDetach?.(node as never, lotusGardenerHandler.defaultConfig as never, ctx as never);
    expect(getEventCount(ctx, 'lotus_gardener_detached')).toBe(1);
  });

  it('negative delta is defensively ignored (no pulses fire)', () => {
    const ctx = createMockContext();
    const node = createMockNode('gardener-test');
    const cfg = { seed: '0x0000DEAD', base_pulse_interval_s: 1.0 };
    attachTrait(lotusGardenerHandler, node, cfg, ctx);
    ctx.clearEvents();
    for (let i = 0; i < 100; i++) {
      updateTrait(lotusGardenerHandler, node, cfg, ctx, -1.0);
    }
    expect(getEventCount(ctx, 'gardener_pulse')).toBe(0);
  });
});
