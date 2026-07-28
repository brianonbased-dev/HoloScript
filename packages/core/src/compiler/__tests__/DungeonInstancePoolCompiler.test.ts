import { describe, it, expect } from 'vitest';
import { DungeonInstancePoolCompiler } from '../DungeonInstancePoolCompiler';
import { createTestCompilerToken } from '../CompilerBase';
import type { HoloComposition, HoloDungeonInstance } from '../../parser/HoloCompositionTypes';

const token = createTestCompilerToken();

function comp(partial: Partial<HoloComposition>): HoloComposition {
  return {
    type: 'Composition',
    name: 'DungeonWorld',
    templates: [],
    objects: [],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
    ...partial,
  } as unknown as HoloComposition;
}

function quest(name: string): unknown {
  return { type: 'Quest', name, objectives: [], rewards: [], branches: [], prerequisites: [] };
}

function di(name: string, o: Partial<HoloDungeonInstance>): HoloDungeonInstance {
  return {
    type: 'DungeonInstance',
    name,
    maxInstances: o.maxInstances ?? 1,
    partySize: o.partySize ?? 1,
    resetTimer: o.resetTimer ?? 0,
    completionQuest: o.completionQuest ?? '',
    npcs: o.npcs ?? [],
    objects: o.objects ?? [],
    properties: {},
  } as unknown as HoloDungeonInstance;
}

const world = comp({
  quests: [quest('shadowfen_cleared')] as never,
  dungeonInstances: [
    di('shadowfen_keep', {
      maxInstances: 2,
      partySize: 5,
      resetTimer: 3600,
      completionQuest: 'shadowfen_cleared',
      npcs: ['dungeon_boss'],
    }),
  ],
});

function evalModule(js: string): Record<string, unknown> {
  const mod = { exports: {} as Record<string, unknown> };
  const require_ = (id: string): unknown => {
    throw new Error(`unexpected require: ${id}`);
  };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('exports', 'require', 'module', js)(mod.exports, require_, mod);
  return mod.exports;
}

describe('DungeonInstancePoolCompiler (P2.6) — lowering', () => {
  it('emits DUNGEON_REGISTRY + the DungeonInstancePool class', () => {
    const result = new DungeonInstancePoolCompiler().compile(world, token);
    expect(result.success).toBe(true);
    expect(result.dungeons).toHaveLength(1);
    expect(result.dungeons[0]).toMatchObject({
      name: 'shadowfen_keep',
      maxInstances: 2,
      partySize: 5,
      completionQuest: 'shadowfen_cleared',
    });
    expect(result.code).toContain('export const DUNGEON_REGISTRY');
    expect(result.code).toContain('export class DungeonInstancePool');
    expect(result.code).toContain('requestInstance(dungeonId: string, party: string[])');
    expect(result.code).toContain('completeInstance(instanceId: string)');
    expect(result.code).toContain("'holoscript.mmo-dungeon-completion.v1'");
  });

  it('COMPILE ERROR: a dungeon referencing an undeclared completion_quest fails', () => {
    const bad = comp({
      quests: [quest('shadowfen_cleared')] as never,
      dungeonInstances: [
        di('haunted_crypt', { maxInstances: 1, completionQuest: 'nonexistent_quest' }),
      ],
    });
    const result = new DungeonInstancePoolCompiler().compile(bad, token);
    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.includes('unknown completion_quest "nonexistent_quest"'))
    ).toBe(true);
    expect(result.dungeons).toHaveLength(0);
  });
});

describe('DungeonInstancePoolCompiler (P2.6) — runtime proof (W.685 deep)', () => {
  it('pools instances to the cap, seals a completion receipt, and releases slots', async () => {
    const ts = await import('typescript');
    const result = new DungeonInstancePoolCompiler().compile(world, token);
    const js = ts.transpileModule(result.code, {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const mod = evalModule(js);
    const Pool = mod.DungeonInstancePool as new (now?: () => number) => {
      requestInstance: (d: string, p: string[]) => { id: string; party: string[] } | null;
      completeInstance: (id: string) => Record<string, unknown> | null;
      releaseInstance: (id: string) => boolean;
      liveCount: (d: string) => number;
      onCompletion?: (r: Record<string, unknown>) => void;
    };

    const receipts: Array<Record<string, unknown>> = [];
    const pool = new Pool(() => 1000);
    (pool as { onCompletion: (r: Record<string, unknown>) => void }).onCompletion = (r) =>
      receipts.push(r);

    // Fill to the cap (maxInstances = 2).
    const i1 = pool.requestInstance('shadowfen_keep', ['p1', 'p2']);
    const i2 = pool.requestInstance('shadowfen_keep', ['p3', 'p4']);
    expect(i1).not.toBeNull();
    expect(i2).not.toBeNull();
    expect(pool.liveCount('shadowfen_keep')).toBe(2);

    // Pool full → null.
    expect(pool.requestInstance('shadowfen_keep', ['p5'])).toBeNull();
    // Party too large → null (fresh attempt).
    expect(pool.requestInstance('shadowfen_keep', ['a', 'b', 'c', 'd', 'e', 'f'])).toBeNull();
    // Unknown dungeon → null.
    expect(pool.requestInstance('nope', ['x'])).toBeNull();

    // Complete instance 1 → sealed receipt, slot frees.
    const receipt = pool.completeInstance(i1!.id);
    expect(receipt).not.toBeNull();
    expect(receipt!.schema).toBe('holoscript.mmo-dungeon-completion.v1');
    expect(receipt!.dungeonId).toBe('shadowfen_keep');
    expect(receipt!.party).toEqual(['p1', 'p2']);
    expect(receipt!.completionQuest).toBe('shadowfen_cleared');
    expect(receipt!.tick).toBe(1000);
    expect(receipts).toHaveLength(1);
    expect(pool.liveCount('shadowfen_keep')).toBe(1); // completed no longer counts live

    // Double-complete is a no-op.
    expect(pool.completeInstance(i1!.id)).toBeNull();

    // A slot is free again → a new party can enter.
    expect(pool.requestInstance('shadowfen_keep', ['p6'])).not.toBeNull();

    // Release instance 2.
    expect(pool.releaseInstance(i2!.id)).toBe(true);
  });
});
