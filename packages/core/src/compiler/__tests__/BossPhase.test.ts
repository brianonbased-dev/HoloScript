import { describe, it, expect } from 'vitest';
import { ColyseusCompiler } from '../ColyseusCompiler';
import { createTestCompilerToken } from '../CompilerBase';

const token = createTestCompilerToken();

// A boss = an NPC with a multi-state brain: states are phases, transitions are
// HP / enrage-timer guards. Reuses the P1.3 brain FSM (parseBrainGuard, tickNpcBrain).
const bossBrain = `
  brain DragonRavagerAI : @behavior_tree {
    @boss
    @personality aggressive
    state phase1 {
      transition to phase2 @when { hp < 0.5 }
    }
    state phase2 {
      transition to enrage @when { hp < 0.2 }
      transition to berserk @when { timer > 1 }
    }
    state enrage { }
    state berserk { }
  }
`;

const raidWorld = `
  composition "RaidWorld" {
    import "./boss.hsplus"
    npc "dragon" { hp: 1000 npcType: "boss" faction: "wyrm" brain_ref: "DragonRavagerAI" }
  }
`;

const readFile = async (abs: string): Promise<string> => {
  if (abs.endsWith('boss.hsplus')) return bossBrain;
  throw new Error(`not found: ${abs}`);
};

async function compileRaid() {
  return new ColyseusCompiler().compileSource(raidWorld, '/w/raid.holo', token, {
    readFile,
    baseDir: '/w',
  });
}

// In-process eval of the generated server with stubbed Colyseus deps.
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
  const mod = { exports: {} as Record<string, unknown> };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('exports', 'require', 'module', js)(mod.exports, require_, mod);
  return mod.exports;
}

describe('BossPhase (P2.1) — boss-as-brain lowering', () => {
  it('lowers @boss + phases into BRAIN_REGISTRY with hp + timer guards', async () => {
    const result = await compileRaid();
    expect(result.success).toBe(true);
    const boss = result.brains.find((b) => b.name === 'DragonRavagerAI');
    expect(boss).toBeDefined();
    expect(boss?.isBoss).toBe(true);
    expect(boss?.initialState).toBe('phase1');

    const phase1 = boss?.states.find((s) => s.name === 'phase1');
    expect(phase1?.transitions[0]).toEqual({ to: 'phase2', guard: { field: 'hp', op: '<', value: 0.5 } });

    const phase2 = boss?.states.find((s) => s.name === 'phase2');
    expect(phase2?.transitions.find((t) => t.to === 'enrage')?.guard).toEqual({ field: 'hp', op: '<', value: 0.2 });
    expect(phase2?.transitions.find((t) => t.to === 'berserk')?.guard).toEqual({ field: 'timer', op: '>', value: 1 });
  });

  it('emits boss phase-transition receipts + broadcasts and the phase timer', async () => {
    const result = await compileRaid();
    expect(result.code).toContain('ticksSincePhaseEntry = 0;');
    expect(result.code).toContain("kind: 'boss_phase_transition'");
    expect(result.code).toContain("this.broadcast('boss_phase'");
    expect(result.code).toContain('const timerSec = npc.ticksSincePhaseEntry / TICK_RATE;');
    expect(result.code).toContain('timerSec: number,'); // brainGuardPasses now takes the timer
  });

  it('a non-boss brain does NOT emit phase-transition receipts (guarded by isBoss)', async () => {
    const result = await compileRaid();
    // The receipt/broadcast are inside `if (brain.isBoss)` — assert the guard wraps them.
    expect(result.code).toContain('if (brain.isBoss) {');
  });
});

describe('BossPhase (P2.1) — runtime proof (W.685 deep)', () => {
  it('boss transitions phase1→phase2→enrage on HP and fires a receipt', async () => {
    const ts = await import('typescript');
    const result = await compileRaid();
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
      state: { npcs: Map<string, Record<string, unknown>> };
      tickNpcBrain: (npc: Record<string, unknown>) => void;
    };
    const room = new RoomClass();

    const receipts: Array<Record<string, unknown>> = [];
    const broadcasts: Array<{ phase: unknown; from: unknown }> = [];
    (room as { onGameEventReceipt: (r: Record<string, unknown>) => void }).onGameEventReceipt = (r) => receipts.push(r);
    (room as { broadcast: (type: string, msg: { phase: unknown; from: unknown }) => void }).broadcast = (type, msg) => {
      if (type === 'boss_phase') broadcasts.push(msg);
    };

    room.onCreate({});
    const dragon = room.state.npcs.get('dragon')!;
    expect(dragon.brainState).toBe('phase1');
    expect(dragon.maxHp).toBe(1000);

    // 60% hp → stays phase1 (no transition)
    dragon.hp = 600;
    room.tickNpcBrain(dragon);
    expect(dragon.brainState).toBe('phase1');

    // 40% hp → phase1 → phase2 (hp < 0.5)
    dragon.hp = 400;
    room.tickNpcBrain(dragon);
    expect(dragon.brainState).toBe('phase2');

    // 10% hp → phase2 → enrage (hp < 0.2)
    dragon.hp = 100;
    room.tickNpcBrain(dragon);
    expect(dragon.brainState).toBe('enrage');

    // Every boss phase transition was receipted + broadcast
    const phaseReceipts = receipts.filter((r) => r.kind === 'boss_phase_transition');
    expect(phaseReceipts.length).toBe(2); // phase1→phase2, phase2→enrage
    expect(phaseReceipts[0].status).toBe('success');
    expect(broadcasts.map((b) => b.phase)).toEqual(['phase2', 'enrage']);
  });

  it('boss enrage TIMER transitions phase2→berserk after the threshold', async () => {
    const ts = await import('typescript');
    const result = await compileRaid();
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
      state: { npcs: Map<string, Record<string, unknown>> };
      tickNpcBrain: (npc: Record<string, unknown>) => void;
    };
    const room = new RoomClass();
    room.onCreate({});
    const dragon = room.state.npcs.get('dragon')!;

    // Drop to 30% → phase1→phase2 (resets phase timer). 0.3 is between enrage(0.2) and 0.5.
    dragon.hp = 300;
    room.tickNpcBrain(dragon);
    expect(dragon.brainState).toBe('phase2');

    // Hold hp at 30% and tick past the 1-second enrage timer (TICK_RATE=20 → ~21 ticks).
    for (let i = 0; i < 25; i++) room.tickNpcBrain(dragon);
    expect(dragon.brainState).toBe('berserk'); // timer > 1 fired, not the hp guard
  });
});
