/**
 * @fileoverview Colyseus Multiplayer Compiler (BRIDGE target)
 * @module @holoscript/core/compiler
 *
 * PURPOSE:
 * Compile HoloScript compositions (MMO world/zone/npc constructs) to a
 * Colyseus multiplayer game server room schema + handler. Colyseus is a
 * Node.js authoritative multiplayer framework.
 *
 * OUTPUT: A single TypeScript source file containing:
 *   1. Room State schema  (@colyseus/schema decorators)
 *   2. Room class         (Room<GameRoomState> subclass)
 *   3. app.ts bootstrap   (Server.define registration)
 *
 * ROUND-2 (2026-06-15) — AST→runtime gap closure:
 *   - Consumes the TYPED MMO composition fields (composition.npcs,
 *     spawnPoints, worldChunks, lootTables, abilities) in addition to the
 *     legacy trait-scan, so round-1 parser output is no longer dead.
 *   - Server-authoritative movement validation (anti-speedhack) replaces the
 *     blind client-position trust in the move handler.
 *   - Emits canonical game-event receipts (schema holoscript.mmo-event-receipt.v1)
 *     on movement rejection — the seed of verifiable-anti-cheat-by-construction.
 *   - Lowers NPC brain references → NpcState.brainType + initializeBrain() hook.
 *   - Lowers world_chunk declarations → an exported CHUNK_MANIFEST artifact.
 *   - Canonical u32 tick clock + deterministic per-room PRNG seed.
 *   - compileSource(): async entry that resolves .hs ability / .hsplus brain
 *     imports so cross-file game nodes are visible to the compiler.
 *
 * MAPPING RULES:
 *   HoloZone / world blocks          → Room definition name
 *   composition.npcs / @npc          → NpcState entities (typed + trait-scan)
 *   composition.spawnPoints          → SpawnPointState array
 *   composition.worldChunks          → CHUNK_MANIFEST export
 *   composition.abilities + .hs      → ABILITY_REGISTRY (server-side configs)
 *   HoloLogic on_event 'player_join' → onJoin handler
 *   @max_players trait               → room maxClients
 *   @tick_rate / @tick_model         → room patchRate + canonical tick clock
 *   @movement_contract(max_speed)    → server-authoritative move validation
 */

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloLogic,
  HoloEventHandler,
  HoloValue,
  HoloNPC,
  HoloSpawnPoint,
  HoloWorldChunk,
  HoloPosition,
  HoloImport,
} from '../parser/HoloCompositionTypes.js';
import { CompilerBase, type CompilerToken } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from '@holoscript/core-types/ans';
import {
  type GameAbilityNode,
  getAbilityDirectives,
  type AbilityDirectives,
} from '../types/base';
import { MMO_EVENT_RECEIPT_SCHEMA } from '../trust/GameEventReceipt';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ColyseusCompilerOptions {
  /** Target Colyseus version constraints. Default: 'v0.15' */
  colyseusVersion: 'v0.14' | 'v0.15';
  /** Minify the generated TypeScript output. Default: false */
  minify: boolean;
  /** Include source map comments. Default: false */
  source_maps: boolean;
  /** Emit strict TypeScript (import type etc). Default: true */
  strictMode: boolean;
}

/** Per-source options for the async {@link ColyseusCompiler.compileSource} entry. */
export interface ColyseusCompileSourceOptions {
  /**
   * Async reader for resolving `@import` targets (.hs abilities / .hsplus brains).
   * Node default is used if omitted. Browser/XR hosts must inject this.
   */
  readFile?: (absolutePath: string) => Promise<string>;
  /** Base directory for resolving relative import paths. Default: dirname(sourceFile). */
  baseDir?: string;
}

export interface ColyseusChunkManifestEntry {
  name: string;
  priority: string | number;
  biome: string;
  lodDistances: number[];
  npcRoster: string[];
  streaming: Record<string, unknown>;
}

export interface ColyseusAbilityConfig {
  name: string;
  cooldownMs: number;
  gcdMs: number;
  manaCost: number;
  range: number;
  damageType: string;
  authorityEnvelope: AbilityDirectives['authorityEnvelope'];
  castTimeMs: number;
}

export interface ColyseusCompilationResult {
  success: boolean;
  /** The single generated TypeScript file content */
  code: string;
  /** Room class name derived from the composition */
  roomClassName: string;
  /** Schema class names emitted */
  schemaClasses: string[];
  /** World-chunk streaming manifest (also emitted inline as CHUNK_MANIFEST) */
  chunkManifest: ColyseusChunkManifestEntry[];
  /** Server-side ability configs (from typed + imported .hs abilities) */
  abilities: ColyseusAbilityConfig[];
  warnings: string[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Internal trait names
// ---------------------------------------------------------------------------

type ColyseusTraitName =
  | 'npc'
  | 'spawn_point'
  | 'max_players'
  | 'tick_rate'
  | 'server_side'
  | 'mmo_entity'
  | 'faction'
  | 'boss';

// ---------------------------------------------------------------------------
// Normalized internal representations (unify typed-field + trait-scan sources)
// ---------------------------------------------------------------------------

interface NormalizedNpc {
  id: string;
  npcType: string;
  x: number;
  y: number;
  z: number;
  hp: number;
  faction: string;
  /** Brain skill reference (from `brain:` property or .hsplus import). '' if none. */
  brainType: string;
}

interface NormalizedSpawn {
  id: string;
  x: number;
  y: number;
  z: number;
  faction: string;
  maxCount: number;
}

interface MovementContract {
  /** Maximum authoritative move speed in world-units / second. */
  maxSpeed: number;
}

interface TickModel {
  tickRate: number;
  /** Deterministic per-room PRNG seed (u32). */
  rngSeed: number;
}

/** Default authoritative move speed (world-units/sec) when no @movement_contract present. */
const DEFAULT_MAX_MOVE_SPEED = 10;
/** Floating-point slack for movement distance comparison. */
const MOVE_EPSILON = 0.001;

// ---------------------------------------------------------------------------
// Compiler
// ---------------------------------------------------------------------------

export class ColyseusCompiler extends CompilerBase {
  protected readonly compilerName = 'ColyseusCompiler';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    // BRIDGE target — lives in the gamedev domain (server-side of MMO)
    return ANSCapabilityPath.UNITY; // reuse gamedev tier; Colyseus is not yet in ANS
  }

  private options: ColyseusCompilerOptions;
  private errors: string[] = [];
  private warnings: string[] = [];
  private lines: string[] = [];
  private schemaClasses: string[] = [];
  private chunkManifest: ColyseusChunkManifestEntry[] = [];
  private abilities: ColyseusAbilityConfig[] = [];

  /** Imported .hs ability nodes (populated by compileSource before compile). */
  private importedAbilities: GameAbilityNode[] = [];
  /** Imported .hsplus brain skill names (populated by compileSource before compile). */
  private importedBrains: Set<string> = new Set();

  constructor(options: Partial<ColyseusCompilerOptions> = {}) {
    super();
    this.options = {
      colyseusVersion: options.colyseusVersion ?? 'v0.15',
      minify: options.minify ?? false,
      source_maps: options.source_maps ?? false,
      strictMode: options.strictMode ?? true,
    };
  }

  override compile(
    composition: HoloComposition,
    agentToken: string,
    outputPath?: string
  ): ColyseusCompilationResult {
    this.validateCompilerAccess(agentToken as CompilerToken, outputPath);

    this.errors = [];
    this.warnings = [];
    this.lines = [];
    this.schemaClasses = [];
    this.chunkManifest = [];
    this.abilities = [];

    if (!composition || composition.type !== 'Composition') {
      this.errors.push('Invalid composition tree');
      return this.buildResult('UnknownRoom');
    }

    // ── Derive room name ──────────────────────────────────────────────────
    const roomName = this.deriveRoomName(composition);
    const roomClassName = `${this.jsClassName(roomName)}Room`;

    // ── Normalize entities (typed MMO fields ∪ legacy trait-scan) ─────────
    const npcs = this.normalizeNpcs(composition);
    const spawns = this.normalizeSpawns(composition);
    const serverSideNodes = this.extractNodesWithTrait(composition, 'server_side');

    // ── Config: tick model + movement contract ───────────────────────────
    const tickModel = this.resolveTickModel(composition);
    const movement = this.resolveMovementContract(composition);
    const maxPlayers = this.extractScalarTrait(composition, 'max_players', 'value', 100);

    // ── World chunks + abilities (typed + imported) ──────────────────────
    this.chunkManifest = this.buildChunkManifest(composition);
    this.abilities = this.buildAbilityRegistry(composition);

    // ── Logic event handlers ──────────────────────────────────────────────
    const logic = composition.logic ?? null;
    const joinHandler = logic ? this.findEventHandler(logic, 'player_join') : null;
    const leaveHandler = logic ? this.findEventHandler(logic, 'player_leave') : null;
    const actionHandler = logic ? this.findEventHandler(logic, 'player_action') : null;

    if (npcs.length === 0 && spawns.length === 0 && !logic) {
      this.warnings.push(
        'No MMO constructs (npc, spawn_point, logic) found. Emitting a generic MMO room scaffold.'
      );
    }

    // ── Emit sections ─────────────────────────────────────────────────────
    this.emitFileHeader(composition.name);
    this.emitSchemaImports();
    this.emitConstants(tickModel, movement);
    this.emitSchemaSection({ npcs, spawns, serverSideNodes });
    this.emitRoomClass({
      roomClassName,
      maxPlayers,
      tickModel,
      npcs,
      spawns,
      joinHandler,
      leaveHandler,
      actionHandler,
    });
    this.emitBootstrap(roomClassName, roomName);

    return this.buildResult(roomClassName);
  }

  /**
   * Async compile entry that resolves `@import` targets before compiling.
   *
   * Parses the `.holo` source, then for every `@import "./x.hs"` /
   * `@import "./y.hsplus"` it reads + parses the imported file and surfaces
   * its game nodes to {@link compile}:
   *   - `.hs`     → `GameAbilityNode[]` merged into ABILITY_REGISTRY
   *   - `.hsplus` → brain skill names used to resolve NPC `brain:` references
   *
   * This is the cross-format import bridge: the `.holo` parser produces the
   * world, the `.hs`/`.hsplus` parsers produce abilities/brains, and this
   * method joins them so the Colyseus output is whole.
   */
  async compileSource(
    source: string,
    sourceFile: string,
    agentToken: string,
    opts: ColyseusCompileSourceOptions = {}
  ): Promise<ColyseusCompilationResult> {
    this.importedAbilities = [];
    this.importedBrains = new Set();
    // compile() resets this.warnings, so resolution-phase warnings are collected
    // locally and merged into the final result.
    const resolutionWarnings: string[] = [];

    const { HoloCompositionParser } = await import('../parser/HoloCompositionParser');
    const parser = new HoloCompositionParser();
    const parsed = parser.parse(source);

    if (!parsed.success || !parsed.ast) {
      this.errors = [
        `Failed to parse .holo source '${sourceFile}': ${parsed.errors?.[0]?.message ?? 'unknown error'}`,
      ];
      return this.buildResult('UnknownRoom');
    }

    const composition = parsed.ast;
    const baseDir = opts.baseDir ?? sourceFile.replace(/\\/g, '/').replace(/\/[^/]+$/, '');
    const readFile = opts.readFile ?? this.defaultReader();

    for (const imp of composition.imports ?? []) {
      const importSource = this.importSourcePath(imp);
      if (!importSource) continue;
      const abs = this.resolveRelative(importSource, baseDir);

      try {
        const text = await readFile(abs);
        if (importSource.endsWith('.hs')) {
          await this.ingestHsAbilities(text, abs, resolutionWarnings);
        } else if (importSource.endsWith('.hsplus')) {
          this.ingestBrainNames(text, importSource, resolutionWarnings);
        }
      } catch (err) {
        resolutionWarnings.push(
          `Could not resolve import '${importSource}': ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    const result = this.compile(composition, agentToken);
    result.warnings = [...resolutionWarnings, ...result.warnings];
    return result;
  }

  // =========================================================================
  // Import resolution helpers
  // =========================================================================

  private importSourcePath(imp: HoloImport): string | null {
    const src = (imp as { source?: unknown }).source;
    return typeof src === 'string' ? src : null;
  }

  private resolveRelative(importPath: string, baseDir: string): string {
    const p = importPath.replace(/\\/g, '/');
    if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) return p;
    const base = baseDir.replace(/\\/g, '/').replace(/\/$/, '');
    const parts = `${base}/${p}`.split('/');
    const out: string[] = [];
    for (const seg of parts) {
      if (seg === '.' || seg === '') continue;
      if (seg === '..') out.pop();
      else out.push(seg);
    }
    return (p.startsWith('/') ? '/' : '') + out.join('/');
  }

  private async ingestHsAbilities(
    text: string,
    file: string,
    warnings: string[]
  ): Promise<void> {
    try {
      const { HoloScriptCodeParser } = await import('../HoloScriptCodeParser');
      const parser = new HoloScriptCodeParser();
      const result = parser.parse(text);
      for (const node of result.ast ?? []) {
        if ((node as { type?: string }).type === 'game-ability') {
          this.importedAbilities.push(node as unknown as GameAbilityNode);
        }
      }
    } catch (err) {
      warnings.push(
        `Failed to parse .hs import '${file}': ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private ingestBrainNames(text: string, file: string, warnings: string[]): void {
    // Brain declarations: `brain <Name> { ... }`. Cheap surface scan — we only
    // need the names so NPC `brain:` references resolve; full .hsplus lowering
    // is a later increment.
    const re = /\bbrain\s+([A-Za-z_][A-Za-z0-9_]*)/g;
    let m: RegExpExecArray | null;
    let found = 0;
    while ((m = re.exec(text)) !== null) {
      this.importedBrains.add(m[1]);
      found++;
    }
    if (found === 0) {
      warnings.push(`No brain declarations found in '${file}'.`);
    }
  }

  private defaultReader(): (path: string) => Promise<string> {
    return async (filePath: string) => {
      const fsModule = 'fs/promises';
      const fs = await import(/* webpackIgnore: true */ /* @vite-ignore */ fsModule);
      return await fs.readFile(filePath, 'utf-8');
    };
  }

  // =========================================================================
  // Normalization — typed MMO fields ∪ legacy trait-scan
  // =========================================================================

  private normalizeNpcs(composition: HoloComposition): NormalizedNpc[] {
    const byId = new Map<string, NormalizedNpc>();

    // 1) Typed composition.npcs (round-1 parser output — previously ignored)
    for (const npc of composition.npcs ?? []) {
      const norm = this.normalizeTypedNpc(npc);
      byId.set(norm.id, norm);
    }

    // 2) Legacy trait-scan (@npc / @mmo_entity / @boss on HoloObjectDecl)
    const traitNpcs = this.extractNodesWithAnyTrait(composition, ['npc', 'mmo_entity', 'boss']);
    for (const node of traitNpcs) {
      const id = node.name;
      if (byId.has(id)) continue;
      const pos = this.objectPosition(node);
      byId.set(id, {
        id,
        npcType: this.resolveNpcType(node),
        x: pos.x,
        y: pos.y,
        z: pos.z,
        hp: this.valueToNumber(this.findObjProp(node, 'hp'), 100),
        faction: this.valueToString(this.findObjProp(node, 'faction'), 'none'),
        brainType: this.resolveBrainRef(this.valueToString(this.findObjProp(node, 'brain'), '')),
      });
    }

    return [...byId.values()];
  }

  private normalizeTypedNpc(npc: HoloNPC): NormalizedNpc {
    const prop = (key: string): HoloValue | undefined =>
      npc.properties?.find((p) => p.key === key)?.value;
    // Brain ref: typed npc.brain.brainRef (real parsed .holo) wins; fall back to
    // a `brain` property (hand-built compositions / simple string ref).
    const brainRef =
      (npc as { brain?: { brainRef?: string } }).brain?.brainRef ??
      this.valueToString(prop('brain'), '');
    const posSource = npc.position
      ? (npc.position as unknown as HoloValue)
      : prop('position');
    const pos = this.valueToVector(posSource, {
      x: this.valueToNumber(prop('x'), 0),
      y: this.valueToNumber(prop('y'), 0),
      z: this.valueToNumber(prop('z'), 0),
    });
    return {
      id: npc.name,
      npcType: npc.npcType ?? 'npc',
      x: pos.x,
      y: pos.y,
      z: pos.z,
      hp: this.valueToNumber(prop('hp'), 100),
      faction: this.valueToString(prop('faction'), 'none'),
      brainType: this.resolveBrainRef(brainRef),
    };
  }

  /** Resolve a brain reference against imported .hsplus brain names (best-effort). */
  private resolveBrainRef(ref: string): string {
    if (!ref) return '';
    if (this.importedBrains.size === 0 || this.importedBrains.has(ref)) return ref;
    // Reference names a brain we didn't see imported — keep it but warn.
    this.warnings.push(`NPC references brain '${ref}' not found in imported .hsplus modules.`);
    return ref;
  }

  private normalizeSpawns(composition: HoloComposition): NormalizedSpawn[] {
    const byId = new Map<string, NormalizedSpawn>();

    for (const sp of composition.spawnPoints ?? []) {
      byId.set(sp.name, this.normalizeTypedSpawn(sp));
    }

    const traitSpawns = this.extractNodesWithTrait(composition, 'spawn_point');
    for (const node of traitSpawns) {
      if (byId.has(node.name)) continue;
      const pos = this.objectPosition(node);
      byId.set(node.name, {
        id: node.name,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        faction: this.valueToString(this.findObjProp(node, 'faction'), 'none'),
        maxCount: this.valueToNumber(this.findObjProp(node, 'max_count'), 1),
      });
    }

    return [...byId.values()];
  }

  private normalizeTypedSpawn(sp: HoloSpawnPoint): NormalizedSpawn {
    const pos = this.positionToVector(sp.position);
    return {
      id: sp.name,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      faction: sp.faction ?? 'none',
      maxCount: typeof sp.maxCount === 'number' ? sp.maxCount : 1,
    };
  }

  // =========================================================================
  // Config resolution — tick model + movement contract
  // =========================================================================

  private resolveTickModel(composition: HoloComposition): TickModel {
    const tickRate =
      this.readRootTraitNumber(composition, ['tick_model', 'tick_rate'], ['tick_rate', 'hz', 'rate']) ??
      this.extractScalarTrait(composition, 'tick_rate', 'hz', 20);
    return {
      tickRate: tickRate > 0 ? tickRate : 20,
      // Deterministic seed from the room name → reproducible server PRNG.
      rngSeed: this.hashSeed(this.deriveRoomName(composition)),
    };
  }

  private resolveMovementContract(composition: HoloComposition): MovementContract {
    const maxSpeed = this.readRootTraitNumber(
      composition,
      ['movement_contract', 'movement'],
      ['max_speed', 'maxSpeed', 'speed']
    );
    return { maxSpeed: maxSpeed && maxSpeed > 0 ? maxSpeed : DEFAULT_MAX_MOVE_SPEED };
  }

  /** Read a numeric config value from a root-level trait (@trait(key: value)). */
  private readRootTraitNumber(
    composition: HoloComposition,
    traitNames: string[],
    keys: string[]
  ): number | undefined {
    const traits = composition.traits ?? [];
    const clean = new Set(traitNames.map((n) => this.cleanTraitName(n)));
    for (const trait of traits) {
      if (!clean.has(this.cleanTraitName(String(trait.name)))) continue;
      const config = (trait.config ?? trait.params ?? {}) as Record<string, unknown>;
      for (const key of keys) {
        const raw = config[key];
        const n = this.valueToNumber(raw as HoloValue, NaN);
        if (Number.isFinite(n)) return n;
      }
    }
    return undefined;
  }

  private hashSeed(s: string): number {
    let h = 2166136261 >>> 0; // FNV-1a
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0 || 1; // never 0 (xorshift fixed point)
  }

  // =========================================================================
  // World chunks + ability registry
  // =========================================================================

  private buildChunkManifest(composition: HoloComposition): ColyseusChunkManifestEntry[] {
    return (composition.worldChunks ?? []).map((chunk: HoloWorldChunk) => ({
      name: chunk.name,
      priority: chunk.priority ?? 'medium',
      biome: chunk.biome ?? 'default',
      lodDistances: Array.isArray(chunk.lodDistances) ? chunk.lodDistances : [],
      npcRoster: Array.isArray(chunk.npcRoster) ? chunk.npcRoster : [],
      streaming: (chunk.streaming as Record<string, unknown>) ?? {},
    }));
  }

  private buildAbilityRegistry(composition: HoloComposition): ColyseusAbilityConfig[] {
    const out: ColyseusAbilityConfig[] = [];
    const seen = new Set<string>();

    // Typed .holo abilities (HoloAbility)
    for (const ability of composition.abilities ?? []) {
      if (seen.has(ability.name)) continue;
      seen.add(ability.name);
      const stats = ability.stats ?? {};
      out.push({
        name: ability.name,
        cooldownMs: Math.round((this.numOr(stats.cooldown, 0)) * 1000),
        gcdMs: 0,
        manaCost: this.numOr(stats.manaCost, 0),
        range: this.numOr(stats.range, 0),
        damageType: ability.abilityType === 'passive' ? 'none' : 'physical',
        authorityEnvelope: 'server',
        castTimeMs: Math.round(this.numOr(stats.castTime, 0) * 1000),
      });
    }

    // Imported .hs abilities (GameAbilityNode → typed directives via P0.1).
    // `.hs` `@cooldown 4` etc. land in node.directives, not node.properties —
    // fold them (unit-normalized) so getAbilityDirectives can read them.
    for (const node of this.importedAbilities) {
      if (seen.has(node.name)) continue;
      seen.add(node.name);
      const merged = this.foldAbilityDirectives(node);
      const d = getAbilityDirectives({ ...node, properties: merged } as GameAbilityNode);
      out.push({
        name: node.name,
        cooldownMs: d.cooldownMs,
        gcdMs: d.gcdMs,
        manaCost: d.manaCost,
        range: d.range,
        damageType: d.damageType,
        authorityEnvelope: d.authorityEnvelope,
        castTimeMs: d.castTimeMs,
      });
    }

    return out;
  }

  /**
   * Fold `.hs` ability directives (`@cooldown 4`, `@range 30`, …) into a
   * properties map readable by {@link getAbilityDirectives}. Time-valued
   * directives are normalized to milliseconds (bare numbers = seconds).
   */
  private foldAbilityDirectives(node: GameAbilityNode): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...(node.properties ?? {}) };
    const directives =
      (node as { directives?: Array<{ type?: string; name?: string; config?: Record<string, unknown> }> })
        .directives ?? [];
    for (const dir of directives) {
      if (dir.type !== 'trait' || !dir.name) continue;
      const raw = dir.config?.value ?? dir.config?.[dir.name];
      switch (dir.name) {
        case 'cooldown':
          merged.cooldown_ms = this.parseTimeMs(raw, 0);
          break;
        case 'cast_time':
          merged.cast_time = this.parseTimeMs(raw, 0);
          break;
        case 'gcd':
          merged.gcd = this.parseTimeMs(raw, 0);
          break;
        case 'mana_cost':
          merged.mana_cost = raw;
          break;
        case 'range':
          merged.range = raw;
          break;
        case 'damage_type':
          merged.damage_type = raw;
          break;
        case 'authority':
        case 'authority_envelope':
          merged.authority = raw;
          break;
        default:
          if (raw !== undefined) merged[dir.name] = raw;
      }
    }
    return merged;
  }

  /** Parse a time value to milliseconds. Bare numbers are seconds; supports 's'/'ms'. */
  private parseTimeMs(raw: unknown, fallback: number): number {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw * 1000 : fallback;
    if (typeof raw === 'string') {
      const s = raw.trim();
      if (/ms$/i.test(s)) {
        const n = parseFloat(s);
        return Number.isFinite(n) ? n : fallback;
      }
      const n = parseFloat(s); // bare or 's' suffix → seconds
      return Number.isFinite(n) ? n * 1000 : fallback;
    }
    return fallback;
  }

  private numOr(v: unknown, fallback: number): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  }

  // =========================================================================
  // Derivation helpers
  // =========================================================================

  private deriveRoomName(composition: HoloComposition): string {
    if (composition.worlds && composition.worlds.length > 0) {
      const world = composition.worlds[0];
      if (world.name) return world.name;
    }
    if (composition.zones && composition.zones.length > 0) {
      const zone = composition.zones[0];
      if (zone.name) return zone.name;
    }
    return composition.name || 'HoloWorld';
  }

  private extractScalarTrait(
    composition: HoloComposition,
    traitName: ColyseusTraitName,
    key: string,
    fallback: number
  ): number {
    const node = this.extractNodesWithTrait(composition, traitName)[0];
    if (!node) return fallback;
    const trait = this.getTrait(node, traitName);
    if (!trait) return fallback;
    const config = trait.config ?? trait.params ?? {};
    const raw = config[key] ?? this.findObjProp(node, key);
    return this.valueToNumber(raw, fallback);
  }

  private findEventHandler(logic: HoloLogic, eventName: string): HoloEventHandler | null {
    return (
      logic.handlers.find(
        (h) =>
          h.event === eventName ||
          h.event === `on_${eventName}` ||
          h.event.includes(eventName)
      ) ?? null
    );
  }

  // =========================================================================
  // Code generation — file header
  // =========================================================================

  private emitFileHeader(compositionName: string) {
    this.push(
      `/**`,
      ` * @generated ColyseusCompiler — HoloScript BRIDGE target`,
      ` * Source composition: ${this.escapeStringValue(compositionName, 'TypeScript')}`,
      ` * Colyseus version: ${this.options.colyseusVersion}`,
      ` * DO NOT EDIT — regenerate via HoloScript compiler`,
      ` */`,
      ``
    );
  }

  // =========================================================================
  // Section 1 — Schema imports
  // =========================================================================

  private emitSchemaImports() {
    this.push(
      `// ═══════════════════════════════════════════════════════════════════`,
      `// SECTION 1 — Room State Schema (@colyseus/schema)`,
      `// ═══════════════════════════════════════════════════════════════════`,
      ``,
      `import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema';`,
      `import { Room, Client } from 'colyseus';`,
      ``
    );
  }

  // =========================================================================
  // Section 1b — Constants (tick model, movement contract, chunk manifest)
  // =========================================================================

  private emitConstants(tickModel: TickModel, movement: MovementContract) {
    this.push(
      `// ── Authoritative server constants (compiled from composition) ──────`,
      `export const TICK_RATE = ${tickModel.tickRate}; // Hz — canonical u32 tick clock`,
      `export const RNG_SEED = ${tickModel.rngSeed}; // deterministic per-room PRNG seed`,
      `export const MAX_MOVE_SPEED = ${movement.maxSpeed}; // world-units/sec (anti-speedhack ceiling)`,
      `export const MOVE_EPSILON = ${MOVE_EPSILON};`,
      `export const GAME_EVENT_RECEIPT_SCHEMA = '${MMO_EVENT_RECEIPT_SCHEMA}';`,
      ``
    );

    // World-chunk streaming manifest (lowered from composition.worldChunks)
    this.push(
      `// ── World-chunk streaming manifest (lowered from world_chunk blocks) ─`,
      `export const CHUNK_MANIFEST = ${JSON.stringify(this.chunkManifest, null, 2)} as const;`,
      ``
    );

    // Server-side ability registry (typed + imported .hs abilities)
    this.push(
      `// ── Ability registry (server-authoritative configs) ─────────────────`,
      `export const ABILITY_REGISTRY: Record<string, {`,
      `  cooldownMs: number; gcdMs: number; manaCost: number; range: number;`,
      `  damageType: string; authorityEnvelope: string; castTimeMs: number;`,
      `}> = ${JSON.stringify(this.abilityRegistryObject(), null, 2)};`,
      ``
    );
  }

  private abilityRegistryObject(): Record<string, Omit<ColyseusAbilityConfig, 'name'>> {
    const obj: Record<string, Omit<ColyseusAbilityConfig, 'name'>> = {};
    for (const a of this.abilities) {
      const { name, ...rest } = a;
      obj[name] = rest;
    }
    return obj;
  }

  // =========================================================================
  // Section 2 — Schema classes
  // =========================================================================

  private emitSchemaSection(opts: {
    npcs: NormalizedNpc[];
    spawns: NormalizedSpawn[];
    serverSideNodes: HoloObjectDecl[];
  }) {
    const { npcs, spawns, serverSideNodes } = opts;

    // ── PlayerState ──────────────────────────────────────────────────────
    this.schemaClasses.push('PlayerState');
    this.push(
      `export class PlayerState extends Schema {`,
      `  @type('string') id: string = '';`,
      `  @type('string') name: string = '';`,
      `  @type('number') x: number = 0;`,
      `  @type('number') y: number = 0;`,
      `  @type('number') z: number = 0;`,
      `  @type('number') hp: number = 100;`,
      `  @type('string') faction: string = 'none';`,
      `  @type('boolean') isReady: boolean = false;`,
      `  // Server-only (not synced): last authoritative move tick for speed validation`,
      `  lastMoveTick = 0;`,
      `}`,
      ``
    );

    // ── NpcState (brainType lowered from .holo/.hsplus brain reference) ───
    if (npcs.length > 0) {
      this.schemaClasses.push('NpcState');
      this.push(
        `export class NpcState extends Schema {`,
        `  @type('string') id: string = '';`,
        `  @type('string') type: string = 'npc';`,
        `  @type('number') x: number = 0;`,
        `  @type('number') y: number = 0;`,
        `  @type('number') z: number = 0;`,
        `  @type('number') hp: number = 100;`,
        `  @type('string') faction: string = 'none';`,
        `  @type('string') brainType: string = '';`,
        `  @type('boolean') isAlive: boolean = true;`,
        `}`,
        ``
      );
    }

    // ── SpawnPointState ──────────────────────────────────────────────────
    if (spawns.length > 0) {
      this.schemaClasses.push('SpawnPointState');
      this.push(
        `export class SpawnPointState extends Schema {`,
        `  @type('string') id: string = '';`,
        `  @type('number') x: number = 0;`,
        `  @type('number') y: number = 0;`,
        `  @type('number') z: number = 0;`,
        `  @type('string') faction: string = 'none';`,
        `  @type('boolean') occupied: boolean = false;`,
        `}`,
        ``
      );
    }

    // ── GameRoomState ────────────────────────────────────────────────────
    const serverFields = serverSideNodes.map((n) => this.jsIdentifier(n.name));
    this.schemaClasses.push('GameRoomState');
    this.push(`export class GameRoomState extends Schema {`);
    this.push(`  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();`);
    if (npcs.length > 0) {
      this.push(`  @type({ map: NpcState }) npcs = new MapSchema<NpcState>();`);
    }
    if (spawns.length > 0) {
      this.push(`  @type([SpawnPointState]) spawnPoints = new ArraySchema<SpawnPointState>();`);
    }
    this.push(`  @type('number') tickCount: number = 0; // canonical u32 server clock`);
    this.push(`  @type('string') phase: string = 'lobby';`);
    this.push(`  // Server-only deterministic PRNG state (not synced)`);
    this.push(`  rngState: number = RNG_SEED;`);
    for (const sf of serverFields) {
      this.push(`  // @server_side — not synced to clients`);
      this.push(`  ${sf}_serverOnly: unknown = null;`);
    }
    this.push(`}`, ``);
  }

  // =========================================================================
  // Section 3 — Room class
  // =========================================================================

  private emitRoomClass(opts: {
    roomClassName: string;
    maxPlayers: number;
    tickModel: TickModel;
    npcs: NormalizedNpc[];
    spawns: NormalizedSpawn[];
    joinHandler: HoloEventHandler | null;
    leaveHandler: HoloEventHandler | null;
    actionHandler: HoloEventHandler | null;
  }) {
    const {
      roomClassName,
      maxPlayers,
      tickModel,
      npcs,
      spawns,
      joinHandler,
      leaveHandler,
      actionHandler,
    } = opts;

    const patchMs = Math.round(1000 / tickModel.tickRate);

    this.push(
      `// ═══════════════════════════════════════════════════════════════════`,
      `// SECTION 2 — Room Class`,
      `// ═══════════════════════════════════════════════════════════════════`,
      ``
    );

    this.push(`export class ${roomClassName} extends Room<GameRoomState> {`);
    this.push(``);

    // ── onCreate ──────────────────────────────────────────────────────────
    this.push(`  onCreate(options: Record<string, unknown>): void {`);
    this.push(`    this.maxClients = ${maxPlayers};`);
    this.push(`    this.patchRate = ${patchMs}; // ~${tickModel.tickRate} Hz`);
    this.push(`    this.setState(new GameRoomState());`);
    this.push(`    this.state.rngState = RNG_SEED;`);
    this.push(``);

    if (npcs.length > 0) {
      this.push(`    // Seed NPC entities (typed composition.npcs ∪ trait-scan)`);
      for (const npc of npcs) {
        const id = this.jsString(npc.id);
        const v = `npc_${this.jsIdentifier(npc.id)}`;
        this.push(`    const ${v} = new NpcState();`);
        this.push(`    ${v}.id = ${id};`);
        this.push(`    ${v}.type = ${this.jsString(npc.npcType)};`);
        this.push(`    ${v}.x = ${npc.x};`);
        this.push(`    ${v}.y = ${npc.y};`);
        this.push(`    ${v}.z = ${npc.z};`);
        this.push(`    ${v}.hp = ${npc.hp};`);
        this.push(`    ${v}.faction = ${this.jsString(npc.faction)};`);
        this.push(`    ${v}.brainType = ${this.jsString(npc.brainType)};`);
        this.push(`    this.state.npcs.set(${id}, ${v});`);
        this.push(`    this.initializeBrain(${v});`);
      }
      this.push(``);
    }

    if (spawns.length > 0) {
      this.push(`    // Seed spawn points`);
      for (const sp of spawns) {
        const v = `spawn_${this.jsIdentifier(sp.id)}`;
        this.push(`    const ${v} = new SpawnPointState();`);
        this.push(`    ${v}.id = ${this.jsString(sp.id)};`);
        this.push(`    ${v}.x = ${sp.x};`);
        this.push(`    ${v}.y = ${sp.y};`);
        this.push(`    ${v}.z = ${sp.z};`);
        this.push(`    ${v}.faction = ${this.jsString(sp.faction)};`);
        this.push(`    this.state.spawnPoints.push(${v});`);
      }
      this.push(``);
    }

    this.push(`    // Authoritative simulation tick (fixed-step, canonical clock)`);
    this.push(`    this.setSimulationInterval((deltaTime) => {`);
    this.push(`      this.state.tickCount = (this.state.tickCount + 1) >>> 0;`);
    this.push(`      this.onTick(deltaTime);`);
    this.push(`    }, ${patchMs});`);
    this.push(`    void options;`);
    this.push(`  }`);
    this.push(``);

    // ── onJoin ────────────────────────────────────────────────────────────
    this.push(`  onJoin(client: Client, options: Record<string, unknown>): void {`);
    this.push(`    const player = new PlayerState();`);
    this.push(`    player.id = client.sessionId;`);
    this.push(`    player.name = (options['name'] as string) || client.sessionId;`);
    this.push(`    player.faction = (options['faction'] as string) || 'none';`);
    this.push(`    player.lastMoveTick = this.state.tickCount;`);
    this.push(``);
    if (spawns.length > 0) {
      this.push(`    const freeSpawn = this.state.spawnPoints.find((s) => !s.occupied);`);
      this.push(`    if (freeSpawn) {`);
      this.push(`      player.x = freeSpawn.x;`);
      this.push(`      player.y = freeSpawn.y;`);
      this.push(`      player.z = freeSpawn.z;`);
      this.push(`      freeSpawn.occupied = true;`);
      this.push(`    }`);
    } else {
      this.push(`    player.x = 0; player.y = 0; player.z = 0;`);
    }
    this.push(`    this.state.players.set(client.sessionId, player);`);
    if (joinHandler) {
      this.push(`    this.handlePlayerJoin(client, player, options);`);
    }
    this.push(`    console.log(\`[${roomClassName}] Player joined: \${client.sessionId}\`);`);
    this.push(`  }`);
    this.push(``);

    // ── onLeave ───────────────────────────────────────────────────────────
    this.push(`  onLeave(client: Client, wasIntentional: boolean): void {`);
    this.push(`    const player = this.state.players.get(client.sessionId);`);
    if (spawns.length > 0) {
      this.push(`    if (player) {`);
      this.push(`      const spawn = this.state.spawnPoints.find(`);
      this.push(`        (s) => s.x === player.x && s.y === player.y && s.z === player.z`);
      this.push(`      );`);
      this.push(`      if (spawn) spawn.occupied = false;`);
      this.push(`    }`);
    }
    this.push(`    this.state.players.delete(client.sessionId);`);
    if (leaveHandler) {
      this.push(`    this.handlePlayerLeave(client, wasIntentional);`);
    }
    this.push(`    console.log(\`[${roomClassName}] Player left: \${client.sessionId}\`);`);
    this.push(`  }`);
    this.push(``);

    // ── onMessage — server-authoritative ──────────────────────────────────
    this.push(`  onMessage(client: Client, type: string, message: unknown): void {`);
    this.push(`    const player = this.state.players.get(client.sessionId);`);
    this.push(`    if (!player) return;`);
    this.push(``);
    this.push(`    switch (type) {`);
    this.push(`      case 'move': {`);
    this.push(`        this.handleMove(client, player, message);`);
    this.push(`        break;`);
    this.push(`      }`);
    this.push(`      case 'chat': {`);
    this.push(`        this.broadcast('chat', { from: client.sessionId, text: message }, { except: client });`);
    this.push(`        break;`);
    this.push(`      }`);
    if (actionHandler) {
      this.push(`      case 'action': {`);
      this.push(`        this.handlePlayerAction(client, player, message);`);
      this.push(`        break;`);
      this.push(`      }`);
    }
    this.push(`      default:`);
    this.push(`        console.warn(\`[${roomClassName}] Unknown message type: \${type}\`);`);
    this.push(`    }`);
    this.push(`  }`);
    this.push(``);

    // ── handleMove — anti-speedhack validation + receipt ──────────────────
    this.push(`  // Server-authoritative movement validation (rejects speedhack/teleport).`);
    this.push(`  protected handleMove(client: Client, player: PlayerState, message: unknown): void {`);
    this.push(`    const data = message as { x?: number; y?: number; z?: number };`);
    this.push(`    const nx = typeof data.x === 'number' ? data.x : player.x;`);
    this.push(`    const ny = typeof data.y === 'number' ? data.y : player.y;`);
    this.push(`    const nz = typeof data.z === 'number' ? data.z : player.z;`);
    this.push(`    const elapsedTicks = Math.max(1, (this.state.tickCount - player.lastMoveTick) >>> 0);`);
    this.push(`    const maxDist = MAX_MOVE_SPEED * (elapsedTicks / TICK_RATE) + MOVE_EPSILON;`);
    this.push(`    const dx = nx - player.x, dy = ny - player.y, dz = nz - player.z;`);
    this.push(`    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);`);
    this.push(`    if (dist <= maxDist) {`);
    this.push(`      player.x = nx; player.y = ny; player.z = nz;`);
    this.push(`    } else {`);
    this.push(`      // Reject: keep authoritative position, reconcile client, emit receipt`);
    this.push(`      this.recordGameEvent({`);
    this.push(`        kind: 'movement_reject', actorSessionId: client.sessionId,`);
    this.push(`        amount: dist, validated: false,`);
    this.push(`        reason: \`move \${dist.toFixed(3)} > max \${maxDist.toFixed(3)}\`,`);
    this.push(`      });`);
    this.push(`      client.send('reconcile', { x: player.x, y: player.y, z: player.z });`);
    this.push(`    }`);
    this.push(`    player.lastMoveTick = this.state.tickCount;`);
    this.push(`  }`);
    this.push(``);

    // ── onTick — drives NPC brains ────────────────────────────────────────
    this.push(`  // Authoritative simulation step — advances NPC brains.`);
    this.push(`  protected onTick(_deltaTime: number): void {`);
    if (npcs.length > 0) {
      this.push(`    this.state.npcs.forEach((npc) => this.tickNpcBrain(npc));`);
    }
    this.push(`  }`);
    this.push(``);

    // ── Brain hooks ───────────────────────────────────────────────────────
    if (npcs.length > 0) {
      this.push(`  // Brain lowering — NPC.brainType names a .hsplus brain skill.`);
      this.push(`  protected initializeBrain(npc: NpcState): void {`);
      this.push(`    // Override to attach a behavior-tree / LOD-gated LLM brain runtime.`);
      this.push(`    void npc;`);
      this.push(`  }`);
      this.push(``);
      this.push(`  protected tickNpcBrain(npc: NpcState): void {`);
      this.push(`    // Override: BT tick + LOD-gated LLM call for npc.brainType.`);
      this.push(`    void npc;`);
      this.push(`  }`);
      this.push(``);
    }

    // ── recordGameEvent — canonical receipt emitter ───────────────────────
    this.push(`  // Emit a canonical game-event receipt (${MMO_EVENT_RECEIPT_SCHEMA}).`);
    this.push(`  // Server-authoritative provenance: every validated/denied action is logged.`);
    this.push(`  protected recordGameEvent(ev: {`);
    this.push(`    kind: string; actorSessionId: string; targetSessionId?: string;`);
    this.push(`    abilityId?: string; amount?: number; validated: boolean; reason?: string;`);
    this.push(`  }): void {`);
    this.push(`    const receipt = {`);
    this.push(`      schema: GAME_EVENT_RECEIPT_SCHEMA,`);
    this.push(`      receiptId: \`\${this.roomId}:\${this.state.tickCount}:\${ev.kind}:\${ev.actorSessionId}\`,`);
    this.push(`      roomId: this.roomId,`);
    this.push(`      tick: this.state.tickCount,`);
    this.push(`      kind: ev.kind,`);
    this.push(`      actor: ev.actorSessionId,`);
    this.push(`      target: ev.targetSessionId ?? null,`);
    this.push(`      abilityId: ev.abilityId ?? null,`);
    this.push(`      amount: ev.amount ?? null,`);
    this.push(`      status: ev.validated ? 'success' : 'denied',`);
    this.push(`      reason: ev.reason ?? null,`);
    this.push(`    };`);
    this.push(`    this.onGameEventReceipt(receipt);`);
    this.push(`  }`);
    this.push(``);
    this.push(`  // Override to persist receipts to a TrustLedger / NDJSON sink.`);
    this.push(`  protected onGameEventReceipt(receipt: Record<string, unknown>): void {`);
    this.push(`    void receipt;`);
    this.push(`  }`);
    this.push(``);
    this.push(`  // Deterministic per-room PRNG (xorshift32) — for loot/combat rolls.`);
    this.push(`  protected nextRandom(): number {`);
    this.push(`    let x = this.state.rngState >>> 0;`);
    this.push(`    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;`);
    this.push(`    this.state.rngState = x;`);
    this.push(`    return x / 0xffffffff;`);
    this.push(`  }`);
    this.push(``);

    // ── Logic handler stubs ───────────────────────────────────────────────
    if (joinHandler) {
      this.push(`  protected handlePlayerJoin(client: Client, player: PlayerState, options: Record<string, unknown>): void {`);
      this.push(`    void client; void player; void options;`);
      this.push(`  }`);
      this.push(``);
    }
    if (leaveHandler) {
      this.push(`  protected handlePlayerLeave(client: Client, wasIntentional: boolean): void {`);
      this.push(`    void client; void wasIntentional;`);
      this.push(`  }`);
      this.push(``);
    }
    if (actionHandler) {
      this.push(`  protected handlePlayerAction(client: Client, player: PlayerState, message: unknown): void {`);
      this.push(`    void client; void player; void message;`);
      this.push(`  }`);
      this.push(``);
    }

    this.push(`}`);
    this.push(``);
  }

  // =========================================================================
  // Section 4 — Bootstrap
  // =========================================================================

  private emitBootstrap(roomClassName: string, roomName: string) {
    const roomKey = roomName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    this.push(
      `// ═══════════════════════════════════════════════════════════════════`,
      `// SECTION 3 — app.ts Bootstrap`,
      `// ═══════════════════════════════════════════════════════════════════`,
      ``,
      `import { Server } from 'colyseus';`,
      ``,
      `export function createColyseusServer(port = 2567): Server {`,
      `  const gameServer = new Server();`,
      `  gameServer.define(${this.jsString(roomKey)}, ${roomClassName});`,
      `  void port;`,
      `  return gameServer;`,
      `}`,
      ``
    );
  }

  // =========================================================================
  // AST traversal helpers
  // =========================================================================

  private extractNodesWithTrait(astNode: unknown, traitName: string): HoloObjectDecl[] {
    return this.extractNodesWithAnyTrait(astNode, [traitName]);
  }

  private extractNodesWithAnyTrait(
    astNode: unknown,
    traitNames: readonly string[]
  ): HoloObjectDecl[] {
    const matched: HoloObjectDecl[] = [];
    const seen = new Set<HoloObjectDecl>();
    const cleanNames = new Set(traitNames.map((n) => this.cleanTraitName(n)));

    const traverse = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const item of node) traverse(item);
        return;
      }
      if (!node || typeof node !== 'object') return;
      const record = node as Record<string, unknown>;
      if (
        this.isObjectDecl(record) &&
        this.nodeHasAnyTrait(record, cleanNames) &&
        !seen.has(record)
      ) {
        matched.push(record);
        seen.add(record);
      }
      for (const value of Object.values(record)) {
        if (value && typeof value === 'object') traverse(value);
      }
    };

    traverse(astNode);
    return matched;
  }

  private cleanTraitName(traitName: string): string {
    return traitName.startsWith('@') ? traitName.slice(1) : traitName;
  }

  private isObjectDecl(
    record: Record<string, unknown>
  ): record is Record<string, unknown> & HoloObjectDecl {
    return (
      (record.type === 'Object' || record.type === 'ObjectDecl') &&
      typeof record.name === 'string' &&
      Array.isArray(record.traits) &&
      Array.isArray(record.properties)
    );
  }

  private nodeHasAnyTrait(node: HoloObjectDecl, traitNames: ReadonlySet<string>): boolean {
    return node.traits.some((trait) =>
      traitNames.has(this.cleanTraitName(String(trait.name)))
    );
  }

  private getTrait(node: HoloObjectDecl, traitName: string): HoloObjectTrait | undefined {
    const clean = this.cleanTraitName(traitName);
    return node.traits.find((t) => this.cleanTraitName(String(t.name)) === clean);
  }

  private findObjProp(node: HoloObjectDecl, key: string): HoloValue | undefined {
    return node.properties.find((p) => p.key === key)?.value;
  }

  private resolveNpcType(node: HoloObjectDecl): string {
    if (this.nodeHasAnyTrait(node, new Set(['boss']))) return 'boss';
    if (this.nodeHasAnyTrait(node, new Set(['mmo_entity']))) return 'entity';
    return 'npc';
  }

  private objectPosition(node: HoloObjectDecl): { x: number; y: number; z: number } {
    const raw = this.findObjProp(node, 'position');
    return this.valueToVector(raw, { x: 0, y: 0, z: 0 });
  }

  private positionToVector(pos: HoloPosition | undefined): { x: number; y: number; z: number } {
    if (!pos) return { x: 0, y: 0, z: 0 };
    const rec = pos as unknown as Record<string, unknown>;
    return {
      x: this.valueToNumber(rec['x'] as HoloValue, 0),
      y: this.valueToNumber(rec['y'] as HoloValue, 0),
      z: this.valueToNumber(rec['z'] as HoloValue, 0),
    };
  }

  private valueToVector(
    value: HoloValue | undefined,
    fallback: { x: number; y: number; z: number }
  ): { x: number; y: number; z: number } {
    if (Array.isArray(value)) {
      return {
        x: this.valueToNumber(value[0], fallback.x),
        y: this.valueToNumber(value[1], fallback.y),
        z: this.valueToNumber(value[2], fallback.z),
      };
    }
    if (value && typeof value === 'object' && !Array.isArray(value) && !('__bind' in value)) {
      return {
        x: this.valueToNumber(value['x'], fallback.x),
        y: this.valueToNumber(value['y'], fallback.y),
        z: this.valueToNumber(value['z'], fallback.z),
      };
    }
    return fallback;
  }

  private valueToNumber(value: HoloValue | undefined, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
  }

  private valueToString(value: HoloValue | undefined, fallback: string): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return fallback;
  }

  // =========================================================================
  // String / identifier helpers
  // =========================================================================

  private jsString(value: string): string {
    return `'${this.escapeStringValue(value, 'TypeScript')}'`;
  }

  private jsIdentifier(value: string): string {
    const safe = value.replace(/[^A-Za-z0-9_$]/g, '_').replace(/^[^A-Za-z_$]+/, '');
    return safe || 'node';
  }

  private jsClassName(value: string): string {
    return value
      .split(/[-_\s]+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }

  // =========================================================================
  // Emit helper
  // =========================================================================

  private push(...lines: string[]): void {
    for (const line of lines) this.lines.push(line);
  }

  // =========================================================================
  // Result
  // =========================================================================

  private buildResult(roomClassName: string): ColyseusCompilationResult {
    return {
      success: this.errors.length === 0,
      code: this.lines.join('\n'),
      roomClassName,
      schemaClasses: [...this.schemaClasses],
      chunkManifest: [...this.chunkManifest],
      abilities: [...this.abilities],
      warnings: [...this.warnings],
      errors: [...this.errors],
    };
  }
}

export default ColyseusCompiler;
