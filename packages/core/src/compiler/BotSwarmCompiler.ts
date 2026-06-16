/**
 * @fileoverview Bot-Swarm Load/Balance Harness Compiler (SOVEREIGN target)
 * @module @holoscript/core/compiler
 *
 * PURPOSE (P2.11):
 * Compile an MMO composition to a self-contained, in-process load + balance test
 * harness for the Colyseus server emitted by {@link ColyseusCompiler}. The harness
 * spawns a swarm of bot players against the *real* generated Room and drives them
 * through the authoritative action loop — legal moves, speedhack attempts, ability
 * spam — collecting a BalanceReport (tick budget, anti-cheat rejections, receipts).
 *
 * This is the verification layer for the authoritative server: it proves the stack
 * holds under load and produces the benchmark data the paper program needs
 * (D.010 / I.007). It is ALSO the seed of game-balance CI — run the swarm in HoloCI
 * and assert the report stays within the `@balance_test` envelope.
 *
 * OUTPUT: a single TypeScript module exporting `runBotSwarm(RoomClass, opts)` +
 * `assertBalance(report)`. The harness takes the Room class by injection (works for
 * any generated server) and runs entirely in-process — no network, no fleet. A
 * future increment dispatches the same harness across the sim fleet (P2.11 cloud).
 */

import type { HoloComposition, HoloValue, HoloObjectTrait } from '../parser/HoloCompositionTypes.js';
import { CompilerBase, type CompilerToken } from './CompilerBase';

export interface BotSwarmCompilerOptions {
  /** Default bot count baked into the harness. Default: 24 */
  bots?: number;
  /** Default tick count baked into the harness. Default: 100 */
  ticks?: number;
  /** Fraction of moves that attempt a speedhack teleport. Default: 0.15 */
  speedhackRatio?: number;
}

interface BalanceEnvelope {
  maxAvgTickMs: number;
  /** Expect speedhack rejections when adversarial moves are injected. */
  expectSpeedhackRejections: boolean;
}

export class BotSwarmCompiler extends CompilerBase {
  protected readonly compilerName = 'BotSwarmCompiler';

  protected override getRequiredCapability(): string {
    // Test/CI artifact — not in the ANS enum; raw path keeps core-types untouched.
    return '/compile/testing/bot-swarm';
  }

  private opts: Required<BotSwarmCompilerOptions>;

  constructor(options: BotSwarmCompilerOptions = {}) {
    super();
    this.opts = {
      bots: options.bots ?? 24,
      ticks: options.ticks ?? 100,
      speedhackRatio: options.speedhackRatio ?? 0.15,
    };
  }

  override compile(composition: HoloComposition, agentToken: string, outputPath?: string): string {
    this.validateCompilerAccess(agentToken as CompilerToken, outputPath);

    const abilities = this.abilityNames(composition);
    const lootTables = (composition.lootTables ?? []).map((t) => t.name);
    const maxSpeed = this.readRootTraitNumber(composition, ['movement_contract', 'movement'], ['max_speed', 'maxSpeed', 'speed']) ?? 10;
    const tickRate = this.readRootTraitNumber(composition, ['tick_model', 'tick_rate'], ['tick_rate', 'hz', 'rate']) ?? 20;
    const envelope = this.readEnvelope(composition);

    const J = JSON.stringify;
    return [
      `/**`,
      ` * @generated BotSwarmCompiler — in-process MMO load/balance harness`,
      ` * Source composition: ${this.escapeStringValue(composition.name ?? 'world', 'TypeScript')}`,
      ` * Drives the ColyseusCompiler-generated Room with a bot swarm. DO NOT EDIT.`,
      ` */`,
      ``,
      `// ── Baked world config (compiled from the composition) ──────────────`,
      `export const KNOWN_ABILITIES: string[] = ${J(abilities)};`,
      `export const LOOT_TABLE_NAMES: string[] = ${J(lootTables)};`,
      `export const MAX_SPEED = ${maxSpeed};`,
      `export const TICK_RATE = ${tickRate};`,
      `export const BALANCE_ENVELOPE = ${J(envelope, null, 2)} as const;`,
      ``,
      `export interface BalanceReport {`,
      `  bots: number; ticks: number;`,
      `  moveAttempts: number; moveRejects: number;`,
      `  castAttempts: number; castRejects: number;`,
      `  receipts: number; avgTickMs: number; finalPlayers: number;`,
      `}`,
      ``,
      `export interface BotSwarmOptions {`,
      `  bots?: number; ticks?: number; speedhackRatio?: number; seed?: number;`,
      `}`,
      ``,
      `interface FakeClient { sessionId: string; send(type: string, msg: unknown): void; }`,
      ``,
      `function makeRng(seed: number): () => number {`,
      `  let s = seed >>> 0 || 1;`,
      `  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 0xffffffff; };`,
      `}`,
      ``,
      `function nowMs(): number {`,
      `  return typeof performance !== 'undefined' ? performance.now() : Date.now();`,
      `}`,
      ``,
      `/**`,
      ` * Drive a swarm of bots through the authoritative server in-process.`,
      ` * Pass the generated Room class; the harness instantiates it, joins N bots,`,
      ` * and ticks the simulation while bots issue legal + adversarial actions.`,
      ` */`,
      `// eslint-disable-next-line @typescript-eslint/no-explicit-any`,
      `export function runBotSwarm(RoomClass: new () => any, opts: BotSwarmOptions = {}): BalanceReport {`,
      `  const bots = opts.bots ?? ${this.opts.bots};`,
      `  const ticks = opts.ticks ?? ${this.opts.ticks};`,
      `  const speedhackRatio = opts.speedhackRatio ?? ${this.opts.speedhackRatio};`,
      `  const rng = makeRng(opts.seed ?? 1);`,
      ``,
      `  let receipts = 0, moveRejects = 0, castRejects = 0, moveAttempts = 0, castAttempts = 0;`,
      `  const room = new RoomClass();`,
      `  // Capture server-authoritative receipts (movement_reject / denied casts).`,
      `  (room as { onGameEventReceipt: (r: { kind?: string; status?: string }) => void }).onGameEventReceipt =`,
      `    (r: { kind?: string; status?: string }) => {`,
      `      receipts++;`,
      `      if (r.kind === 'movement_reject') moveRejects++;`,
      `      if (r.kind === 'ability_cast' && r.status === 'denied') castRejects++;`,
      `    };`,
      `  room.onCreate({});`,
      ``,
      `  const clients: FakeClient[] = [];`,
      `  for (let i = 0; i < bots; i++) {`,
      `    const c: FakeClient = { sessionId: 'bot_' + i, send: () => undefined };`,
      `    clients.push(c);`,
      `    room.onJoin(c, { name: c.sessionId });`,
      `  }`,
      ``,
      `  let totalMs = 0;`,
      `  for (let t = 0; t < ticks; t++) {`,
      `    const start = nowMs();`,
      `    room.state.tickCount = (room.state.tickCount + 1) >>> 0;`,
      `    room.onTick(1 / TICK_RATE);`,
      `    for (const c of clients) {`,
      `      const p = room.state.players.get(c.sessionId);`,
      `      if (!p) continue;`,
      `      moveAttempts++;`,
      `      if (rng() < speedhackRatio) {`,
      `        room.onMessage(c, 'move', { x: p.x + 1000, y: p.y, z: p.z }); // speedhack`,
      `      } else {`,
      `        const step = (MAX_SPEED / TICK_RATE) * 0.4;`,
      `        room.onMessage(c, 'move', { x: p.x + step * (rng() - 0.5), y: p.y, z: p.z + step * (rng() - 0.5) });`,
      `      }`,
      `      if (KNOWN_ABILITIES.length > 0) {`,
      `        castAttempts++;`,
      `        const ability = KNOWN_ABILITIES[Math.floor(rng() * KNOWN_ABILITIES.length)];`,
      `        room.onMessage(c, 'cast', { ability });`,
      `      }`,
      `    }`,
      `    totalMs += nowMs() - start;`,
      `  }`,
      ``,
      `  return {`,
      `    bots, ticks, moveAttempts, moveRejects, castAttempts, castRejects,`,
      `    receipts, avgTickMs: totalMs / Math.max(1, ticks), finalPlayers: room.state.players.size,`,
      `  };`,
      `}`,
      ``,
      `/** Assert the report stays within the @balance_test envelope. Returns failures. */`,
      `export function assertBalance(report: BalanceReport): string[] {`,
      `  const failures: string[] = [];`,
      `  if (report.avgTickMs > BALANCE_ENVELOPE.maxAvgTickMs) {`,
      `    failures.push(\`avgTickMs \${report.avgTickMs.toFixed(3)} > budget \${BALANCE_ENVELOPE.maxAvgTickMs}\`);`,
      `  }`,
      `  if (BALANCE_ENVELOPE.expectSpeedhackRejections && report.moveAttempts > 0 && report.moveRejects === 0) {`,
      `    failures.push('no speedhack rejections — movement authority not enforced');`,
      `  }`,
      `  if (report.finalPlayers !== report.bots) {`,
      `    failures.push(\`finalPlayers \${report.finalPlayers} != bots \${report.bots}\`);`,
      `  }`,
      `  return failures;`,
      `}`,
      ``,
    ].join('\n');
  }

  // ── Config readers ────────────────────────────────────────────────────────

  private abilityNames(composition: HoloComposition): string[] {
    return (composition.abilities ?? []).map((a) => a.name);
  }

  private readEnvelope(composition: HoloComposition): BalanceEnvelope {
    const maxAvgTickMs =
      this.readRootTraitNumber(composition, ['balance_test', 'balance'], ['max_avg_tick_ms', 'maxAvgTickMs', 'tick_budget_ms']) ?? 8;
    return { maxAvgTickMs, expectSpeedhackRejections: true };
  }

  private readRootTraitNumber(
    composition: HoloComposition,
    traitNames: string[],
    keys: string[]
  ): number | undefined {
    const clean = new Set(traitNames.map((n) => (n.startsWith('@') ? n.slice(1) : n)));
    for (const trait of composition.traits ?? []) {
      const name = String((trait as HoloObjectTrait).name).replace(/^@/, '');
      if (!clean.has(name)) continue;
      const config = ((trait as HoloObjectTrait).config ?? (trait as HoloObjectTrait).params ?? {}) as Record<string, HoloValue>;
      for (const key of keys) {
        const raw = config[key];
        const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
        if (Number.isFinite(n)) return n;
      }
    }
    return undefined;
  }
}

export default BotSwarmCompiler;
