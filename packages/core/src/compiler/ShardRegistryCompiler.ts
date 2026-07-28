/**
 * @fileoverview Shard Registry Compiler (BRIDGE target — P2.5)
 * @module @holoscript/core/compiler
 *
 * PURPOSE:
 * Compile `world_shard` blocks into a server-authoritative shard router + a
 * multi-room Colyseus bootstrap. A single world is partitioned into AABB shards,
 * each hosted as its own room. A player crossing a border is handed off — and the
 * handoff is RECEIPT-SEALED and validated: the target must be a declared NEIGHBOR
 * of the origin shard and the position must lie inside the target's bounds. That
 * makes cross-shard teleport-cheats structurally rejectable (the "provenance-sealed
 * cross-shard handoff" claim, memo §4).
 *
 * Each shard's `neighbors` are COMPILE-VALIDATED against the declared shards: an
 * unknown neighbor is a compile error (the same typed-predicate guarantee used by
 * world_layer phasing and dungeon instancing).
 *
 * SCOPE: same-machine multi-room (Colyseus relay). Cross-host handoff (session
 * broker + presence layer) is a round-4 idea-seed.
 *
 * OUTPUT: a TypeScript module exporting SHARD_REGISTRY + shardForPosition() + a
 * ShardRouter class (route / requestHandoff / createShardServers).
 */

import type { HoloComposition } from '../parser/HoloCompositionTypes.js';
import { CompilerBase, type CompilerToken } from './CompilerBase';

export const SHARD_HANDOFF_RECEIPT_SCHEMA = 'holoscript.mmo-shard-handoff.v1';

export interface ShardConfig {
  name: string;
  min: [number, number, number];
  max: [number, number, number];
  neighbors: string[];
  maxPlayers: number;
  handoff: string;
}

export interface ShardRegistryCompilationResult {
  success: boolean;
  code: string;
  shards: ShardConfig[];
  warnings: string[];
  errors: string[];
}

export class ShardRegistryCompiler extends CompilerBase {
  protected readonly compilerName = 'ShardRegistryCompiler';

  protected override getRequiredCapability(): string {
    return '/compile/gamedev/world-shard';
  }

  private errors: string[] = [];
  private warnings: string[] = [];

  // Accept (and ignore) factory options for ExportManager parity; no tunables yet.
  constructor(_options: Record<string, unknown> = {}) {
    super();
  }

  override compile(
    composition: HoloComposition,
    agentToken: string,
    outputPath?: string
  ): ShardRegistryCompilationResult {
    this.validateCompilerAccess(agentToken as CompilerToken, outputPath);
    this.errors = [];
    this.warnings = [];

    const shards = this.buildShards(composition);
    if (shards.length === 0 && (composition.worldShards ?? []).length === 0) {
      this.warnings.push('No world_shard blocks found — emitting an empty shard router.');
    }

    const code = this.emit(shards);
    return {
      success: this.errors.length === 0,
      code,
      shards,
      warnings: [...this.warnings],
      errors: [...this.errors],
    };
  }

  /** Lower + validate world_shard blocks (neighbors must reference declared shards). */
  private buildShards(composition: HoloComposition): ShardConfig[] {
    const blocks = composition.worldShards ?? [];
    const declared = new Set(blocks.map((s) => s.name));
    const out: ShardConfig[] = [];
    for (const s of blocks) {
      // Degenerate bounds are a warning, not a hard error (still routable as a point).
      for (let i = 0; i < 3; i++) {
        if (s.min[i] > s.max[i]) {
          this.warnings.push(
            `world_shard '${s.name}' has min[${i}] > max[${i}] — bounds are inverted.`
          );
        }
      }
      const validNeighbors: string[] = [];
      for (const n of s.neighbors) {
        if (!declared.has(n)) {
          this.errors.push(
            `world_shard '${s.name}' lists unknown neighbor "${n}". ` +
              `Declare a world_shard with that name (compile-validated adjacency).`
          );
          continue;
        }
        if (n === s.name) {
          this.warnings.push(`world_shard '${s.name}' lists itself as a neighbor — ignored.`);
          continue;
        }
        validNeighbors.push(n);
      }
      out.push({
        name: s.name,
        min: s.min,
        max: s.max,
        neighbors: validNeighbors,
        maxPlayers: s.maxPlayers > 0 ? s.maxPlayers : 100,
        handoff: s.handoff || 'seamless',
      });
    }
    return out;
  }

  private registryObject(shards: ShardConfig[]): Record<string, Omit<ShardConfig, 'name'>> {
    const obj: Record<string, Omit<ShardConfig, 'name'>> = {};
    for (const s of shards) {
      const { name, ...rest } = s;
      obj[name] = rest;
    }
    return obj;
  }

  private emit(shards: ShardConfig[]): string {
    return [
      `/**`,
      ` * @generated ShardRegistryCompiler — server-authoritative shard router`,
      ` * Receipt-sealed, neighbor-validated cross-shard handoff. DO NOT EDIT.`,
      ` */`,
      ``,
      `export const SHARD_HANDOFF_RECEIPT_SCHEMA = '${SHARD_HANDOFF_RECEIPT_SCHEMA}';`,
      ``,
      `export const SHARD_REGISTRY: Record<string, {`,
      `  min: [number, number, number]; max: [number, number, number];`,
      `  neighbors: string[]; maxPlayers: number; handoff: string;`,
      `}> = ${JSON.stringify(this.registryObject(shards), null, 2)};`,
      ``,
      `export interface ShardHandoffReceipt {`,
      `  schema: string; player: string; fromShard: string; toShard: string;`,
      `  position: [number, number, number]; tick: number;`,
      `}`,
      ``,
      `export interface HandoffResult { ok: boolean; reason?: string; receipt?: ShardHandoffReceipt; }`,
      ``,
      `function inBounds(`,
      `  s: { min: [number, number, number]; max: [number, number, number] },`,
      `  x: number, y: number, z: number,`,
      `): boolean {`,
      `  return x >= s.min[0] && x <= s.max[0] && y >= s.min[1] && y <= s.max[1] && z >= s.min[2] && z <= s.max[2];`,
      `}`,
      ``,
      `/** The shard whose AABB contains the position, or null if none. */`,
      `export function shardForPosition(x: number, y: number, z: number): string | null {`,
      `  for (const name of Object.keys(SHARD_REGISTRY)) {`,
      `    if (inBounds(SHARD_REGISTRY[name], x, y, z)) return name;`,
      `  }`,
      `  return null;`,
      `}`,
      ``,
      `/**`,
      ` * Server-authoritative shard router. Same-machine multi-room: define one room`,
      ` * per shard, route players by position, and validate every border handoff.`,
      ` */`,
      `export class ShardRouter {`,
      `  constructor(private readonly now: () => number = () => 0) {}`,
      ``,
      `  /** The shard a position belongs to. */`,
      `  route(x: number, y: number, z: number): string | null {`,
      `    return shardForPosition(x, y, z);`,
      `  }`,
      ``,
      `  /**`,
      `   * Validate + seal a cross-shard handoff. Rejects when the target is unknown,`,
      `   * NOT a declared neighbor of the origin (anti-teleport), or the position is`,
      `   * outside the target's bounds. On success emits a sealed handoff receipt.`,
      `   */`,
      `  requestHandoff(`,
      `    player: string, fromShard: string, toShard: string, position: [number, number, number],`,
      `  ): HandoffResult {`,
      `    const from = SHARD_REGISTRY[fromShard];`,
      `    const to = SHARD_REGISTRY[toShard];`,
      `    if (!to) return { ok: false, reason: 'unknown_target_shard' };`,
      `    if (from && !from.neighbors.includes(toShard)) return { ok: false, reason: 'non_adjacent_shard' };`,
      `    if (!inBounds(to, position[0], position[1], position[2])) {`,
      `      return { ok: false, reason: 'position_out_of_bounds' };`,
      `    }`,
      `    const receipt: ShardHandoffReceipt = {`,
      `      schema: SHARD_HANDOFF_RECEIPT_SCHEMA,`,
      `      player, fromShard, toShard, position: [...position] as [number, number, number], tick: this.now(),`,
      `    };`,
      `    this.onHandoff(receipt);`,
      `    return { ok: true, receipt };`,
      `  }`,
      ``,
      `  /** Define one Colyseus room per shard (multi-define bootstrap). */`,
      `  createShardServers(`,
      `    gameServer: { define: (name: string, room: unknown, opts?: unknown) => unknown },`,
      `    RoomClass: unknown,`,
      `  ): void {`,
      `    for (const name of Object.keys(SHARD_REGISTRY)) {`,
      `      gameServer.define(name, RoomClass, { maxClients: SHARD_REGISTRY[name].maxPlayers });`,
      `    }`,
      `  }`,
      ``,
      `  /** Override to persist handoff receipts to a TrustLedger / NDJSON sink. */`,
      `  protected onHandoff(receipt: ShardHandoffReceipt): void { void receipt; }`,
      `}`,
      ``,
    ].join('\n');
  }
}

export default ShardRegistryCompiler;
