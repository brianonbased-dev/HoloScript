/**
 * HoloLandTraits — runtime bridge tests for @stat / @luck / @encounter / @drop_table.
 *
 * Verifies the per-trait wrapper pattern: core handlers are event-protocol only;
 * runtime side bridges them to THREE.Object3D + TraitSystem.
 *
 * THREE.Object3D is real (no mocks) — state persistence via userData and
 * direct property assignment is unit-testable without WebGL.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  StatTrait,
  LuckTrait,
  EncounterTrait,
  DropTableTrait,
  setStat,
  modifyStat,
  queryStat,
  rollLuck,
  rollDropTable,
  resetEncounter,
} from '../HoloLandTraits';
import type { TraitContext } from '../TraitSystem';

function makeContext(object: THREE.Object3D, config: Record<string, unknown> = {}): TraitContext {
  return {
    object,
    physicsWorld: {} as TraitContext['physicsWorld'],
    config,
    data: {},
  };
}

function collectEvents(object: THREE.Object3D): Array<{ type: string; [k: string]: unknown }> {
  const events: Array<{ type: string; [k: string]: unknown }> = [];
  const original = object.dispatchEvent.bind(object);
  object.dispatchEvent = ((event: unknown) => {
    const e = event as { type: string; [k: string]: unknown };
    events.push(e);
    return original(e as Event);
  }) as typeof object.dispatchEvent;
  return events;
}

describe('HoloLandTraits — @stat runtime bridge', () => {
  let object: THREE.Object3D;
  let ctx: TraitContext;

  beforeEach(() => {
    object = new THREE.Object3D();
    object.name = 'test-agent';
    ctx = makeContext(object, { name: 'strength', value: 10, min: 0, max: 100 });
  });

  it('onApply attaches core stat state and emits stat:ready', () => {
    const events = collectEvents(object);
    StatTrait.onApply!(ctx);
    expect(events.some((e) => e.type === 'stat:ready')).toBe(true);
    const ready = events.find((e) => e.type === 'stat:ready')!;
    expect(ready.name).toBe('strength');
    expect(ready.baseValue).toBe(10);
    expect(ready.effective).toBe(10);
  });

  it('setStat updates base value and emits stat:changed', () => {
    StatTrait.onApply!(ctx);
    const events = collectEvents(object);
    setStat(ctx, 25);
    const changed = events.find((e) => e.type === 'stat:changed');
    expect(changed).toBeDefined();
    expect(changed!.effective).toBe(25);
    expect(changed!.baseValue).toBe(25);
  });

  it('modifyStat pushes modifier and recomputes effective', () => {
    StatTrait.onApply!(ctx);
    const events = collectEvents(object);
    modifyStat(ctx, 'buff', 5);
    const changed = events.find((e) => e.type === 'stat:changed');
    expect(changed).toBeDefined();
    expect(changed!.effective).toBe(15);
    expect(changed!.modifier).toEqual({ source: 'buff', delta: 5 });
  });

  it('modifyStat with clamp breaches max', () => {
    StatTrait.onApply!(ctx);
    const events = collectEvents(object);
    modifyStat(ctx, 'overflow', 200);
    const changed = events.filter((e) => e.type === 'stat:changed').pop();
    expect(changed).toBeDefined();
    expect(changed!.effective).toBe(100);
  });

  it('queryStat emits stat:value with current state', () => {
    StatTrait.onApply!(ctx);
    const events = collectEvents(object);
    queryStat(ctx, 'q1');
    const value = events.find((e) => e.type === 'stat:value');
    expect(value).toBeDefined();
    expect(value!.queryId).toBe('q1');
    expect(value!.effective).toBe(10);
  });

  it('onRemove clears core state', () => {
    StatTrait.onApply!(ctx);
    expect((object as unknown as Record<string, unknown>).__statState).toBeDefined();
    StatTrait.onRemove!(ctx);
    expect((object as unknown as Record<string, unknown>).__statState).toBeUndefined();
  });
});

describe('HoloLandTraits — @luck runtime bridge', () => {
  let object: THREE.Object3D;
  let ctx: TraitContext;

  beforeEach(() => {
    object = new THREE.Object3D();
    object.name = 'test-luck';
    ctx = makeContext(object, { baseChance: 0.5, luckBonus: 0.1, seed: 42 });
  });

  it('onApply attaches core luck state and emits luck:ready', () => {
    const events = collectEvents(object);
    LuckTrait.onApply!(ctx);
    expect(events.some((e) => e.type === 'luck:ready')).toBe(true);
  });

  it('rollLuck emits luck:roll_result with outcome metadata', () => {
    LuckTrait.onApply!(ctx);
    const events = collectEvents(object);
    rollLuck(ctx, 0.6, 'roll-1');
    const result = events.find((e) => e.type === 'luck:roll_result');
    expect(result).toBeDefined();
    expect(result!.rollId).toBe('roll-1');
    expect(typeof result!.outcome).toBe('boolean');
    expect(typeof result!.roll).toBe('number');
    expect(result!.modifiedThreshold).toBe(0.7);
  });

  it('onRemove clears core state', () => {
    LuckTrait.onApply!(ctx);
    expect((object as unknown as Record<string, unknown>).__luckState).toBeDefined();
    LuckTrait.onRemove!(ctx);
    expect((object as unknown as Record<string, unknown>).__luckState).toBeUndefined();
  });
});

describe('HoloLandTraits — @encounter runtime bridge', () => {
  let object: THREE.Object3D;
  let ctx: TraitContext;

  beforeEach(() => {
    object = new THREE.Object3D();
    object.name = 'test-encounter';
    ctx = makeContext(object, {
      encounterId: 'trap-01',
      triggerType: 'proximity',
      cooldownMs: 0,
      proximity_radius: 3,
      check_interval: 0,
    });
  });

  it('onApply attaches core encounter state and emits encounter:ready', () => {
    const events = collectEvents(object);
    EncounterTrait.onApply!(ctx);
    expect(events.some((e) => e.type === 'encounter:ready')).toBe(true);
  });

  it('proximity trigger fires encounter:fire when player is near', () => {
    // Build a simple scene with a camera far away
    const scene = new THREE.Scene();
    scene.add(object);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(10, 0, 0);
    scene.add(camera);

    EncounterTrait.onApply!(ctx);
    const events = collectEvents(object);

    // First update: camera at 10 units > radius 3 → no fire
    EncounterTrait.onUpdate!(ctx, 0.016);
    expect(events.some((e) => e.type === 'encounter:fire')).toBe(false);

    // Move camera close
    camera.position.set(1, 0, 0);
    EncounterTrait.onUpdate!(ctx, 0.016);
    const fire = events.find((e) => e.type === 'encounter:fire');
    expect(fire).toBeDefined();
    expect(fire!.encounterId).toBe('trap-01');
  });

  it('interaction trigger consumes the interacted flag', () => {
    const ctxInteraction = makeContext(object, {
      encounterId: 'door-01',
      triggerType: 'interaction',
      cooldownMs: 0,
      check_interval: 0,
    });
    EncounterTrait.onApply!(ctxInteraction);
    const events = collectEvents(object);

    // No flag → no fire
    EncounterTrait.onUpdate!(ctxInteraction, 0.016);
    expect(events.some((e) => e.type === 'encounter:fire')).toBe(false);

    // Set flag
    object.userData.interacted = true;
    EncounterTrait.onUpdate!(ctxInteraction, 0.016);
    expect(events.some((e) => e.type === 'encounter:fire')).toBe(true);

    // Flag consumed → no second fire
    EncounterTrait.onUpdate!(ctxInteraction, 0.016);
    expect(events.filter((e) => e.type === 'encounter:fire').length).toBe(1);
  });

  it('cooldown suppresses repeat fires', () => {
    const scene = new THREE.Scene();
    scene.add(object);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(1, 0, 0);
    scene.add(camera);

    const ctxCooldown = makeContext(object, {
      encounterId: 'trap-02',
      triggerType: 'proximity',
      cooldownMs: 5000,
      proximity_radius: 3,
      check_interval: 0,
    });
    EncounterTrait.onApply!(ctxCooldown);
    const events = collectEvents(object);

    EncounterTrait.onUpdate!(ctxCooldown, 0.016);
    expect(events.filter((e) => e.type === 'encounter:fire').length).toBe(1);

    // Immediate second check should be suppressed
    EncounterTrait.onUpdate!(ctxCooldown, 0.016);
    expect(events.filter((e) => e.type === 'encounter:fire').length).toBe(1);
    expect(events.some((e) => e.type === 'encounter:suppressed')).toBe(true);
  });

  it('resetEncounter clears cooldown', () => {
    const scene = new THREE.Scene();
    scene.add(object);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(1, 0, 0);
    scene.add(camera);

    const ctxReset = makeContext(object, {
      encounterId: 'trap-03',
      triggerType: 'proximity',
      cooldownMs: 5000,
      proximity_radius: 3,
      check_interval: 0,
    });
    EncounterTrait.onApply!(ctxReset);
    const events = collectEvents(object);

    EncounterTrait.onUpdate!(ctxReset, 0.016);
    expect(events.filter((e) => e.type === 'encounter:fire').length).toBe(1);

    resetEncounter(ctxReset);
    EncounterTrait.onUpdate!(ctxReset, 0.016);
    expect(events.filter((e) => e.type === 'encounter:fire').length).toBe(2);
  });

  it('onRemove clears core state', () => {
    EncounterTrait.onApply!(ctx);
    expect((object as unknown as Record<string, unknown>).__encounterState).toBeDefined();
    EncounterTrait.onRemove!(ctx);
    expect((object as unknown as Record<string, unknown>).__encounterState).toBeUndefined();
  });
});

describe('HoloLandTraits — @drop_table runtime bridge', () => {
  let object: THREE.Object3D;
  let ctx: TraitContext;

  beforeEach(() => {
    object = new THREE.Object3D();
    object.name = 'test-loot';
    ctx = makeContext(object, {
      tableId: 'goblin-loot',
      entries: [
        { itemId: 'gold', weight: 50 },
        { itemId: 'potion', weight: 30 },
        { itemId: 'sword', weight: 20, rareModifier: 0.5 },
      ],
      respectLuck: true,
    });
  });

  it('onApply attaches core drop_table state and emits drop_table:ready', () => {
    const events = collectEvents(object);
    DropTableTrait.onApply!(ctx);
    expect(events.some((e) => e.type === 'drop_table:ready')).toBe(true);
    const ready = events.find((e) => e.type === 'drop_table:ready')!;
    expect(ready.tableId).toBe('goblin-loot');
    expect(ready.entryCount).toBe(3);
  });

  it('rollDropTable emits drop_table:result with a picked item', () => {
    DropTableTrait.onApply!(ctx);
    const events = collectEvents(object);
    rollDropTable(ctx, { rollId: 'roll-1', luckBonus: 2, seed: 123 });
    const result = events.find((e) => e.type === 'drop_table:result');
    expect(result).toBeDefined();
    expect(result!.rollId).toBe('roll-1');
    expect(['gold', 'potion', 'sword']).toContain(result!.itemId);
    expect(result!.luckBonus).toBe(2);
  });

  it('rollDropTable with empty entries emits drop_table:empty', () => {
    const ctxEmpty = makeContext(object, { tableId: 'empty', entries: [] });
    DropTableTrait.onApply!(ctxEmpty);
    const events = collectEvents(object);
    rollDropTable(ctxEmpty, { rollId: 'roll-e' });
    expect(events.some((e) => e.type === 'drop_table:empty')).toBe(true);
  });

  it('onRemove clears core state', () => {
    DropTableTrait.onApply!(ctx);
    expect((object as unknown as Record<string, unknown>).__dropTableState).toBeDefined();
    DropTableTrait.onRemove!(ctx);
    expect((object as unknown as Record<string, unknown>).__dropTableState).toBeUndefined();
  });
});
