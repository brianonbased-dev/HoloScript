import { describe, it, expect } from 'vitest';
import { ColyseusCompiler } from '../ColyseusCompiler';
import { createTestCompilerToken } from '../CompilerBase';
import type { HoloComposition, HoloNPC, HoloWorldLayer } from '../../parser/HoloCompositionTypes';

const token = createTestCompilerToken();

function comp(partial: Partial<HoloComposition>): HoloComposition {
  return {
    type: 'Composition',
    name: 'PhaseWorld',
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

function npc(name: string): HoloNPC {
  return {
    type: 'NPC',
    name,
    npcType: 'npc',
    properties: [{ type: 'NPCProperty', key: 'hp', value: 100 }],
    behaviors: [],
  } as unknown as HoloNPC;
}

function quest(name: string): unknown {
  return { type: 'Quest', name, objectives: [], rewards: [], branches: [], prerequisites: [] };
}

function layer(
  name: string,
  questId: string,
  mustBeCompleted: boolean,
  npcs: string[]
): HoloWorldLayer {
  return {
    type: 'WorldLayer',
    name,
    predicate: { type: 'PhasePredicate', kind: 'quest_flag', questId, mustBeCompleted },
    npcs,
    objects: [],
    properties: {},
  } as unknown as HoloWorldLayer;
}

const phaseWorld = comp({
  quests: [quest('main_chapter_1')] as never,
  npcs: [npc('restored_keeper'), npc('abandoned_keeper')],
  worldLayers: [
    layer('post_awakening', 'main_chapter_1', true, ['restored_keeper']),
    layer('pre_awakening', 'main_chapter_1', false, ['abandoned_keeper']),
  ],
});

function evalServer(js: string): Record<string, unknown> {
  const noop = () => () => undefined;
  const schemaStub = {
    Schema: class {},
    type: noop,
    MapSchema: class extends Map {},
    ArraySchema: class extends Array {},
  };
  const colyseusStub = {
    Room: class {
      state: unknown;
      setState(s: unknown) {
        this.state = s;
      }
      setSimulationInterval() {}
      onMessage() {}
      broadcast() {}
    },
    Client: class {},
    Server: class {
      define() {}
      listen() {
        return Promise.resolve();
      }
    },
  };
  const require_ = (id: string): unknown => {
    if (id === '@colyseus/schema') return schemaStub;
    if (id === 'colyseus') return colyseusStub;
    throw new Error(`unexpected require: ${id}`);
  };
  const mod = { exports: {} as Record<string, unknown> };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('exports', 'require', 'module', js)(mod.exports, require_, mod);
  return mod.exports;
}

describe('WorldLayer phasing (P2.4) — lowering', () => {
  it('emits PHASE_REGISTRY + phaseEval / handleQuestComplete / npcVisibleTo', () => {
    const result = new ColyseusCompiler().compile(phaseWorld, token);
    expect(result.success).toBe(true);
    expect(result.worldLayers).toHaveLength(2);
    expect(result.code).toContain('export const PHASE_REGISTRY');
    expect(result.code).toContain('protected phaseEval(player: PlayerState)');
    expect(result.code).toContain(
      'protected handleQuestComplete(client: Client, player: PlayerState'
    );
    expect(result.code).toContain('protected npcVisibleTo(player: PlayerState, npcId: string)');
    expect(result.code).toContain("case 'quest_complete': {");
    expect(result.code).toContain('questFlags: Set<string> = new Set();');
    expect(result.code).toContain('activePhases: Set<string> = new Set();');
  });

  it('COMPILE ERROR: a world_layer referencing an undeclared quest fails the build', () => {
    const bad = comp({
      quests: [quest('main_chapter_1')] as never,
      npcs: [npc('ghost')],
      worldLayers: [layer('haunting', 'nonexistent_quest', true, ['ghost'])],
    });
    const result = new ColyseusCompiler().compile(bad, token);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('unknown quest "nonexistent_quest"'))).toBe(true);
    // valid layers in the same comp would still compile — this proves the typed predicate guarantee
    expect(result.worldLayers).toHaveLength(0);
  });
});

describe('WorldLayer phasing (P2.4) — runtime proof (W.685 deep)', () => {
  it('quest completion flips active phases + NPC visibility, and receipts the event', async () => {
    const ts = await import('typescript');
    const result = new ColyseusCompiler().compile(phaseWorld, token);
    const js = ts.transpileModule(result.code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        experimentalDecorators: true,
      },
    }).outputText;
    const mod = evalServer(js);
    const RoomClass = mod[result.roomClassName] as new () => Record<string, unknown> & {
      onCreate: (o: unknown) => void;
      onJoin: (c: unknown, o: unknown) => void;
      dispatchClientMessage: (c: unknown, type: string, msg: unknown) => void;
      state: { players: Map<string, { questFlags: Set<string>; activePhases: Set<string> }> };
      npcVisibleTo: (p: unknown, npcId: string) => boolean;
    };
    const room = new RoomClass();
    const receipts: Array<Record<string, unknown>> = [];
    (room as { onGameEventReceipt: (r: Record<string, unknown>) => void }).onGameEventReceipt = (
      r
    ) => receipts.push(r);
    room.onCreate({});

    const client = { sessionId: 'p1', send: () => undefined };
    room.onJoin(client, {});
    const player = room.state.players.get('p1')!;

    // Before the quest: in the "pre" layer, NOT the "post" layer.
    expect(player.activePhases.has('pre_awakening')).toBe(true);
    expect(player.activePhases.has('post_awakening')).toBe(false);
    expect(room.npcVisibleTo(player, 'abandoned_keeper')).toBe(true); // pre NPC visible
    expect(room.npcVisibleTo(player, 'restored_keeper')).toBe(false); // post NPC hidden
    expect(room.npcVisibleTo(player, 'unrelated_merchant')).toBe(true); // ungated always visible

    // Complete the quest (server-authoritative).
    room.dispatchClientMessage(client, 'quest_complete', { questId: 'main_chapter_1' });

    // After the quest: phases flip.
    expect(player.questFlags.has('main_chapter_1')).toBe(true);
    expect(player.activePhases.has('post_awakening')).toBe(true);
    expect(player.activePhases.has('pre_awakening')).toBe(false);
    expect(room.npcVisibleTo(player, 'restored_keeper')).toBe(true); // now visible
    expect(room.npcVisibleTo(player, 'abandoned_keeper')).toBe(false); // now hidden

    // The quest completion was receipted.
    const qReceipts = receipts.filter((r) => r.kind === 'quest_complete');
    expect(qReceipts.length).toBe(1);
    expect(qReceipts[0].reason).toBe('main_chapter_1');
  });
});
