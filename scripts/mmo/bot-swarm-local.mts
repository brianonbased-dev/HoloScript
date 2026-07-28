/**
 * $0 local-hardware MMO bot-swarm runner — no fleet, no spend.
 *
 * Compiles a composition to an authoritative Colyseus server + a network bot
 * driver, starts the server locally, drives N real WebSocket bots against it, and
 * prints the BalanceReport. This is the "Cloud BotSwarm" path realized on the
 * laptop / Jetson (LAN) at $0 — the spend gate only applies to rented cloud GPUs,
 * which this never touches.
 *
 * Requires `colyseus` + `colyseus.js` resolvable from <outDir>:
 *   mkdir <outDir> && cd <outDir> && npm i colyseus@^0.15 colyseus.js@^0.15
 *
 * Run from the repo root:
 *   pnpm exec tsx scripts/mmo/bot-swarm-local.mts [outDir] [port] [bots] [ticks]
 *
 * To load-test against the Jetson instead of localhost, run the server there and
 * pass its ws URL via the BOTSWARM_URL env var.
 */
import ts from 'typescript';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ColyseusCompiler } from '../../packages/core/src/compiler/ColyseusCompiler';
import { BotSwarmCompiler } from '../../packages/core/src/compiler/BotSwarmCompiler';
import { createTestCompilerToken } from '../../packages/core/src/compiler/CompilerBase';
import type { HoloComposition } from '../../packages/core/src/parser/HoloCompositionTypes';

const outDir = (process.argv[2] ?? 'C:/tmp/botswarm-live').replace(/\\/g, '/');
const port = Number(process.argv[3] ?? 2570);
const bots = Number(process.argv[4] ?? 16);
const ticks = Number(process.argv[5] ?? 50);
const url = process.env.BOTSWARM_URL ?? `ws://localhost:${port}`;

function composition(): HoloComposition {
  return {
    type: 'Composition',
    name: 'FrontierLive',
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
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
    abilities: [
      {
        type: 'Ability',
        name: 'fireball',
        abilityType: 'spell',
        stats: { type: 'AbilityStats', cooldown: 6, manaCost: 40, range: 30 },
        effects: { type: 'AbilityEffects' },
      },
    ],
    spawnPoints: [
      {
        type: 'SpawnPoint',
        name: 'camp_a',
        faction: 'none',
        maxCount: 100,
        position: { type: 'Position', x: 0, y: 0, z: 0 },
        properties: {},
      },
    ],
    traits: [
      { type: 'ObjectTrait', name: 'movement_contract', config: { max_speed: 8 }, args: [] },
      { type: 'ObjectTrait', name: 'balance_test', config: { max_avg_tick_ms: 50 }, args: [] },
    ],
  } as unknown as HoloComposition;
}

async function main(): Promise<void> {
  const token = createTestCompilerToken();
  const comp = composition();

  const server = new ColyseusCompiler().compile(comp, token);
  const harness = new BotSwarmCompiler().compile(comp, token);

  const tsOpts = {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      experimentalDecorators: true,
    },
  } as const;
  writeFileSync(`${outDir}/server.cjs`, ts.transpileModule(server.code, tsOpts).outputText);
  writeFileSync(`${outDir}/harness.cjs`, ts.transpileModule(harness, tsOpts).outputText);

  const req = createRequire(`${outDir}/`);
  const serverMod = req('./server.cjs') as {
    ROOM_NAME: string;
    startColyseusServer: (
      port: number
    ) => Promise<{ gracefullyShutdown: (consented: boolean) => Promise<void> }>;
  };
  const harnessMod = req('./harness.cjs') as {
    runNetworkBots: (opts: Record<string, unknown>) => Promise<Record<string, number>>;
    assertBalance: (r: Record<string, number>) => string[];
  };

  console.log(`[bot-swarm-local] room=${serverMod.ROOM_NAME} — starting server on :${port}`);
  const gs = await serverMod.startColyseusServer(port);
  try {
    console.log(`[bot-swarm-local] driving ${bots} network bots × ${ticks} ticks at ${url} ...`);
    const report = await harnessMod.runNetworkBots({
      url,
      bots,
      ticks,
      speedhackRatio: 0.3,
      seed: 1,
    });
    console.log('[bot-swarm-local] REPORT', JSON.stringify(report, null, 2));
    console.log('[bot-swarm-local] balance check:', harnessMod.assertBalance(report));
    const held = report.finalPlayers === bots && report.moveRejects > 0;
    console.log(
      held
        ? `✅ LIVE $0 RUN OK — ${report.finalPlayers}/${bots} bots held; ${report.moveRejects}/${report.moveAttempts} speedhacks rejected over the wire`
        : `❌ unexpected: finalPlayers=${report.finalPlayers} moveRejects=${report.moveRejects}`
    );
  } finally {
    await gs.gracefullyShutdown(false);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('[bot-swarm-local] FAILED', err);
    process.exit(1);
  }
);
