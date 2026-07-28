import { describe, it, expect } from 'vitest';
import { ShardRegistryCompiler } from '../ShardRegistryCompiler';
import { createTestCompilerToken } from '../CompilerBase';
import type { HoloComposition, HoloWorldShard } from '../../parser/HoloCompositionTypes';

const token = createTestCompilerToken();

function comp(partial: Partial<HoloComposition>): HoloComposition {
  return {
    type: 'Composition',
    name: 'ShardWorld',
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

function shard(
  name: string,
  min: [number, number, number],
  max: [number, number, number],
  neighbors: string[],
  maxPlayers = 100
): HoloWorldShard {
  return {
    type: 'WorldShard',
    name,
    min,
    max,
    neighbors,
    maxPlayers,
    handoff: 'seamless',
    properties: {},
  } as unknown as HoloWorldShard;
}

const world = comp({
  worldShards: [
    shard('north', [-1000, 0, -1000], [0, 256, 1000], ['south'], 200),
    shard('south', [0, 0, -1000], [1000, 256, 1000], ['north', 'east']),
    shard('east', [1000, 0, -1000], [2000, 256, 1000], ['south']),
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

describe('ShardRegistryCompiler (P2.5) — lowering', () => {
  it('emits SHARD_REGISTRY + ShardRouter + shardForPosition', () => {
    const result = new ShardRegistryCompiler().compile(world, token);
    expect(result.success).toBe(true);
    expect(result.shards).toHaveLength(3);
    expect(result.shards.find((s) => s.name === 'north')?.maxPlayers).toBe(200);
    expect(result.code).toContain('export const SHARD_REGISTRY');
    expect(result.code).toContain('export class ShardRouter');
    expect(result.code).toContain('export function shardForPosition');
    expect(result.code).toContain('requestHandoff(');
    expect(result.code).toContain("'holoscript.mmo-shard-handoff.v1'");
  });

  it('COMPILE ERROR: a shard listing an undeclared neighbor fails the build', () => {
    const bad = comp({
      worldShards: [shard('lonely', [0, 0, 0], [10, 10, 10], ['ghost_shard'])],
    });
    const result = new ShardRegistryCompiler().compile(bad, token);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('unknown neighbor "ghost_shard"'))).toBe(true);
  });
});

describe('ShardRegistryCompiler (P2.5) — runtime proof (W.685 deep)', () => {
  it('routes by AABB and seals/validates cross-shard handoffs (anti-teleport)', async () => {
    const ts = await import('typescript');
    const result = new ShardRegistryCompiler().compile(world, token);
    const js = ts.transpileModule(result.code, {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const mod = evalModule(js);

    const shardForPosition = mod.shardForPosition as (
      x: number,
      y: number,
      z: number
    ) => string | null;
    const Router = mod.ShardRouter as new (now?: () => number) => {
      route: (x: number, y: number, z: number) => string | null;
      requestHandoff: (
        p: string,
        from: string,
        to: string,
        pos: [number, number, number]
      ) => { ok: boolean; reason?: string; receipt?: Record<string, unknown> };
      createShardServers: (
        gs: { define: (n: string, r: unknown, o?: unknown) => void },
        room: unknown
      ) => void;
      onHandoff?: (r: Record<string, unknown>) => void;
    };

    // AABB routing
    expect(shardForPosition(-500, 10, 0)).toBe('north');
    expect(shardForPosition(500, 10, 0)).toBe('south');
    expect(shardForPosition(1500, 10, 0)).toBe('east');
    expect(shardForPosition(9999, 10, 0)).toBeNull();

    const receipts: Array<Record<string, unknown>> = [];
    const router = new Router(() => 555);
    (router as { onHandoff: (r: Record<string, unknown>) => void }).onHandoff = (r) =>
      receipts.push(r);

    // Valid handoff: north → south (declared neighbor) + position inside south.
    const ok = router.requestHandoff('p1', 'north', 'south', [10, 10, 0]);
    expect(ok.ok).toBe(true);
    expect(ok.receipt!.schema).toBe('holoscript.mmo-shard-handoff.v1');
    expect(ok.receipt!.fromShard).toBe('north');
    expect(ok.receipt!.toShard).toBe('south');
    expect(ok.receipt!.tick).toBe(555);
    expect(receipts).toHaveLength(1);

    // Anti-teleport: north → east is NOT adjacent (east not in north.neighbors).
    const jump = router.requestHandoff('p1', 'north', 'east', [1500, 10, 0]);
    expect(jump.ok).toBe(false);
    expect(jump.reason).toBe('non_adjacent_shard');

    // Out of bounds: target valid + adjacent but position not inside.
    const oob = router.requestHandoff('p1', 'north', 'south', [9999, 10, 0]);
    expect(oob.ok).toBe(false);
    expect(oob.reason).toBe('position_out_of_bounds');

    // Unknown target shard.
    expect(router.requestHandoff('p1', 'north', 'nowhere', [0, 0, 0]).reason).toBe(
      'unknown_target_shard'
    );

    // Initial placement (no origin shard) — allowed if inside bounds.
    expect(router.requestHandoff('p1', '', 'north', [-500, 10, 0]).ok).toBe(true);

    // Rejected handoffs emit no receipt (only the 2 valid ones did).
    expect(receipts).toHaveLength(2);

    // Multi-define bootstrap: one room per shard.
    const defined: string[] = [];
    router.createShardServers({ define: (n) => defined.push(n) }, {});
    expect(defined.sort()).toEqual(['east', 'north', 'south']);
  });
});
