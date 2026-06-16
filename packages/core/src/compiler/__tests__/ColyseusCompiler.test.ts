import { describe, it, expect } from 'vitest';
import { ColyseusCompiler } from '../ColyseusCompiler';
import { createTestCompilerToken } from '../CompilerBase';
import { MMO_EVENT_RECEIPT_SCHEMA } from '../../trust/GameEventReceipt';
import type {
  HoloComposition,
  HoloNPC,
  HoloSpawnPoint,
  HoloWorldChunk,
  HoloAbility,
  HoloLootTable,
  HoloObjectTrait,
} from '../../parser/HoloCompositionTypes';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

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

function npc(name: string, props: Record<string, unknown>): HoloNPC {
  return {
    type: 'NPC',
    name,
    npcType: (props.npcType as string) ?? 'npc',
    properties: Object.entries(props)
      .filter(([k]) => k !== 'npcType')
      .map(([key, value]) => ({ type: 'NPCProperty', key, value })),
    behaviors: [],
  } as unknown as HoloNPC;
}

function spawn(name: string, x: number, y: number, z: number, faction = 'none'): HoloSpawnPoint {
  return {
    type: 'SpawnPoint',
    name,
    faction,
    maxCount: 4,
    position: { type: 'Position', x, y, z } as never,
    properties: {},
  } as unknown as HoloSpawnPoint;
}

function trait(name: string, config: Record<string, unknown>): HoloObjectTrait {
  return { type: 'ObjectTrait', name, config, args: [] } as unknown as HoloObjectTrait;
}

const token = createTestCompilerToken();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ColyseusCompiler — typed MMO field consumption (P0.0)', () => {
  it('emits NpcState entities from typed composition.npcs (not just trait-scan)', () => {
    const compiler = new ColyseusCompiler();
    const result = compiler.compile(
      comp({
        npcs: [
          npc('goblin_01', { x: 10, y: 0, z: 5, hp: 50, faction: 'ironveil', brain: 'goblin_brain' }),
          npc('boss_drake', { x: 0, y: 0, z: 0, hp: 5000, faction: 'wyrm', npcType: 'boss' }),
        ],
      }),
      token
    );
    expect(result.success).toBe(true);
    expect(result.code).toContain('class NpcState extends Schema');
    // both NPCs seeded
    expect(result.code).toContain("npc_goblin_01.id = 'goblin_01'");
    expect(result.code).toContain('npc_goblin_01.hp = 50');
    expect(result.code).toContain("npc_goblin_01.faction = 'ironveil'");
    expect(result.code).toContain("npc_boss_drake.type = 'boss'");
    expect(result.code).toContain('npc_boss_drake.hp = 5000');
  });

  it('lowers NPC brain reference → NpcState.brainType + initializeBrain() (P0.6)', () => {
    const compiler = new ColyseusCompiler();
    const result = compiler.compile(
      comp({ npcs: [npc('goblin_01', { brain: 'goblin_brain' })] }),
      token
    );
    expect(result.code).toContain("@type('string') brainType: string = ''");
    expect(result.code).toContain("npc_goblin_01.brainType = 'goblin_brain'");
    expect(result.code).toContain('this.initializeBrain(npc_goblin_01)');
    expect(result.code).toContain('protected initializeBrain(npc: NpcState)');
    expect(result.code).toContain('protected tickNpcBrain(npc: NpcState)');
  });

  it('emits SpawnPointState from typed composition.spawnPoints', () => {
    const compiler = new ColyseusCompiler();
    const result = compiler.compile(
      comp({ spawnPoints: [spawn('alliance_camp', 100, 0, -50, 'alliance')] }),
      token
    );
    expect(result.code).toContain('class SpawnPointState extends Schema');
    expect(result.code).toContain("spawn_alliance_camp.id = 'alliance_camp'");
    expect(result.code).toContain('spawn_alliance_camp.x = 100');
    expect(result.code).toContain("spawn_alliance_camp.faction = 'alliance'");
  });
});

describe('ColyseusCompiler — server-authoritative movement validation (P0.3)', () => {
  it('replaces blind client-position trust with a max-speed check', () => {
    const compiler = new ColyseusCompiler();
    const result = compiler.compile(comp({}), token);
    // No more unconditional assignment of client position
    expect(result.code).not.toContain('if (typeof data.x === \'number\') player.x = data.x;');
    // Real validation present
    expect(result.code).toContain('protected handleMove(client: Client, player: PlayerState');
    expect(result.code).toContain('const maxDist = MAX_MOVE_SPEED * (elapsedTicks / TICK_RATE)');
    expect(result.code).toContain('if (dist <= maxDist)');
    expect(result.code).toContain("client.send('reconcile'");
    expect(result.code).toContain('player.lastMoveTick = this.state.tickCount');
  });

  it('reads max_speed from a @movement_contract trait', () => {
    const compiler = new ColyseusCompiler();
    const result = compiler.compile(
      comp({ traits: [trait('movement_contract', { max_speed: 8 })] }),
      token
    );
    expect(result.code).toContain('export const MAX_MOVE_SPEED = 8;');
  });

  it('defaults max_speed to 10 when no movement contract present', () => {
    const compiler = new ColyseusCompiler();
    const result = compiler.compile(comp({}), token);
    expect(result.code).toContain('export const MAX_MOVE_SPEED = 10;');
  });

  it('emits a movement_reject receipt on rejected moves', () => {
    const compiler = new ColyseusCompiler();
    const result = compiler.compile(comp({}), token);
    expect(result.code).toContain("kind: 'movement_reject'");
    expect(result.code).toContain('validated: false');
    expect(result.code).toContain('this.recordGameEvent(');
  });
});

describe('ColyseusCompiler — canonical receipts (P0.4)', () => {
  it('stamps the canonical MMO event receipt schema', () => {
    const compiler = new ColyseusCompiler();
    const result = compiler.compile(comp({}), token);
    expect(MMO_EVENT_RECEIPT_SCHEMA).toBe('holoscript.mmo-event-receipt.v1');
    expect(result.code).toContain(`export const GAME_EVENT_RECEIPT_SCHEMA = '${MMO_EVENT_RECEIPT_SCHEMA}';`);
    expect(result.code).toContain('protected recordGameEvent(ev: {');
    expect(result.code).toContain("status: ev.validated ? 'success' : 'denied'");
    expect(result.code).toContain('protected onGameEventReceipt(receipt: Record<string, unknown>)');
  });
});

describe('ColyseusCompiler — world chunk manifest (P0.5)', () => {
  it('lowers composition.worldChunks → CHUNK_MANIFEST export', () => {
    const chunk: HoloWorldChunk = {
      type: 'WorldChunk',
      name: 'dockside',
      priority: 'high',
      biome: 'coastal_urban',
      lodDistances: [50, 150, 400],
      npcRoster: ['merchant_alva'],
      streaming: { load_radius: 300, unload_radius: 500 },
      properties: {},
    } as unknown as HoloWorldChunk;
    const compiler = new ColyseusCompiler();
    const result = compiler.compile(comp({ worldChunks: [chunk] }), token);
    expect(result.code).toContain('export const CHUNK_MANIFEST =');
    expect(result.chunkManifest).toHaveLength(1);
    expect(result.chunkManifest[0]).toMatchObject({
      name: 'dockside',
      priority: 'high',
      biome: 'coastal_urban',
      lodDistances: [50, 150, 400],
      npcRoster: ['merchant_alva'],
    });
    expect(result.code).toContain('"name": "dockside"');
  });
});

describe('ColyseusCompiler — tick model (P0.2)', () => {
  it('emits a canonical tick rate + deterministic RNG seed', () => {
    const compiler = new ColyseusCompiler();
    const result = compiler.compile(comp({ name: 'FrontierMMO' }), token);
    expect(result.code).toContain('export const TICK_RATE = 20;');
    expect(result.code).toMatch(/export const RNG_SEED = \d+;/);
    expect(result.code).toContain('this.state.tickCount = (this.state.tickCount + 1) >>> 0;');
    expect(result.code).toContain('protected nextRandom(): number');
  });

  it('RNG seed is deterministic for the same world name', () => {
    const a = new ColyseusCompiler().compile(comp({ name: 'Frontier' }), token).code;
    const b = new ColyseusCompiler().compile(comp({ name: 'Frontier' }), token).code;
    const c = new ColyseusCompiler().compile(comp({ name: 'Different' }), token).code;
    const seed = (s: string) => s.match(/RNG_SEED = (\d+);/)?.[1];
    expect(seed(a)).toBe(seed(b));
    expect(seed(a)).not.toBe(seed(c));
  });

  it('reads tick_rate from a @tick_rate trait', () => {
    const compiler = new ColyseusCompiler();
    const result = compiler.compile(comp({ traits: [trait('tick_rate', { hz: 30 })] }), token);
    expect(result.code).toContain('export const TICK_RATE = 30;');
  });
});

describe('ColyseusCompiler — ability registry (P0.1 consumption)', () => {
  it('lowers typed composition.abilities → ABILITY_REGISTRY', () => {
    const ability: HoloAbility = {
      type: 'Ability',
      name: 'fireball',
      abilityType: 'spell',
      stats: { type: 'AbilityStats', cooldown: 6, manaCost: 40, range: 30, castTime: 1.5 },
      effects: { type: 'AbilityEffects' },
    } as unknown as HoloAbility;
    const compiler = new ColyseusCompiler();
    const result = compiler.compile(comp({ abilities: [ability] }), token);
    expect(result.code).toContain('export const ABILITY_REGISTRY');
    expect(result.abilities).toHaveLength(1);
    expect(result.abilities[0]).toMatchObject({
      name: 'fireball',
      cooldownMs: 6000,
      manaCost: 40,
      range: 30,
      castTimeMs: 1500,
    });
  });
});

describe('ColyseusCompiler — server-authoritative ability cast (P1.0/P1.7)', () => {
  const ability: HoloAbility = {
    type: 'Ability',
    name: 'fireball',
    abilityType: 'spell',
    stats: { type: 'AbilityStats', cooldown: 6, manaCost: 40, range: 30, castTime: 1.5 },
    effects: { type: 'AbilityEffects' },
  } as unknown as HoloAbility;

  it('emits handleCast gating GCD, cooldown, mana, and range against ABILITY_REGISTRY', () => {
    const result = new ColyseusCompiler().compile(comp({ abilities: [ability] }), token);
    expect(result.code).toContain('protected handleCast(client: Client, player: PlayerState');
    expect(result.code).toContain('const cfg = ABILITY_REGISTRY[abilityId];');
    expect(result.code).toContain("if (this.state.tickCount < player.gcdUntilTick) { reject('gcd_active'); return; }");
    expect(result.code).toContain("if (this.state.tickCount - last < cdTicks) { reject('on_cooldown'); return; }");
    expect(result.code).toContain("if (player.mana < cfg.manaCost) { reject('insufficient_mana'); return; }");
    expect(result.code).toContain("reject('out_of_range')");
    // cast wired into onMessage + receipted both ways
    expect(result.code).toContain("case 'cast': {");
    expect(result.code).toContain("kind: 'ability_cast'");
    expect(result.code).toContain('player.gcdUntilTick = this.state.tickCount + Math.ceil');
    // mana is a synced field
    expect(result.code).toContain("@type('number') mana: number = 100;");
  });

  it('omits the cast handler when no abilities exist', () => {
    const result = new ColyseusCompiler().compile(comp({}), token);
    expect(result.code).not.toContain('protected handleCast');
    expect(result.code).not.toContain("case 'cast'");
  });
});

describe('ColyseusCompiler — server-authoritative loot (P1.6)', () => {
  it('lowers loot_table → LOOT_TABLES + deterministic rollLoot()', () => {
    const table: HoloLootTable = {
      type: 'LootTable',
      name: 'goblin_drops',
      entries: [
        { type: 'LootEntry', id: 'coin', itemId: 'gold_coin', weight: 60, qty: '1..5', properties: {} },
        { type: 'LootEntry', id: 'shard', itemId: 'iron_shard', weight: 25, rarity: 'uncommon', properties: {} },
        { type: 'LootEntry', id: 'nothing', weight: 15, properties: {} },
      ],
      guaranteed: { goblin_ear: 1 },
      properties: {},
    } as unknown as HoloLootTable;
    const result = new ColyseusCompiler().compile(comp({ lootTables: [table] }), token);
    expect(result.code).toContain('export const LOOT_TABLES');
    expect(result.code).toContain('protected rollLoot(tableName: string)');
    expect(result.code).toContain('this.nextRandom() * total');
    expect(result.lootTables).toHaveLength(1);
    expect(result.lootTables[0].name).toBe('goblin_drops');
    const entries = result.lootTables[0].entries;
    expect(entries.find((e) => e.itemId === 'gold_coin')?.weight).toBe(60);
    // weight-only "nothing" entry has empty itemId → rollLoot drops nothing
    expect(entries.find((e) => e.itemId === '')?.weight).toBe(15);
    expect(result.code).toContain('"goblin_ear": 1');
  });
});

describe('ColyseusCompiler — area-of-interest (P1.1)', () => {
  it('emits AOI_RADIUS + interest-query helpers', () => {
    const result = new ColyseusCompiler().compile(
      comp({ npcs: [npc('g1', { hp: 10 })], traits: [trait('aoi_bubble', { radius: 80 })] }),
      token
    );
    expect(result.code).toContain('export const AOI_RADIUS = 80;');
    expect(result.aoiRadius).toBe(80);
    expect(result.code).toContain('protected playersInAOI(origin: PlayerState');
    expect(result.code).toContain('protected npcsInAOI(origin: PlayerState');
  });

  it('defaults AOI_RADIUS to 50 with no @aoi_bubble', () => {
    const result = new ColyseusCompiler().compile(comp({}), token);
    expect(result.code).toContain('export const AOI_RADIUS = 50;');
    expect(result.aoiRadius).toBe(50);
  });
});

describe('ColyseusCompiler — back-compat (legacy trait-scan still works)', () => {
  it('still extracts @npc / @spawn_point traited objects', () => {
    const compiler = new ColyseusCompiler();
    const result = compiler.compile(
      comp({
        objects: [
          {
            type: 'Object',
            name: 'old_style_npc',
            traits: [{ type: 'ObjectTrait', name: 'npc', config: {}, args: [] }],
            properties: [{ type: 'Property', key: 'hp', value: 200 }],
          } as never,
        ],
      }),
      token
    );
    expect(result.success).toBe(true);
    expect(result.code).toContain("npc_old_style_npc.id = 'old_style_npc'");
    expect(result.code).toContain('npc_old_style_npc.hp = 200');
  });
});

describe('ColyseusCompiler — NPC brain runtime (P1.3/P1.4/P1.5)', () => {
  const brainSource = `
    brain GoblinBrain : @behavior_tree {
      @personality aggressive
      @flee_threshold 0.2
      state idle {
        transition to combat @when { hp > 0.5 }
      }
      state combat {
        transition to flee @when { hp < 0.2 }
      }
    }
    brain SageBrain : @neural {
      @personality wise
      state idle { }
    }
  `;
  const holoSource = `
    composition "BrainWorld" {
      import "./brains.hsplus"
      npc "goblin_01" { hp: 50 faction: "ironveil" brain_ref: "GoblinBrain" }
      npc "sage_01" { hp: 100 faction: "neutral" brain_ref: "SageBrain" }
    }
  `;
  const readFile = async (abs: string): Promise<string> => {
    if (abs.endsWith('brains.hsplus')) return brainSource;
    throw new Error(`not found: ${abs}`);
  };

  it('lowers brain FSM into BRAIN_REGISTRY with parsed hp guards (P1.3)', async () => {
    const result = await new ColyseusCompiler().compileSource(
      holoSource, '/w/brain.holo', token, { readFile, baseDir: '/w' }
    );
    expect(result.success).toBe(true);
    expect(result.brains).toHaveLength(2);
    const goblin = result.brains.find((b) => b.name === 'GoblinBrain');
    expect(goblin?.fleeThreshold).toBe(0.2);
    expect(goblin?.isLLM).toBe(false);
    expect(goblin?.initialState).toBe('idle');
    const idle = goblin?.states.find((s) => s.name === 'idle');
    expect(idle?.transitions[0]).toEqual({ to: 'combat', guard: { field: 'hp', op: '>', value: 0.5 } });
    const combat = goblin?.states.find((s) => s.name === 'combat');
    expect(combat?.transitions[0]).toEqual({ to: 'flee', guard: { field: 'hp', op: '<', value: 0.2 } });
    // generated tick logic
    expect(result.code).toContain('export const BRAIN_REGISTRY');
    expect(result.code).toContain('export const LLM_BUDGET_TICKS = 200;');
    expect(result.code).toContain('protected tickNpcBrain(npc: NpcState)');
    expect(result.code).toContain('if (brain.fleeThreshold > 0 && hpFrac < brain.fleeThreshold)');
    expect(result.code).toContain('protected onBrainHydrate(npc: NpcState)');
    expect(result.code).toContain('protected onBrainMerge(npc: NpcState)');
  });

  it('flags neural brains as LLM and gates LLM calls by LOD + budget (P1.4)', async () => {
    const result = await new ColyseusCompiler().compileSource(
      holoSource, '/w/brain.holo', token, { readFile, baseDir: '/w' }
    );
    const sage = result.brains.find((b) => b.name === 'SageBrain');
    expect(sage?.isLLM).toBe(true);
    expect(result.code).toContain('brain.isLLM && this.npcIsNearPlayer(npc)');
    expect(result.code).toContain('npc.brainTick - npc.lastLlmTick >= LLM_BUDGET_TICKS');
    expect(result.code).toContain('void this.decideLLM(npc)');
  });

  it('resolves the Jetson endpoint via env var, never a hardcoded IP (W.733/F.106)', async () => {
    const result = await new ColyseusCompiler().compileSource(
      holoSource, '/w/brain.holo', token, { readFile, baseDir: '/w' }
    );
    expect(result.code).toContain("export const JETSON_OLLAMA_ENV = 'JETSON_OLLAMA_URL';");
    expect(result.code).toContain('const base = process.env[JETSON_OLLAMA_ENV];');
    expect(result.code).toContain('if (!base) return;'); // cloud-free by default
    // No literal private IPs leaked into the generated server
    expect(result.code).not.toMatch(/\b192\.168\.\d{1,3}\.\d{1,3}\b/);
    expect(result.code).not.toMatch(/\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
  });

  it('generated brain-world server is valid TypeScript (W.685)', async () => {
    const ts = await import('typescript');
    const result = await new ColyseusCompiler().compileSource(
      holoSource, '/w/brain.holo', token, { readFile, baseDir: '/w' }
    );
    const out = ts.transpileModule(result.code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
      },
      reportDiagnostics: true,
    });
    const errors = (out.diagnostics ?? [])
      .filter((d) => d.category === ts.DiagnosticCategory.Error)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    expect(errors).toEqual([]);
  });

  it('generated FSM actually transitions and flees at runtime (W.685 deep)', async () => {
    const ts = await import('typescript');
    const result = await new ColyseusCompiler().compileSource(
      holoSource, '/w/brain.holo', token, { readFile, baseDir: '/w' }
    );
    // Transpile to CommonJS and evaluate with stubbed Colyseus deps.
    const js = ts.transpileModule(result.code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        experimentalDecorators: true,
      },
    }).outputText;

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
        setSimulationInterval() { /* capture skipped — we drive ticks directly */ }
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
    const exports = moduleObj.exports;

    const RoomClass = exports[result.roomClassName] as new () => Record<string, unknown> & {
      onCreate: (o: unknown) => void;
      state: { npcs: Map<string, Record<string, unknown>> };
      tickNpcBrain: (npc: Record<string, unknown>) => void;
    };
    const room = new RoomClass();
    room.onCreate({});

    const goblin = room.state.npcs.get('goblin_01')!;
    expect(goblin.brainState).toBe('idle');
    expect(goblin.maxHp).toBe(50);

    // hp 50/50 = 1.0 > 0.5 → idle transitions to combat
    goblin.hp = 50;
    room.tickNpcBrain(goblin);
    expect(goblin.brainState).toBe('combat');

    // drop hp below flee_threshold (0.2) → universal flee reflex fires
    goblin.hp = 5; // 5/50 = 0.1 < 0.2
    room.tickNpcBrain(goblin);
    expect(goblin.brainState).toBe('flee');
  });
});

describe('ColyseusCompiler — generated output is valid TypeScript (W.685)', () => {
  it('transpiles a fully-featured world without syntax errors', async () => {
    const ts = await import('typescript');
    const ability: HoloAbility = {
      type: 'Ability',
      name: 'fireball',
      abilityType: 'spell',
      stats: { type: 'AbilityStats', cooldown: 6, manaCost: 40, range: 30 },
      effects: { type: 'AbilityEffects' },
    } as unknown as HoloAbility;
    const table: HoloLootTable = {
      type: 'LootTable',
      name: 'goblin_drops',
      entries: [
        { type: 'LootEntry', id: 'coin', itemId: 'gold_coin', weight: 60, qty: 3, properties: {} },
        { type: 'LootEntry', id: 'nothing', weight: 15, properties: {} },
      ],
      guaranteed: { goblin_ear: 1 },
      properties: {},
    } as unknown as HoloLootTable;
    const chunk: HoloWorldChunk = {
      type: 'WorldChunk',
      name: 'dockside',
      priority: 'high',
      lodDistances: [50, 150],
      properties: {},
    } as unknown as HoloWorldChunk;

    const result = new ColyseusCompiler().compile(
      comp({
        name: 'FrontierMMO',
        npcs: [npc('goblin_01', { x: 5, y: 0, z: 5, hp: 50, faction: 'ironveil', brain: 'goblin_brain' })],
        spawnPoints: [spawn('camp', 0, 0, 0, 'alliance')],
        abilities: [ability],
        lootTables: [table],
        worldChunks: [chunk],
        traits: [trait('movement_contract', { max_speed: 8 }), trait('aoi_bubble', { radius: 60 })],
      }),
      token
    );
    expect(result.success).toBe(true);

    const out = ts.transpileModule(result.code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        isolatedModules: false,
      },
      reportDiagnostics: true,
    });
    const syntaxErrors = (out.diagnostics ?? []).filter(
      (d) => d.category === ts.DiagnosticCategory.Error
    );
    const messages = syntaxErrors.map((d) =>
      ts.flattenDiagnosticMessageText(d.messageText, '\n')
    );
    expect(messages).toEqual([]);
    expect(out.outputText.length).toBeGreaterThan(0);
  });
});

describe('ColyseusCompiler — async import resolution (P0.0b / compileSource)', () => {
  it('resolves .hs ability imports and .hsplus brain imports', async () => {
    const holoSource = `
      composition "RaidWorld" {
        import "./abilities.hs"
        import "./goblin.hsplus"
        npc "goblin_01" {
          hp: 50
          faction: "ironveil"
          brain_ref: "GoblinBrain"
        }
      }
    `;
    const files: Record<string, string> = {
      'abilities.hs': `
        ability shadow_bolt {
          @cooldown 4
          @mana_cost 25
          @range 20
        }
      `,
      'goblin.hsplus': `
        brain GoblinBrain {
          @behavior_tree
        }
      `,
    };
    const readFile = async (abs: string): Promise<string> => {
      const key = Object.keys(files).find((f) => abs.endsWith(f));
      if (!key) throw new Error(`not found: ${abs}`);
      return files[key];
    };

    const compiler = new ColyseusCompiler();
    const result = await compiler.compileSource(holoSource, '/world/raid.holo', token, {
      readFile,
      baseDir: '/world',
    });

    expect(result.success).toBe(true);
    // Imported .hs ability surfaced into the registry
    const abilityNames = result.abilities.map((a) => a.name);
    expect(abilityNames).toContain('shadow_bolt');
    const sb = result.abilities.find((a) => a.name === 'shadow_bolt');
    expect(sb?.cooldownMs).toBe(4000);
    expect(sb?.manaCost).toBe(25);
    expect(sb?.range).toBe(20);
    // Brain reference resolved against imported brain (no missing-brain warning)
    expect(result.warnings.join(' ')).not.toContain("not found in imported");
  });

  it('warns (does not throw) when an import cannot be read', async () => {
    const holoSource = `
      composition "BrokenWorld" {
        import "./missing.hs"
        npc "dummy" { hp: 10 }
      }
    `;
    const compiler = new ColyseusCompiler();
    const result = await compiler.compileSource(holoSource, '/world/broken.holo', token, {
      readFile: async () => {
        throw new Error('ENOENT');
      },
    });
    expect(result.success).toBe(true);
    expect(result.warnings.some((w) => w.includes('missing.hs'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// P1.9 — @verbal_fingerprint + @autonomous_agenda wiring into decideLLM prompt
// ---------------------------------------------------------------------------

describe('ColyseusCompiler — P1.9: verbal_fingerprint + autonomous_agenda', () => {
  const token = createTestCompilerToken();

  it('bakes @verbal_fingerprint tone + forbidden/required phrases into BRAIN_REGISTRY', async () => {
    const hsPlusSource = `
      brain WiseKeeperBrain {
        @behavior_tree
        @personality "wise_mentor"
        @verbal_fingerprint {
          tone: "archaic"
          forbidden_phrases: ["whatever", "like totally"]
          required_phrases: ["Hearken", "verily"]
        }
        state idle { }
      }
    `;
    const compiler = new ColyseusCompiler();
    (compiler as unknown as { importedBrainDecls: unknown[] }).importedBrainDecls = [];
    await (compiler as unknown as { ingestBrains: (src: string, file: string, w: string[]) => Promise<void> })
      .ingestBrains(hsPlusSource, 'keeper.hsplus', []);
    const result = compiler.compile(
      comp({ npcs: [npc('keeper_01', { hp: 100, brain: 'WiseKeeperBrain' })] }),
      token
    );

    expect(result.success).toBe(true);
    expect(result.brains).toHaveLength(1);
    const brain = result.brains[0]!;
    expect(brain.verbalFingerprint).not.toBeNull();
    expect(brain.verbalFingerprint?.tone).toBe('archaic');
    expect(brain.verbalFingerprint?.forbiddenPhrases).toContain('whatever');
    expect(brain.verbalFingerprint?.requiredPhrases).toContain('Hearken');

    // Confirm BRAIN_REGISTRY in the emitted code carries the fingerprint
    expect(result.code).toContain('"tone": "archaic"');
    expect(result.code).toContain('"whatever"');
    expect(result.code).toContain('"Hearken"');
  });

  it('bakes @autonomous_agenda goals into BRAIN_REGISTRY', async () => {
    const hsPlusSource = `
      brain HunterBrain {
        @behavior_tree
        @personality "predator"
        @autonomous_agenda {
          goals: ["hunt prey", "patrol territory", "avoid bright light"]
        }
        state idle { }
      }
    `;
    const compiler = new ColyseusCompiler();
    (compiler as unknown as { importedBrainDecls: unknown[] }).importedBrainDecls = [];
    await (compiler as unknown as { ingestBrains: (src: string, file: string, w: string[]) => Promise<void> })
      .ingestBrains(hsPlusSource, 'hunter.hsplus', []);
    const result = compiler.compile(
      comp({ npcs: [npc('hunter_01', { hp: 80, brain: 'HunterBrain' })] }),
      token
    );

    expect(result.success).toBe(true);
    const brain = result.brains[0]!;
    expect(brain.autonomousAgenda).not.toBeNull();
    expect(brain.autonomousAgenda?.goals).toContain('hunt prey');
    expect(brain.autonomousAgenda?.goals).toContain('avoid bright light');

    // Goals appear in the emitted BRAIN_REGISTRY
    expect(result.code).toContain('"hunt prey"');
    expect(result.code).toContain('"patrol territory"');
  });

  it('emits null for both fields when neither trait is declared', async () => {
    const hsPlusSource = `
      brain SimpleBrain {
        @behavior_tree
        @personality "aggressive"
        state idle { }
      }
    `;
    const compiler = new ColyseusCompiler();
    (compiler as unknown as { importedBrainDecls: unknown[] }).importedBrainDecls = [];
    await (compiler as unknown as { ingestBrains: (src: string, file: string, w: string[]) => Promise<void> })
      .ingestBrains(hsPlusSource, 'simple.hsplus', []);
    const result = compiler.compile(
      comp({ npcs: [npc('grunt_01', { hp: 60, brain: 'SimpleBrain' })] }),
      token
    );

    expect(result.success).toBe(true);
    const brain = result.brains[0]!;
    expect(brain.verbalFingerprint).toBeNull();
    expect(brain.autonomousAgenda).toBeNull();
  });

  it('decideLLM system prompt includes tone, forbidden phrases, required phrases, and goals', async () => {
    const result = comp({
      npcs: [npc('sage_01', { hp: 100, brain: 'SageBrain' })],
    });
    const compiler = new ColyseusCompiler();
    const hsPlusSource = `
      brain SageBrain {
        @behavior_tree
        @personality "wise"
        @verbal_fingerprint {
          tone: "cryptic"
          forbidden_phrases: ["easy", "simple"]
          required_phrases: ["the path"]
        }
        @autonomous_agenda {
          goals: ["guide seekers", "guard the sanctum"]
        }
        state idle { }
      }
    `;
    (compiler as unknown as { importedBrainDecls: unknown[] }).importedBrainDecls = [];
    await (compiler as unknown as { ingestBrains: (src: string, file: string, w: string[]) => Promise<void> })
      .ingestBrains(hsPlusSource, 'sage.hsplus', []);
    const out = compiler.compile(result, token);

    expect(out.success).toBe(true);
    // decideLLM should include the conditional prompt-building lines
    expect(out.code).toContain('brain.verbalFingerprint');
    expect(out.code).toContain('brain.autonomousAgenda');
    expect(out.code).toContain('forbiddenPhrases');
    expect(out.code).toContain('requiredPhrases');
    expect(out.code).toContain('goals.join');
    // The fingerprint data is present in the registry
    expect(out.code).toContain('"tone": "cryptic"');
    expect(out.code).toContain('"guide seekers"');
  });
});

// ---------------------------------------------------------------------------
// P1.8 — damage_formula lowering → rollDamage_<AbilityName>() emission
// ---------------------------------------------------------------------------

describe('ColyseusCompiler — P1.8: damage_formula lowering → rollDamage_*()', () => {
  // NOTE: The .hs property parser reads one value token per key.
  // Multi-token expressions (e.g. "0.85 * casterSpellPower") are not yet
  // supported at the parse level — that is a round-3 symbol-table concern.
  // Scaling values must therefore be single-token at this stage.
  const abilityWithFormula = `
    ability fireball {
      @cooldown 6
      @mana_cost 40
      @range 30
      @damage_type fire
      damage_formula {
        base: 50
        scaling: casterSpellPower
        crit_multiplier: 2.0
        crit_chance: 0.15
        resist_school: fire
      }
    }
  `;

  const abilityNoFormula = `
    ability shield_bash {
      @cooldown 2
      @mana_cost 10
      @damage_type physical
    }
  `;

  async function compileWithAbilities(src: string): Promise<ReturnType<ColyseusCompiler['compile']>> {
    const holoSrc = `
      composition "BattleArena" {
        import "./spells.hs"
        npc "dummy" { hp: 100 }
      }
    `;
    const readFile = async (abs: string): Promise<string> => {
      if (abs.endsWith('spells.hs')) return src;
      throw new Error(`not found: ${abs}`);
    };
    return new ColyseusCompiler().compileSource(holoSrc, '/w/battle.holo', token, {
      readFile,
      baseDir: '/w',
    });
  }

  it('emits rollDamage_<AbilityName>() for abilities with a damage_formula block', async () => {
    const result = await compileWithAbilities(abilityWithFormula);
    expect(result.success).toBe(true);

    // (a) compiler result carries the parsed formula
    const fireball = result.abilities.find((a) => a.name === 'fireball');
    expect(fireball?.damageFormula).not.toBeNull();
    expect(fireball?.damageFormula?.base).toBe(50);
    expect(fireball?.damageFormula?.critMultiplier).toBe(2.0);
    expect(fireball?.damageFormula?.critChance).toBe('0.15');
    expect(fireball?.damageFormula?.resistSchool).toBe('fire');

    // (b) rollDamage_fireball() is emitted in the generated code
    expect(result.code).toContain('protected rollDamage_fireball(');
    expect(result.code).toContain('casterSpellPower: number,');
    expect(result.code).toContain('casterAttackPower: number,');
    expect(result.code).toContain('targetResist = 0,');

    // (c) formula fields are reflected in the emitted body
    expect(result.code).toContain('const base = 50;');
    // scaling is emitted verbatim from the parsed string value
    expect(result.code).toContain('const scaling = casterSpellPower;');
    expect(result.code).toContain('const critChance = Math.max(0, Math.min(1, 0.15));');
    expect(result.code).toContain('const isCrit = this.nextRandom() < critChance;');
    expect(result.code).toContain('const critMult = isCrit ? 2 : 1;');
    // resist_school=fire → 1-resist expression emitted
    expect(result.code).toContain('(1 - Math.max(0, Math.min(1, targetResist)))');
    expect(result.code).toContain('return Math.max(0, Math.round(raw));');
  });

  it('sets damageFormula: null for abilities without a damage_formula block', async () => {
    const result = await compileWithAbilities(abilityNoFormula);
    expect(result.success).toBe(true);
    const shieldBash = result.abilities.find((a) => a.name === 'shield_bash');
    expect(shieldBash).toBeDefined();
    expect(shieldBash?.damageFormula).toBeNull();
    // no rollDamage_ function emitted when formula is absent
    expect(result.code).not.toContain('protected rollDamage_shield_bash(');
  });

  it('emits rollDamage_* only for abilities with formula; others get null in ABILITY_REGISTRY', async () => {
    const result = await compileWithAbilities(`${abilityWithFormula}\n${abilityNoFormula}`);
    expect(result.success).toBe(true);
    expect(result.code).toContain('protected rollDamage_fireball(');
    expect(result.code).not.toContain('protected rollDamage_shield_bash(');
    // ABILITY_REGISTRY encodes damageFormula for fireball and null for shield_bash
    expect(result.code).toContain('"damageFormula":');
    expect(result.code).toContain('"resistSchool": "fire"');
  });

  it('emits resist=1 (no school attenuation) when resist_school is absent', async () => {
    const noResistAbility = `
      ability soul_drain {
        @cooldown 8
        damage_formula {
          base: 30
          scaling: casterSpellPower
          crit_multiplier: 1.5
          crit_chance: 0.05
        }
      }
    `;
    const result = await compileWithAbilities(noResistAbility);
    expect(result.success).toBe(true);
    expect(result.code).toContain('protected rollDamage_soul_drain(');
    // No resist_school → resist expression is literal `1`
    expect(result.code).toContain('const resist = 1;');
  });

  it('generated rollDamage code is valid TypeScript (W.685)', async () => {
    const ts = await import('typescript');
    const result = await compileWithAbilities(abilityWithFormula);
    expect(result.success).toBe(true);
    const out = ts.transpileModule(result.code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
      },
      reportDiagnostics: true,
    });
    const errors = (out.diagnostics ?? [])
      .filter((d) => d.category === ts.DiagnosticCategory.Error)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    expect(errors).toEqual([]);
  });

  it('ability name with special chars is sanitized in function name', async () => {
    const weirdName = `
      ability "fire-bolt" {
        @cooldown 1
        damage_formula {
          base: 10
          scaling: 0
          crit_multiplier: 1.5
          crit_chance: 0.05
        }
      }
    `;
    const result = await compileWithAbilities(weirdName);
    expect(result.success).toBe(true);
    // hyphen sanitized to underscore
    expect(result.code).toMatch(/protected rollDamage_fire_bolt\(/);
  });
});
