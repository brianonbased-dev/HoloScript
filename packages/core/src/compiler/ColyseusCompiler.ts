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
import type { HoloBrainDecl } from '../parser/HoloScriptPlusParser';
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

export interface ColyseusLootEntry {
  itemId: string;
  weight: number;
  qty: string | number;
  rarity: string;
}

export interface ColyseusLootTable {
  name: string;
  entries: ColyseusLootEntry[];
  guaranteed: Record<string, unknown>;
}

/**
 * A compile-time guard parsed from a brain transition `@when { hp < 0.5 }`.
 * `hp` = HP fraction (hp/maxHp). `timer` = seconds since the current phase/state
 * was entered (drives boss enrage timers — P2.1).
 */
export interface ColyseusBrainGuard {
  field: 'hp' | 'timer';
  op: '<' | '>' | '<=' | '>=' | '==';
  value: number;
}

export interface ColyseusBrainState {
  name: string;
  transitions: Array<{ to: string; guard: ColyseusBrainGuard | null }>;
  actions: string[];
}

/** Verbal fingerprint baked from a @verbal_fingerprint trait in the .hsplus brain. */
export interface ColyseusBrainVerbalFingerprint {
  /** Target tone: formal, casual, archaic, cryptic, etc. */
  tone: string;
  /** Phrases the LLM must NOT emit (injected as a hard constraint into the system prompt). */
  forbiddenPhrases: string[];
  /** Phrases the LLM SHOULD include at least once (injected as a soft constraint). */
  requiredPhrases: string[];
}

/** Autonomous agenda baked from a @autonomous_agenda trait in the .hsplus brain. */
export interface ColyseusBrainAgenda {
  /** High-level NPC goals injected into the system prompt as narrative motivation. */
  goals: string[];
}

export interface ColyseusBrainConfig {
  name: string;
  brainType: 'behavior_tree' | 'decision_tree' | 'neural' | 'scripted';
  /** True when this brain decides via a local LLM (Jetson) rather than pure FSM. */
  isLLM: boolean;
  personality: string;
  factionAlignment: string;
  fleeThreshold: number;
  patrolSpeed: number;
  preferredAbility: string | null;
  initialState: string;
  states: ColyseusBrainState[];
  /** P2.1: true when the brain has @boss — phase transitions emit a receipt + broadcast. */
  isBoss: boolean;
  /** P1.9: verbal style constraints from @verbal_fingerprint (null when not declared). */
  verbalFingerprint: ColyseusBrainVerbalFingerprint | null;
  /** P1.9: autonomous motivation from @autonomous_agenda (null when not declared). */
  autonomousAgenda: ColyseusBrainAgenda | null;
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
  /** Server-authoritative loot tables (from composition.lootTables) */
  lootTables: ColyseusLootTable[];
  /** Area-of-interest replication radius (world-units) */
  aoiRadius: number;
  /** Lowered NPC brains (from imported .hsplus brain declarations) */
  brains: ColyseusBrainConfig[];
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
/** Default area-of-interest replication radius (world-units) when no @aoi_bubble present. */
const DEFAULT_AOI_RADIUS = 50;
/**
 * Minimum ticks between LLM calls per NPC (LOD-gated budget). Mirrors the
 * CavemanDriveTrait 200-tick safety valve (P0.7): ≈1 LLM call/sec across a
 * ~50-NPC fleet stays within a single Jetson qwen3:4b throughput budget.
 */
const LLM_BUDGET_TICKS = 200;

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
  private lootTables: ColyseusLootTable[] = [];
  private aoiRadius = 0;
  private brains: ColyseusBrainConfig[] = [];

  /** Imported .hs ability nodes (populated by compileSource before compile). */
  private importedAbilities: GameAbilityNode[] = [];
  /** Imported .hsplus brain skill names (populated by compileSource before compile). */
  private importedBrains: Set<string> = new Set();
  /** Imported .hsplus brain declarations (structured — populated by compileSource). */
  private importedBrainDecls: HoloBrainDecl[] = [];

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
    this.lootTables = [];
    this.aoiRadius = 0;
    this.brains = [];

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

    // ── World chunks + abilities + loot + AOI + brains (typed + imported) ─
    this.chunkManifest = this.buildChunkManifest(composition);
    this.abilities = this.buildAbilityRegistry(composition);
    this.lootTables = this.buildLootTables(composition);
    this.aoiRadius = this.resolveAoi(composition);
    this.brains = this.buildBrainRegistry();

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
    this.importedBrainDecls = [];
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
          await this.ingestBrains(text, importSource, resolutionWarnings);
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

  private async ingestBrains(text: string, file: string, warnings: string[]): Promise<void> {
    // Parse the .hsplus into structured brain declarations (HoloBrainDecl) so the
    // compiler can lower NPC brains into a real FSM tick + LLM decision path.
    try {
      const { HoloScriptPlusParser } = await import('../parser/HoloScriptPlusParser');
      const parser = new HoloScriptPlusParser({ enableTypeScriptImports: false });
      const result = parser.parse(text);
      const decls = this.collectBrainDecls(result);
      for (const decl of decls) {
        this.importedBrains.add(decl.name);
        this.importedBrainDecls.push(decl);
      }
      if (decls.length === 0) {
        // Fall back to a name-only scan so NPC `brain:` refs still resolve.
        const re = /\bbrain\s+([A-Za-z_][A-Za-z0-9_]*)/g;
        let m: RegExpExecArray | null;
        let found = 0;
        while ((m = re.exec(text)) !== null) {
          this.importedBrains.add(m[1]);
          found++;
        }
        if (found === 0) warnings.push(`No brain declarations found in '${file}'.`);
      }
    } catch (err) {
      warnings.push(
        `Failed to parse .hsplus import '${file}': ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /** Collect type:'brain' HoloBrainDecl nodes from an HSPlus parse result. */
  private collectBrainDecls(result: unknown): HoloBrainDecl[] {
    const out: HoloBrainDecl[] = [];
    const seen = new Set<unknown>();
    const visit = (node: unknown): void => {
      if (!node || typeof node !== 'object' || seen.has(node)) return;
      seen.add(node);
      const rec = node as Record<string, unknown>;
      if (rec.type === 'brain' && typeof rec.name === 'string') {
        out.push(node as unknown as HoloBrainDecl);
      }
      for (const v of Object.values(rec)) {
        if (Array.isArray(v)) v.forEach(visit);
        else if (v && typeof v === 'object') visit(v);
      }
    };
    visit((result as { ast?: unknown }).ast ?? result);
    return out;
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

  /** Area-of-interest replication radius from @aoi_bubble (world-units). */
  private resolveAoi(composition: HoloComposition): number {
    const r = this.readRootTraitNumber(
      composition,
      ['aoi_bubble', 'aoi', 'interest'],
      ['radius', 'range', 'distance']
    );
    return r && r > 0 ? r : DEFAULT_AOI_RADIUS;
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

  /** Lower composition.lootTables → server-rollable weighted tables. */
  private buildLootTables(composition: HoloComposition): ColyseusLootTable[] {
    return (composition.lootTables ?? []).map((table) => ({
      name: table.name,
      entries: (table.entries ?? []).map((e) => ({
        // Empty itemId = a "nothing" entry (weight-only) — rollLoot drops nothing.
        itemId: e.itemId ?? '',
        weight: typeof e.weight === 'number' && e.weight > 0 ? e.weight : 1,
        qty: e.qty ?? 1,
        rarity: e.rarity ?? 'common',
      })),
      guaranteed: (table.guaranteed as Record<string, unknown>) ?? {},
    }));
  }

  /**
   * Lower imported .hsplus brain declarations → server brain configs (P1.3/P1.4).
   * A brain whose type is 'neural' (or whose provider policy prefers local) is an
   * LLM brain (decides via the Jetson endpoint); otherwise it runs a pure-math FSM.
   */
  private buildBrainRegistry(): ColyseusBrainConfig[] {
    const out: ColyseusBrainConfig[] = [];
    const seen = new Set<string>();
    for (const decl of this.importedBrainDecls) {
      if (seen.has(decl.name)) continue;
      seen.add(decl.name);
      const states: ColyseusBrainState[] = (decl.states ?? []).map((s) => ({
        name: s.name,
        transitions: (s.transitions ?? []).map((t) => ({
          to: t.to,
          guard: this.parseBrainGuard(t.when, decl.fleeThreshold),
        })),
        actions: Array.isArray(s.actions) ? s.actions.slice() : [],
      }));
      const provider = decl.providerPolicy?.prefer ?? '';
      const isLLM =
        decl.brainType === 'neural' ||
        provider === 'local' ||
        provider === 'ollama' ||
        Boolean((decl.traits ?? {})['local_llm_brain']);

      // P1.9 — extract @verbal_fingerprint and @autonomous_agenda from generic trait bag.
      const verbalFingerprint = this.extractVerbalFingerprint((decl.traits ?? {})['verbal_fingerprint']);
      const autonomousAgenda = this.extractAutonomousAgenda((decl.traits ?? {})['autonomous_agenda']);

      // P2.1 — @boss marks a multi-phase encounter: state changes emit a
      // boss_phase_transition receipt + broadcast (regular NPC FSM churn does not).
      const t = decl.traits ?? {};
      const isBoss = Boolean(t['boss'] || t['boss_fight'] || t['boss_phases'] || t['raid_boss']);

      out.push({
        name: decl.name,
        brainType: decl.brainType ?? 'behavior_tree',
        isLLM,
        personality: decl.personality ?? 'neutral',
        factionAlignment: decl.factionAlignment ?? 'none',
        fleeThreshold: typeof decl.fleeThreshold === 'number' ? decl.fleeThreshold : 0,
        patrolSpeed: this.numOr(decl.patrolSpeed, 1),
        preferredAbility: decl.preferredAbility?.name ?? null,
        initialState: states[0]?.name ?? 'idle',
        states,
        isBoss,
        verbalFingerprint,
        autonomousAgenda,
      });
    }
    return out;
  }

  /**
   * Parse a transition `@when` string into a typed guard.
   *   hp guards:    "hp < 0.5", "hp_ratio <= 0.2", "hp < flee_threshold"  → field 'hp' (fraction)
   *   timer guards: "timer > 60", "time >= 30", "phase_time > 45"          → field 'timer' (seconds)
   * Timer = seconds since the current phase/state was entered (boss enrage — P2.1).
   */
  private parseBrainGuard(
    when: string | undefined,
    fleeThreshold: number | undefined
  ): ColyseusBrainGuard | null {
    if (!when || typeof when !== 'string') return null;
    const m = when.trim().match(/^([A-Za-z_][\w]*)\s*(<=|>=|<|>|==)\s*([A-Za-z_][\w]*|[\d.]+)\s*$/);
    if (!m) return null;
    const lhs = m[1];
    const op = m[2] as ColyseusBrainGuard['op'];
    const rhs = m[3];

    let field: ColyseusBrainGuard['field'];
    if (lhs === 'hp' || lhs === 'hp_ratio' || lhs === 'health') field = 'hp';
    else if (lhs === 'timer' || lhs === 'time' || lhs === 'phase_time' || lhs === 'enrage') field = 'timer';
    else return null; // unknown LHS field (single-file scope)

    let value: number;
    if (/^[\d.]+$/.test(rhs)) {
      value = parseFloat(rhs);
    } else if (field === 'hp' && (rhs === 'flee_threshold' || rhs === 'fleeThreshold')) {
      value = typeof fleeThreshold === 'number' ? fleeThreshold : 0;
    } else {
      return null; // unknown RHS symbol
    }
    return Number.isFinite(value) ? { field, op, value } : null;
  }

  /**
   * P1.9 — Extract @verbal_fingerprint trait config from the generic brain trait bag.
   *
   * The .hsplus parser stores unknown directives as `brain.traits[dirName] = config`.
   * `@verbal_fingerprint { tone: "archaic", forbidden_phrases: [...], required_phrases: [...] }`
   * lands in `brain.traits['verbal_fingerprint']` as a plain object. We normalise it here.
   */
  private extractVerbalFingerprint(raw: unknown): ColyseusBrainVerbalFingerprint | null {
    if (!raw || typeof raw !== 'object') return null;
    const cfg = raw as Record<string, unknown>;
    const tone = typeof cfg['tone'] === 'string' ? cfg['tone'] : 'neutral';
    const forbidden = Array.isArray(cfg['forbidden_phrases'])
      ? (cfg['forbidden_phrases'] as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
    const required = Array.isArray(cfg['required_phrases'])
      ? (cfg['required_phrases'] as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
    // Return null only when every field is empty/default (caller declared the trait but left it blank)
    if (tone === 'neutral' && forbidden.length === 0 && required.length === 0) return null;
    return { tone, forbiddenPhrases: forbidden, requiredPhrases: required };
  }

  /**
   * P1.9 — Extract @autonomous_agenda trait config from the generic brain trait bag.
   *
   * `@autonomous_agenda { goals: ["find food", "avoid player"] }` lands in
   * `brain.traits['autonomous_agenda']` as a plain object. We pull the goals array.
   */
  private extractAutonomousAgenda(raw: unknown): ColyseusBrainAgenda | null {
    if (!raw || typeof raw !== 'object') return null;
    const cfg = raw as Record<string, unknown>;
    const goals = Array.isArray(cfg['goals'])
      ? (cfg['goals'] as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
    return goals.length > 0 ? { goals } : null;
  }

  private brainRegistryObject(): Record<string, Omit<ColyseusBrainConfig, 'name'>> {
    const obj: Record<string, Omit<ColyseusBrainConfig, 'name'>> = {};
    for (const b of this.brains) {
      const { name, ...rest } = b;
      obj[name] = rest;
    }
    return obj;
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
      `export const AOI_RADIUS = ${this.aoiRadius}; // area-of-interest replication radius`,
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

    // Server-authoritative loot tables (lowered from loot_table blocks)
    this.push(
      `// ── Loot tables (server-rolled via deterministic PRNG — dupe-proof) ──`,
      `export const LOOT_TABLES: Record<string, {`,
      `  entries: Array<{ itemId: string; weight: number; qty: string | number; rarity: string }>;`,
      `  guaranteed: Record<string, unknown>;`,
      `}> = ${JSON.stringify(this.lootTableObject(), null, 2)};`,
      ``
    );

    // NPC brain registry (lowered from .hsplus brain declarations)
    this.push(
      `// ── NPC brains (FSM + optional LOD-gated local-LLM decision) ────────`,
      `export const LLM_BUDGET_TICKS = ${LLM_BUDGET_TICKS}; // min ticks between LLM calls per NPC`,
      `export const JETSON_OLLAMA_ENV = 'JETSON_OLLAMA_URL'; // never hardcode the IP (W.733/F.106)`,
      `export const BRAIN_REGISTRY: Record<string, {`,
      `  brainType: string; isLLM: boolean; isBoss: boolean; personality: string; factionAlignment: string;`,
      `  fleeThreshold: number; patrolSpeed: number; preferredAbility: string | null;`,
      `  initialState: string;`,
      `  states: Array<{ name: string; transitions: Array<{ to: string;`,
      `    guard: { field: 'hp' | 'timer'; op: '<' | '>' | '<=' | '>=' | '=='; value: number } | null }>;`,
      `    actions: string[] }>;`,
      `  /** P1.9: verbal style constraints (null when @verbal_fingerprint not declared). */`,
      `  verbalFingerprint: { tone: string; forbiddenPhrases: string[]; requiredPhrases: string[] } | null;`,
      `  /** P1.9: autonomous motivation (null when @autonomous_agenda not declared). */`,
      `  autonomousAgenda: { goals: string[] } | null;`,
      `}> = ${JSON.stringify(this.brainRegistryObject(), null, 2)};`,
      ``
    );
  }

  private lootTableObject(): Record<string, Omit<ColyseusLootTable, 'name'>> {
    const obj: Record<string, Omit<ColyseusLootTable, 'name'>> = {};
    for (const t of this.lootTables) {
      const { name, ...rest } = t;
      obj[name] = rest;
    }
    return obj;
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
      `  @type('number') mana: number = 100;`,
      `  @type('string') faction: string = 'none';`,
      `  @type('boolean') isReady: boolean = false;`,
      `  // Server-only (not synced): movement + ability authority bookkeeping`,
      `  lastMoveTick = 0;`,
      `  gcdUntilTick = 0;`,
      `  cooldowns: Record<string, number> = {};`,
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
        `  @type('number') maxHp: number = 100;`,
        `  @type('string') faction: string = 'none';`,
        `  @type('string') brainType: string = '';`,
        `  @type('string') brainState: string = 'idle'; // current FSM state / boss phase`,
        `  @type('boolean') isAlive: boolean = true;`,
        `  // Server-only brain bookkeeping (not synced)`,
        `  brainTick = 0;`,
        `  lastLlmTick = -1e9;`,
        `  ticksSincePhaseEntry = 0; // P2.1: drives boss enrage timers`,
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
        this.push(`    ${v}.maxHp = ${npc.hp};`);
        this.push(`    ${v}.faction = ${this.jsString(npc.faction)};`);
        this.push(`    ${v}.brainType = ${this.jsString(npc.brainType)};`);
        this.push(`    ${v}.brainState = (BRAIN_REGISTRY[${this.jsString(npc.brainType)}]?.initialState) ?? 'idle';`);
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
    if (this.abilities.length > 0) {
      this.push(`      case 'cast': {`);
      this.push(`        this.handleCast(client, player, message);`);
      this.push(`        break;`);
      this.push(`      }`);
    }
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

    // ── handleCast — server-authoritative ability validation (P1.0/P1.7) ──
    if (this.abilities.length > 0) {
      this.push(`  // Server-authoritative ability cast: validates GCD, cooldown, range, mana`);
      this.push(`  // against ABILITY_REGISTRY before applying. Every outcome is receipted.`);
      this.push(`  protected handleCast(client: Client, player: PlayerState, message: unknown): void {`);
      this.push(`    const data = message as { ability?: string; target?: string };`);
      this.push(`    const abilityId = typeof data.ability === 'string' ? data.ability : '';`);
      this.push(`    const cfg = ABILITY_REGISTRY[abilityId];`);
      this.push(`    const reject = (reason: string): void => {`);
      this.push(`      this.recordGameEvent({`);
      this.push(`        kind: 'ability_cast', actorSessionId: client.sessionId,`);
      this.push(`        targetSessionId: data.target, abilityId, validated: false, reason,`);
      this.push(`      });`);
      this.push(`      client.send('cast_rejected', { ability: abilityId, reason });`);
      this.push(`    };`);
      this.push(`    if (!cfg) { reject('unknown_ability'); return; }`);
      this.push(`    // Global cooldown gate`);
      this.push(`    if (this.state.tickCount < player.gcdUntilTick) { reject('gcd_active'); return; }`);
      this.push(`    // Per-ability cooldown gate`);
      this.push(`    const last = player.cooldowns[abilityId] ?? -1e9;`);
      this.push(`    const cdTicks = (cfg.cooldownMs / 1000) * TICK_RATE;`);
      this.push(`    if (this.state.tickCount - last < cdTicks) { reject('on_cooldown'); return; }`);
      this.push(`    // Mana gate`);
      this.push(`    if (player.mana < cfg.manaCost) { reject('insufficient_mana'); return; }`);
      this.push(`    // Range gate (against a named target player)`);
      this.push(`    if (cfg.range > 0 && data.target) {`);
      this.push(`      const tgt = this.state.players.get(data.target);`);
      this.push(`      if (tgt) {`);
      this.push(`        const dx = tgt.x - player.x, dy = tgt.y - player.y, dz = tgt.z - player.z;`);
      this.push(`        if (Math.sqrt(dx * dx + dy * dy + dz * dz) > cfg.range + MOVE_EPSILON) {`);
      this.push(`          reject('out_of_range'); return;`);
      this.push(`        }`);
      this.push(`      }`);
      this.push(`    }`);
      this.push(`    // Accept: spend resources, set cooldowns, receipt, broadcast`);
      this.push(`    player.mana -= cfg.manaCost;`);
      this.push(`    player.cooldowns[abilityId] = this.state.tickCount;`);
      this.push(`    player.gcdUntilTick = this.state.tickCount + Math.ceil((cfg.gcdMs / 1000) * TICK_RATE);`);
      this.push(`    this.recordGameEvent({`);
      this.push(`      kind: 'ability_cast', actorSessionId: client.sessionId,`);
      this.push(`      targetSessionId: data.target, abilityId, validated: true,`);
      this.push(`    });`);
      this.push(`    this.broadcast('cast', { caster: client.sessionId, ability: abilityId, target: data.target ?? null });`);
      this.push(`  }`);
      this.push(``);
    }

    // ── rollLoot — server-authoritative deterministic loot (P1.6) ─────────
    if (this.lootTables.length > 0) {
      this.push(`  // Server-rolled loot using the deterministic per-room PRNG (dupe-proof).`);
      this.push(`  protected rollLoot(tableName: string): Array<{ item: string; qty: string | number }> {`);
      this.push(`    const table = LOOT_TABLES[tableName];`);
      this.push(`    if (!table) return [];`);
      this.push(`    const drops: Array<{ item: string; qty: string | number }> = [];`);
      this.push(`    for (const [item, qty] of Object.entries(table.guaranteed)) {`);
      this.push(`      drops.push({ item, qty: qty as string | number });`);
      this.push(`    }`);
      this.push(`    const total = table.entries.reduce((s, e) => s + e.weight, 0);`);
      this.push(`    if (total > 0 && table.entries.length > 0) {`);
      this.push(`      let r = this.nextRandom() * total;`);
      this.push(`      for (const e of table.entries) {`);
      this.push(`        r -= e.weight;`);
      this.push(`        if (r <= 0) { if (e.itemId) drops.push({ item: e.itemId, qty: e.qty }); break; }`);
      this.push(`      }`);
      this.push(`    }`);
      this.push(`    return drops;`);
      this.push(`  }`);
      this.push(``);
    }

    // ── Area-of-interest query helpers (P1.1) ─────────────────────────────
    this.push(`  // Entities within the AOI bubble of a player (interest management).`);
    this.push(`  protected playersInAOI(origin: PlayerState, radius = AOI_RADIUS): PlayerState[] {`);
    this.push(`    const out: PlayerState[] = [];`);
    this.push(`    const r2 = radius * radius;`);
    this.push(`    this.state.players.forEach((p) => {`);
    this.push(`      const dx = p.x - origin.x, dy = p.y - origin.y, dz = p.z - origin.z;`);
    this.push(`      if (dx * dx + dy * dy + dz * dz <= r2) out.push(p);`);
    this.push(`    });`);
    this.push(`    return out;`);
    this.push(`  }`);
    this.push(``);
    if (npcs.length > 0) {
      this.push(`  protected npcsInAOI(origin: PlayerState, radius = AOI_RADIUS): NpcState[] {`);
      this.push(`    const out: NpcState[] = [];`);
      this.push(`    const r2 = radius * radius;`);
      this.push(`    this.state.npcs.forEach((n) => {`);
      this.push(`      const dx = n.x - origin.x, dy = n.y - origin.y, dz = n.z - origin.z;`);
      this.push(`      if (dx * dx + dy * dy + dz * dz <= r2) out.push(n);`);
      this.push(`    });`);
      this.push(`    return out;`);
      this.push(`  }`);
      this.push(``);
    }

    // ── onTick — drives NPC brains ────────────────────────────────────────
    this.push(`  // Authoritative simulation step — advances NPC brains.`);
    this.push(`  protected onTick(_deltaTime: number): void {`);
    if (npcs.length > 0) {
      this.push(`    this.state.npcs.forEach((npc) => this.tickNpcBrain(npc));`);
    }
    this.push(`  }`);
    this.push(``);

    // ── Brain hooks — FSM tick + LOD-gated local-LLM decision (P1.3/P1.4) ──
    if (npcs.length > 0) {
      this.push(`  // Brain lowering (P1.3) — runs the .hsplus brain FSM for this NPC.`);
      this.push(`  protected initializeBrain(npc: NpcState): void {`);
      this.push(`    this.onBrainHydrate(npc); // P1.5: load durable brain memory on spawn`);
      this.push(`  }`);
      this.push(``);
      this.push(`  protected tickNpcBrain(npc: NpcState): void {`);
      this.push(`    const brain = BRAIN_REGISTRY[npc.brainType];`);
      this.push(`    if (!brain || !npc.isAlive) return;`);
      this.push(`    npc.brainTick = (npc.brainTick + 1) >>> 0;`);
      this.push(`    npc.ticksSincePhaseEntry = (npc.ticksSincePhaseEntry + 1) >>> 0;`);
      this.push(`    const hpFrac = npc.maxHp > 0 ? npc.hp / npc.maxHp : 0;`);
      this.push(`    const timerSec = npc.ticksSincePhaseEntry / TICK_RATE;`);
      this.push(`    const prevState = npc.brainState;`);
      this.push(``);
      this.push(`    // Universal flee reflex (pure-math, no LLM) — else evaluate phase/state transitions`);
      this.push(`    if (brain.fleeThreshold > 0 && hpFrac < brain.fleeThreshold) {`);
      this.push(`      npc.brainState = 'flee';`);
      this.push(`    } else {`);
      this.push(`      const state = brain.states.find((s) => s.name === npc.brainState);`);
      this.push(`      if (state) {`);
      this.push(`        for (const tr of state.transitions) {`);
      this.push(`          if (this.brainGuardPasses(tr.guard, hpFrac, timerSec)) { npc.brainState = tr.to; break; }`);
      this.push(`        }`);
      this.push(`      }`);
      this.push(`    }`);
      this.push(``);
      this.push(`    // P2.1 — phase/state transition: reset the phase timer; for bosses, the`);
      this.push(`    // transition is an authoritative, auditable event (receipt + client broadcast).`);
      this.push(`    if (npc.brainState !== prevState) {`);
      this.push(`      npc.ticksSincePhaseEntry = 0;`);
      this.push(`      if (brain.isBoss) {`);
      this.push(`        this.recordGameEvent({`);
      this.push(`          kind: 'boss_phase_transition', actorSessionId: npc.id,`);
      this.push(`          validated: true, reason: \`\${prevState}->\${npc.brainState}\`,`);
      this.push(`        });`);
      this.push(`        this.broadcast('boss_phase', { boss: npc.id, phase: npc.brainState, from: prevState });`);
      this.push(`      }`);
      this.push(`    }`);
      this.push(``);
      this.push(`    if (npc.brainState === 'flee') { this.applyBrainAction(npc, 'flee'); return; }`);
      this.push(``);
      this.push(`    // LOD-gated, budget-gated local-LLM decision (P1.4) — only LLM brains,`);
      this.push(`    // only near a player, only within the per-NPC call budget.`);
      this.push(`    if (brain.isLLM && this.npcIsNearPlayer(npc) &&`);
      this.push(`        npc.brainTick - npc.lastLlmTick >= LLM_BUDGET_TICKS) {`);
      this.push(`      npc.lastLlmTick = npc.brainTick;`);
      this.push(`      void this.decideLLM(npc); // async, fire-and-forget`);
      this.push(`    } else {`);
      this.push(`      // Pure-math fallback: run the current state's first action`);
      this.push(`      const next = brain.states.find((s) => s.name === npc.brainState);`);
      this.push(`      this.applyBrainAction(npc, next?.actions[0] ?? npc.brainState);`);
      this.push(`    }`);
      this.push(`  }`);
      this.push(``);
      this.push(`  protected brainGuardPasses(`);
      this.push(`    guard: { field: 'hp' | 'timer'; op: string; value: number } | null,`);
      this.push(`    hpFrac: number,`);
      this.push(`    timerSec: number,`);
      this.push(`  ): boolean {`);
      this.push(`    if (!guard) return true; // unconditional transition`);
      this.push(`    const lhs = guard.field === 'hp' ? hpFrac : timerSec;`);
      this.push(`    switch (guard.op) {`);
      this.push(`      case '<': return lhs < guard.value;`);
      this.push(`      case '>': return lhs > guard.value;`);
      this.push(`      case '<=': return lhs <= guard.value;`);
      this.push(`      case '>=': return lhs >= guard.value;`);
      this.push(`      case '==': return lhs === guard.value;`);
      this.push(`      default: return false;`);
      this.push(`    }`);
      this.push(`  }`);
      this.push(``);
      this.push(`  protected npcIsNearPlayer(npc: NpcState): boolean {`);
      this.push(`    const r2 = AOI_RADIUS * AOI_RADIUS;`);
      this.push(`    let near = false;`);
      this.push(`    this.state.players.forEach((p) => {`);
      this.push(`      if (near) return;`);
      this.push(`      const dx = p.x - npc.x, dy = p.y - npc.y, dz = p.z - npc.z;`);
      this.push(`      if (dx * dx + dy * dy + dz * dz <= r2) near = true;`);
      this.push(`    });`);
      this.push(`    return near;`);
      this.push(`  }`);
      this.push(``);
      this.push(`  // Local-LLM decision via the Jetson endpoint (env-resolved, never a literal IP).`);
      this.push(`  // No-op when JETSON_OLLAMA_URL is unset so the server runs cloud-free by default.`);
      this.push(`  // P1.9: system prompt enriched with @verbal_fingerprint (tone, forbidden/required`);
      this.push(`  // phrases) and @autonomous_agenda (daily goals) baked from the .hsplus brain decl.`);
      this.push(`  protected async decideLLM(npc: NpcState): Promise<void> {`);
      this.push(`    const base = process.env[JETSON_OLLAMA_ENV];`);
      this.push(`    if (!base) return;`);
      this.push(`    const brain = BRAIN_REGISTRY[npc.brainType];`);
      this.push(`    if (!brain) return;`);
      this.push(`    try {`);
      this.push(`      // ── Build system prompt (P1.9: verbal fingerprint + autonomous agenda) ──`);
      this.push(`      const basePart = \`You are \${brain.personality} NPC '\${npc.id}' (faction \${npc.faction}). State: \${npc.brainState}, hp \${npc.hp}/\${npc.maxHp}.\`;`);
      this.push(`      const tonePart = brain.verbalFingerprint`);
      this.push(`        ? \` Speak in a \${brain.verbalFingerprint.tone} tone.\``);
      this.push(`        : '';`);
      this.push(`      const forbidPart = brain.verbalFingerprint?.forbiddenPhrases.length`);
      this.push(`        ? \` Never say: \${brain.verbalFingerprint.forbiddenPhrases.map((p) => \`"\${p}"\`).join(', ')}.\``);
      this.push(`        : '';`);
      this.push(`      const requirePart = brain.verbalFingerprint?.requiredPhrases.length`);
      this.push(`        ? \` Include at least one of: \${brain.verbalFingerprint.requiredPhrases.map((p) => \`"\${p}"\`).join(', ')}.\``);
      this.push(`        : '';`);
      this.push(`      const goalPart = brain.autonomousAgenda?.goals.length`);
      this.push(`        ? \` Your current goals: \${brain.autonomousAgenda.goals.join('; ')}.\``);
      this.push(`        : '';`);
      this.push(`      const systemContent = \`\${basePart}\${tonePart}\${forbidPart}\${requirePart}\${goalPart} Reply with ONE action verb.\`;`);
      this.push(`      const resp = await fetch(\`\${base}/api/chat\`, {`);
      this.push(`        method: 'POST',`);
      this.push(`        headers: { 'Content-Type': 'application/json' },`);
      this.push(`        body: JSON.stringify({`);
      this.push(`          model: process.env.JETSON_MODEL ?? 'qwen3:4b',`);
      this.push(`          stream: false,`);
      this.push(`          messages: [`);
      this.push(`            { role: 'system', content: systemContent },`);
      this.push(`            { role: 'user', content: 'What do you do?' },`);
      this.push(`          ],`);
      this.push(`        }),`);
      this.push(`      });`);
      this.push(`      const data = (await resp.json()) as { message?: { content?: string } };`);
      this.push(`      const verb = (data.message?.content ?? '').trim().split(/\\s+/)[0]?.toLowerCase();`);
      this.push(`      if (verb) this.applyBrainAction(npc, verb);`);
      this.push(`    } catch {`);
      this.push(`      // Edge brain unreachable — fall back to FSM next tick.`);
      this.push(`    }`);
      this.push(`  }`);
      this.push(``);
      this.push(`  // Override to map a brain action/verb onto NPC movement/animation/ability.`);
      this.push(`  protected applyBrainAction(npc: NpcState, action: string): void {`);
      this.push(`    void npc; void action;`);
      this.push(`  }`);
      this.push(``);
      this.push(`  // P1.5 lifecycle hooks — override to bind a disposable neural-map seed`);
      this.push(`  // (hydrate durable memory on spawn, merge episodes back on despawn).`);
      this.push(`  protected onBrainHydrate(npc: NpcState): void { void npc; }`);
      this.push(`  protected onBrainMerge(npc: NpcState): void { void npc; }`);
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
      lootTables: [...this.lootTables],
      aoiRadius: this.aoiRadius,
      brains: [...this.brains],
      warnings: [...this.warnings],
      errors: [...this.errors],
    };
  }
}

export default ColyseusCompiler;
