/**
 * @fileoverview Tests for the cross-file authority symbol graph + bundle splitter
 * @module @holoscript/core/compiler/authority
 */

import { describe, it, expect } from 'vitest';
import { AuthoritySymbolGraph, mostRestrictiveTier } from '../AuthoritySymbolGraph';
import {
  buildColyseusAuthorityGraph,
  COLYSEUS_SCHEMA_FIELD_TIERS,
} from '../ColyseusAuthorityManifest';
import { splitServerAuthority } from '../ServerAuthorityBundleSplitter';
import { ColyseusCompiler } from '../../ColyseusCompiler';
import { createTestCompilerToken } from '../../CompilerBase';
import type {
  HoloComposition,
  HoloAbility,
  HoloLootTable,
  HoloNPC,
  HoloSpawnPoint,
} from '../../../parser/HoloCompositionTypes';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const token = createTestCompilerToken();

function comp(partial: Partial<HoloComposition>): HoloComposition {
  return {
    type: 'Composition',
    name: 'TestWorld',
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

function ability(name: string): HoloAbility {
  return {
    type: 'Ability',
    name,
    abilityType: 'spell',
    stats: { type: 'AbilityStats', range: 30 },
    effects: { type: 'AbilityEffects' },
  } as unknown as HoloAbility;
}

function lootTable(name: string): HoloLootTable {
  return { type: 'LootTable', name, entries: [], properties: {} } as unknown as HoloLootTable;
}

function npc(name: string): HoloNPC {
  return {
    type: 'NPC',
    name,
    npcType: 'npc',
    properties: [],
    behaviors: [],
  } as unknown as HoloNPC;
}

function spawn(name: string, x: number, y: number, z: number): HoloSpawnPoint {
  return {
    type: 'SpawnPoint',
    name,
    faction: 'none',
    maxCount: 4,
    position: { type: 'Position', x, y, z },
    properties: {},
  } as unknown as HoloSpawnPoint;
}

/** Extract the names of @type-decorated fields inside a generated schema class. */
function replicatedFieldsInCode(code: string, className: string): string[] {
  const lines = code.split('\n');
  const open = new RegExp(`^\\s*export class ${className} extends Schema \\{\\s*$`);
  let i = lines.findIndex((l) => open.test(l));
  if (i === -1) return [];
  const names: string[] = [];
  for (i += 1; i < lines.length; i++) {
    if (/^\s*\}\s*$/.test(lines[i])) break;
    const m = lines[i].match(/@type\(.*?\)\s+(\w+)/);
    if (m) names.push(m[1]);
  }
  return names;
}

// ===========================================================================
// AuthoritySymbolGraph — pure unit behaviour
// ===========================================================================

describe('AuthoritySymbolGraph — core graph behaviour', () => {
  it('mostRestrictiveTier orders server_only > server > replicated > client > unknown', () => {
    expect(mostRestrictiveTier('client', 'server_only')).toBe('server_only');
    expect(mostRestrictiveTier('replicated', 'server')).toBe('server');
    expect(mostRestrictiveTier('client', 'unknown')).toBe('client');
    expect(mostRestrictiveTier('replicated', 'replicated')).toBe('replicated');
  });

  it('merges a re-declared symbol to the more restrictive tier and unions refs', () => {
    const g = new AuthoritySymbolGraph();
    const k = AuthoritySymbolGraph.keyFor('a.hs', 'x');
    g.addSymbol({
      key: k,
      name: 'x',
      sourceFile: 'a.hs',
      kind: 'constant',
      tier: 'client',
      refs: ['r1'],
    });
    g.addSymbol({
      key: k,
      name: 'x',
      sourceFile: 'a.hs',
      kind: 'constant',
      tier: 'server_only',
      refs: ['r2'],
    });
    const sym = g.get(k)!;
    expect(sym.tier).toBe('server_only');
    expect([...sym.refs].sort()).toEqual(['r1', 'r2']);
    expect(g.size).toBe(1);
  });

  it('reports NO violation when the partition is clean', () => {
    const g = new AuthoritySymbolGraph();
    const client = AuthoritySymbolGraph.keyFor('f', 'pos');
    const server = AuthoritySymbolGraph.keyFor('f', 'rng');
    g.addSymbol({
      key: client,
      name: 'pos',
      sourceFile: 'f',
      kind: 'schema_field',
      tier: 'replicated',
      clientExposed: true,
    });
    g.markClientRoot(client);
    g.addSymbol({
      key: server,
      name: 'rng',
      sourceFile: 'f',
      kind: 'constant',
      tier: 'server_only',
    });
    expect(g.findViolations()).toEqual([]);
  });

  it('TEETH: flags a server_only symbol that is exposed on the client wire surface', () => {
    const g = new AuthoritySymbolGraph();
    const leak = AuthoritySymbolGraph.keyFor('f', 'rngState', 'GameRoomState');
    g.addSymbol({
      key: leak,
      name: 'rngState',
      sourceFile: 'f',
      kind: 'schema_field',
      tier: 'server_only',
      clientExposed: true, // regression: someone @type-decorated the RNG seed
    });
    const v = g.findViolations();
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe('exposed');
    expect(v[0].symbol.name).toBe('rngState');
  });

  it('TEETH: flags a server_only symbol reachable from a client root, with a path', () => {
    const g = new AuthoritySymbolGraph();
    const root = AuthoritySymbolGraph.keyFor('f', 'clientField');
    const mid = AuthoritySymbolGraph.keyFor('f', 'helper');
    const secret = AuthoritySymbolGraph.keyFor('f', 'lootRoll');
    g.addSymbol({
      key: root,
      name: 'clientField',
      sourceFile: 'f',
      kind: 'schema_field',
      tier: 'replicated',
      refs: [mid],
    });
    g.addSymbol({
      key: mid,
      name: 'helper',
      sourceFile: 'f',
      kind: 'room_method',
      tier: 'server',
      refs: [secret],
    });
    g.addSymbol({
      key: secret,
      name: 'lootRoll',
      sourceFile: 'f',
      kind: 'registry',
      tier: 'server_only',
    });
    g.markClientRoot(root);

    const v = g.findViolations();
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe('reachable');
    expect(v[0].symbol.name).toBe('lootRoll');
    expect(v[0].path).toEqual([root, mid, secret]);
  });

  it('partition separates client-visible symbols from server-only', () => {
    const g = new AuthoritySymbolGraph();
    const c = AuthoritySymbolGraph.keyFor('f', 'pos');
    const s = AuthoritySymbolGraph.keyFor('f', 'rng');
    g.addSymbol({ key: c, name: 'pos', sourceFile: 'f', kind: 'schema_field', tier: 'replicated' });
    g.addSymbol({ key: s, name: 'rng', sourceFile: 'f', kind: 'constant', tier: 'server_only' });
    const { serverSet, clientSet } = g.partition();
    expect(clientSet.map((x) => x.name)).toEqual(['pos']);
    expect(serverSet.map((x) => x.name)).toEqual(['rng']);
  });
});

// ===========================================================================
// Colyseus manifest + bundle splitter — against REAL compiler output
// ===========================================================================

describe('ServerAuthorityBundleSplitter — real ColyseusCompiler output', () => {
  function compileWorld(): {
    result: ReturnType<ColyseusCompiler['compile']>;
    composition: HoloComposition;
  } {
    const composition = comp({
      name: 'FrontierMMO',
      abilities: [ability('fireball'), ability('frostbolt')],
      lootTables: [lootTable('goblin_drops')],
      npcs: [npc('goblin_scout')],
      spawnPoints: [spawn('camp', 10, 0, 10)],
    });
    const result = new ColyseusCompiler().compile(composition, token);
    return { result, composition };
  }

  it('proves the partition holds on a correct compile (zero violations)', () => {
    const { result, composition } = compileWorld();
    const split = splitServerAuthority(result, composition);
    expect(split.proof.provablyPartitioned).toBe(true);
    expect(split.proof.violations).toEqual([]);
    expect(split.proof.serverOnlySymbolCount).toBeGreaterThan(0);
    expect(split.proof.summary).toContain('PROVABLY PARTITIONED');
  });

  it('serverBundle is the authoritative ColyseusCompiler output verbatim', () => {
    const { result, composition } = compileWorld();
    const split = splitServerAuthority(result, composition);
    expect(split.serverBundle).toBe(result.code);
  });

  it('clientSdk contains the replicated schema + manifest but NO server-only symbol', () => {
    const { result, composition } = compileWorld();
    const { clientSdk } = splitServerAuthority(result, composition);

    // Client surface present
    expect(clientSdk).toContain('export class PlayerState extends Schema');
    expect(clientSdk).toContain('@type(');
    expect(clientSdk).toContain('export const TICK_RATE');
    expect(clientSdk).toContain('export const CHUNK_MANIFEST');

    // Server-only symbols structurally absent
    expect(clientSdk).not.toContain('ABILITY_REGISTRY');
    expect(clientSdk).not.toContain('LOOT_TABLES');
    expect(clientSdk).not.toContain('BRAIN_REGISTRY');
    expect(clientSdk).not.toContain('RNG_SEED');
    expect(clientSdk).not.toContain('rngState');
    expect(clientSdk).not.toContain('extends Room');
    expect(clientSdk).not.toContain('rollLoot');
    // Server-only schema fields stripped
    expect(clientSdk).not.toContain('lastMoveTick');
    expect(clientSdk).not.toContain('cooldowns');
    expect(clientSdk).not.toContain('brainTick');
  });

  it('DRIFT GUARD: schema-field tier table matches the emitter @type decorations', () => {
    const { result } = compileWorld();
    for (const cls of COLYSEUS_SCHEMA_FIELD_TIERS) {
      if (!result.schemaClasses.includes(cls.className)) continue;
      const emittedReplicated = replicatedFieldsInCode(result.code, cls.className).sort();
      expect(emittedReplicated, `replicated set drift in ${cls.className}`).toEqual(
        [...cls.replicated].sort()
      );
      // None of the declared server-only fields may be @type-decorated.
      for (const serverField of cls.serverOnly) {
        expect(
          emittedReplicated,
          `${cls.className}.${serverField} must not be replicated`
        ).not.toContain(serverField);
      }
    }
  });

  it('buildColyseusAuthorityGraph marks server registries server_only and keeps them off the client', () => {
    const { result, composition } = compileWorld();
    const graph = buildColyseusAuthorityGraph(result, composition);
    const reachable = graph.reachableFromClient();
    const abilitySym = graph.get(
      AuthoritySymbolGraph.keyFor('<colyseus-emit>', 'ABILITY_REGISTRY')
    );
    expect(abilitySym?.tier).toBe('server_only');
    expect(reachable.has(abilitySym!.key)).toBe(false);
  });
});
