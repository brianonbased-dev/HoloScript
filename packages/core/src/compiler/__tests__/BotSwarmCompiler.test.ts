import { describe, it, expect } from 'vitest';
import { BotSwarmCompiler } from '../BotSwarmCompiler';
import { ColyseusCompiler } from '../ColyseusCompiler';
import { createTestCompilerToken } from '../CompilerBase';
import type {
  HoloComposition,
  HoloAbility,
  HoloSpawnPoint,
  HoloObjectTrait,
} from '../../parser/HoloCompositionTypes';

const token = createTestCompilerToken();

function comp(partial: Partial<HoloComposition>): HoloComposition {
  return {
    type: 'Composition',
    name: 'SwarmWorld',
    templates: [], objects: [], spatialGroups: [], lights: [], imports: [],
    timelines: [], audio: [], zones: [], transitions: [], conditionals: [],
    iterators: [], npcs: [], quests: [], abilities: [], dialogues: [],
    stateMachines: [], achievements: [], talentTrees: [], shapes: [],
    ...partial,
  } as unknown as HoloComposition;
}

const fireball: HoloAbility = {
  type: 'Ability',
  name: 'fireball',
  abilityType: 'spell',
  stats: { type: 'AbilityStats', cooldown: 6, manaCost: 40, range: 30 },
  effects: { type: 'AbilityEffects' },
} as unknown as HoloAbility;

function spawn(name: string, x: number, z: number): HoloSpawnPoint {
  return {
    type: 'SpawnPoint', name, faction: 'none', maxCount: 100,
    position: { type: 'Position', x, y: 0, z } as never, properties: {},
  } as unknown as HoloSpawnPoint;
}

function trait(name: string, config: Record<string, unknown>): HoloObjectTrait {
  return { type: 'ObjectTrait', name, config, args: [] } as unknown as HoloObjectTrait;
}

const world = comp({
  abilities: [fireball],
  spawnPoints: [spawn('camp', 0, 0)],
  traits: [trait('movement_contract', { max_speed: 8 }), trait('balance_test', { max_avg_tick_ms: 50 })],
});

// ---------------------------------------------------------------------------
// Emit-level tests
// ---------------------------------------------------------------------------

describe('BotSwarmCompiler — harness emit', () => {
  it('bakes world config into the harness', () => {
    const code = new BotSwarmCompiler().compile(world, token);
    expect(code).toContain('export function runBotSwarm');
    expect(code).toContain('export function assertBalance');
    expect(code).toContain('export const KNOWN_ABILITIES: string[] = ["fireball"];');
    expect(code).toContain('export const MAX_SPEED = 8;');
    expect(code).toContain('"maxAvgTickMs": 50');
  });

  it('emitted harness is valid TypeScript (W.685)', async () => {
    const ts = await import('typescript');
    const code = new BotSwarmCompiler().compile(world, token);
    const out = ts.transpileModule(code, {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
      reportDiagnostics: true,
    });
    const errors = (out.diagnostics ?? [])
      .filter((d) => d.category === ts.DiagnosticCategory.Error)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Integration: run a real swarm against a real generated server
// ---------------------------------------------------------------------------

function evalModule(js: string): Record<string, unknown> {
  const noopDecorator = () => () => undefined;
  const schemaStub = {
    Schema: class {},
    type: noopDecorator,
    MapSchema: class extends Map {},
    ArraySchema: class extends Array {},
  };
  const colyseusStub = {
    Room: class {
      state: unknown;
      setState(s: unknown) { this.state = s; }
      setSimulationInterval() {}
      broadcast() {}
    },
    Client: class {},
    Server: class { define() {} listen() { return Promise.resolve(); } },
  };
  const require_ = (id: string): unknown => {
    if (id === '@colyseus/schema') return schemaStub;
    if (id === 'colyseus') return colyseusStub;
    throw new Error(`unexpected require: ${id}`);
  };
  const moduleObj = { exports: {} as Record<string, unknown> };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('exports', 'require', 'module', js)(moduleObj.exports, require_, moduleObj);
  return moduleObj.exports;
}

describe('BotSwarmCompiler — load/balance against a real generated server (P2.11)', () => {
  it('drives a 24-bot swarm and the authoritative server holds + rejects cheats', async () => {
    const ts = await import('typescript');
    const tsOpts = {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        experimentalDecorators: true,
      },
    };

    const serverResult = new ColyseusCompiler().compile(world, token);
    const harnessCode = new BotSwarmCompiler().compile(world, token);

    const serverJs = ts.transpileModule(serverResult.code, tsOpts).outputText;
    const harnessJs = ts.transpileModule(harnessCode, tsOpts).outputText;

    const serverMod = evalModule(serverJs);
    const harnessMod = evalModule(harnessJs);

    const RoomClass = serverMod[serverResult.roomClassName] as new () => unknown;
    const runBotSwarm = harnessMod.runBotSwarm as (
      R: new () => unknown,
      opts: { bots: number; ticks: number; speedhackRatio: number; seed: number }
    ) => {
      bots: number; ticks: number; moveAttempts: number; moveRejects: number;
      castAttempts: number; castRejects: number; receipts: number;
      avgTickMs: number; finalPlayers: number;
    };
    const assertBalance = harnessMod.assertBalance as (r: unknown) => string[];

    const report = runBotSwarm(RoomClass, { bots: 24, ticks: 100, speedhackRatio: 0.3, seed: 12345 });

    // All bots joined and stayed
    expect(report.finalPlayers).toBe(24);
    // Speedhacks attempted under load were rejected by movement authority
    expect(report.moveAttempts).toBeGreaterThan(2000);
    expect(report.moveRejects).toBeGreaterThan(0);
    // Ability spam: first cast lands, subsequent within cooldown are rejected
    expect(report.castAttempts).toBeGreaterThan(2000);
    expect(report.castRejects).toBeGreaterThan(0);
    // Every authoritative outcome was receipted
    expect(report.receipts).toBeGreaterThan(0);
    expect(Number.isFinite(report.avgTickMs)).toBe(true);

    // Balance envelope holds (no failures)
    expect(assertBalance(report)).toEqual([]);
  });

  it('a clean (no-speedhack) swarm produces zero movement rejections', async () => {
    const ts = await import('typescript');
    const tsOpts = {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        experimentalDecorators: true,
      },
    };
    const serverResult = new ColyseusCompiler().compile(world, token);
    const harnessCode = new BotSwarmCompiler().compile(world, token);
    const serverMod = evalModule(ts.transpileModule(serverResult.code, tsOpts).outputText);
    const harnessMod = evalModule(ts.transpileModule(harnessCode, tsOpts).outputText);
    const RoomClass = serverMod[serverResult.roomClassName] as new () => unknown;
    const runBotSwarm = harnessMod.runBotSwarm as (
      R: new () => unknown,
      opts: { bots: number; ticks: number; speedhackRatio: number; seed: number }
    ) => { moveRejects: number; finalPlayers: number };

    const report = runBotSwarm(RoomClass, { bots: 8, ticks: 50, speedhackRatio: 0, seed: 7 });
    expect(report.moveRejects).toBe(0); // legal play is never falsely rejected
    expect(report.finalPlayers).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Distributed report aggregation — cloud bot-swarm prerequisite (D)
// ---------------------------------------------------------------------------

describe('BotSwarmCompiler — mergeBalanceReports (sharded/distributed aggregation)', () => {
  async function harnessExports(): Promise<Record<string, unknown>> {
    const ts = await import('typescript');
    const js = ts.transpileModule(new BotSwarmCompiler().compile(world, token), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        experimentalDecorators: true,
      },
    }).outputText;
    return evalModule(js);
  }

  it('emits mergeBalanceReports', () => {
    expect(new BotSwarmCompiler().compile(world, token)).toContain(
      'export function mergeBalanceReports'
    );
  });

  it('merges shards: counts sum, ticks max, avgTickMs tick-weighted', async () => {
    const mod = await harnessExports();
    const merge = mod.mergeBalanceReports as (
      rs: Array<Record<string, number>>
    ) => Record<string, number>;
    const a = { bots: 8, ticks: 100, moveAttempts: 800, moveRejects: 10, castAttempts: 800, castRejects: 5, receipts: 50, avgTickMs: 2, finalPlayers: 8 };
    const b = { bots: 8, ticks: 100, moveAttempts: 800, moveRejects: 20, castAttempts: 800, castRejects: 5, receipts: 60, avgTickMs: 4, finalPlayers: 8 };
    const m = merge([a, b]);
    expect(m.bots).toBe(16);
    expect(m.ticks).toBe(100);
    expect(m.moveRejects).toBe(30);
    expect(m.receipts).toBe(110);
    expect(m.finalPlayers).toBe(16);
    expect(m.avgTickMs).toBeCloseTo(3, 5); // (2*100 + 4*100) / 200
  });

  it('mergeBalanceReports([]) returns a zeroed report', async () => {
    const mod = await harnessExports();
    const merge = mod.mergeBalanceReports as (rs: unknown[]) => Record<string, number>;
    expect(merge([]).bots).toBe(0);
    expect(merge([]).avgTickMs).toBe(0);
  });
});
