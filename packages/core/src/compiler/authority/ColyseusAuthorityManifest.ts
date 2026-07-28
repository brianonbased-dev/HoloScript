/**
 * @fileoverview Colyseus → AuthoritySymbolGraph bridge (the authority manifest)
 * @module @holoscript/core/compiler/authority
 *
 * Builds an {@link AuthoritySymbolGraph} from a {@link ColyseusCompilationResult}.
 * Every symbol is sourced from the compiler's STRUCTURED output (the typed
 * `abilities`/`lootTables`/`brains`/`worldLayers`/`chunkManifest` arrays + the
 * fixed schema-field tier table below) — never by string-scanning the emitted
 * code, which carries no machine-readable server/client markers.
 *
 * The schema-field tier table mirrors `ColyseusCompiler.emitSchemaSection()`
 * exactly: a field is `replicated` iff it is emitted with a `@type(...)`
 * decorator, and `server_only` otherwise. {@link COLYSEUS_SCHEMA_FIELD_TIERS} is
 * the single declarative copy of that decision; a drift-guard test re-derives the
 * `@type` set from real compiler output and asserts it matches, so the table can
 * never silently drift from the emitter.
 *
 * @version 1.0.0
 */

import type { HoloComposition, HoloObjectTrait } from '../../parser/HoloCompositionTypes';
import type { ColyseusCompilationResult } from '../ColyseusCompiler';
import { AuthoritySymbolGraph, type AuthorityTier } from './AuthoritySymbolGraph';

/** Synthetic source-file label for compiler-emitted Colyseus symbols. */
export const COLYSEUS_EMIT_FILE = '<colyseus-emit>';

/** Per-schema-class field classification, mirroring emitSchemaSection. */
export interface SchemaClassTiers {
  className: string;
  /** `@type`-decorated fields — synced to clients. */
  replicated: string[];
  /** Plain (un-decorated) fields — never leave the server. */
  serverOnly: string[];
}

/**
 * The fixed authority classification of every Colyseus schema field.
 *
 * SSOT mirror of `ColyseusCompiler.emitSchemaSection()`. Kept declarative so the
 * splitter and the cross-file checker share one source of truth; verified against
 * real emitter output by `ColyseusAuthorityManifest` drift-guard tests.
 */
export const COLYSEUS_SCHEMA_FIELD_TIERS: readonly SchemaClassTiers[] = [
  {
    className: 'PlayerState',
    replicated: ['id', 'name', 'x', 'y', 'z', 'hp', 'mana', 'faction', 'isReady'],
    serverOnly: ['lastMoveTick', 'gcdUntilTick', 'cooldowns', 'questFlags', 'activePhases'],
  },
  {
    className: 'NpcState',
    replicated: [
      'id',
      'type',
      'x',
      'y',
      'z',
      'hp',
      'maxHp',
      'faction',
      'brainType',
      'brainState',
      'isAlive',
    ],
    serverOnly: ['brainTick', 'lastLlmTick', 'ticksSincePhaseEntry'],
  },
  {
    className: 'SpawnPointState',
    replicated: ['id', 'x', 'y', 'z', 'faction', 'occupied'],
    serverOnly: [],
  },
  {
    className: 'GameRoomState',
    // `players`/`npcs`/`spawnPoints` are @type MapSchema/ArraySchema; tickCount/phase are @type.
    replicated: ['players', 'npcs', 'spawnPoints', 'tickCount', 'phase'],
    // rngState carries `= RNG_SEED` with NO @type — the deterministic-PRNG secret.
    serverOnly: ['rngState'],
  },
] as const;

/**
 * Authority tier of each compiler-emitted top-level registry/constant.
 * Registries hold server-authoritative logic/data; only `TICK_RATE` and
 * `CHUNK_MANIFEST` are part of the legitimate client surface.
 */
export const COLYSEUS_CONSTANT_TIERS: Readonly<Record<string, AuthorityTier>> = {
  // ── server-only secrets / authoritative data ──
  RNG_SEED: 'server_only',
  ABILITY_REGISTRY: 'server_only',
  LOOT_TABLES: 'server_only',
  BRAIN_REGISTRY: 'server_only',
  PHASE_REGISTRY: 'server_only',
  // ── server config (authoritative, not secret, not shipped to client) ──
  MAX_MOVE_SPEED: 'server',
  MOVE_EPSILON: 'server',
  AOI_RADIUS: 'server',
  LLM_BUDGET_TICKS: 'server',
  JETSON_OLLAMA_ENV: 'server',
  GAME_EVENT_RECEIPT_SCHEMA: 'server',
  // ── client surface ──
  TICK_RATE: 'client',
  CHUNK_MANIFEST: 'client',
};

const K = AuthoritySymbolGraph.keyFor;

/** Strip a single leading `@` and lowercase for trait-name matching. */
function traitName(t: HoloObjectTrait): string {
  return String(t.name).replace(/^@/, '');
}

/**
 * Build a sound {@link AuthoritySymbolGraph} from a ColyseusCompiler result.
 *
 * Symbols: every emitted schema field (tiered per {@link COLYSEUS_SCHEMA_FIELD_TIERS}),
 * every server registry + constant (per {@link COLYSEUS_CONSTANT_TIERS}), and one
 * symbol per ability / loot table / brain / world-layer (all server_only — they
 * are consumed only by server methods). Client roots: every replicated schema
 * field plus the `client`-tier constants (`TICK_RATE`, `CHUNK_MANIFEST`).
 *
 * In a correct compile this yields ZERO violations — which is the point: the
 * proof turns the emitter's naming-convention partition into a checked invariant
 * that fails loudly if a future change leaks a server-only symbol to the client.
 *
 * @param result      ColyseusCompiler output (use `compileSource` so imports resolve).
 * @param composition optional parsed composition; when present, dynamic
 *                    `@server_side` GameRoomState fields are added as server_only.
 */
export function buildColyseusAuthorityGraph(
  result: ColyseusCompilationResult,
  composition?: HoloComposition
): AuthoritySymbolGraph {
  const graph = new AuthoritySymbolGraph();
  const file = COLYSEUS_EMIT_FILE;
  const emittedClasses = new Set(result.schemaClasses);

  // ── Schema fields ──────────────────────────────────────────────────────
  for (const cls of COLYSEUS_SCHEMA_FIELD_TIERS) {
    if (!emittedClasses.has(cls.className)) continue;
    for (const fieldName of cls.replicated) {
      const key = K(file, fieldName, cls.className);
      graph.addSymbol({
        key,
        name: fieldName,
        sourceFile: file,
        kind: 'schema_field',
        tier: 'replicated',
        clientExposed: true,
      });
      graph.markClientRoot(key);
    }
    for (const fieldName of cls.serverOnly) {
      graph.addSymbol({
        key: K(file, fieldName, cls.className),
        name: fieldName,
        sourceFile: file,
        kind: 'schema_field',
        tier: 'server_only',
      });
    }
  }

  // ── Dynamic @server_side GameRoomState fields (composition-derived) ──────
  if (composition && emittedClasses.has('GameRoomState')) {
    for (const node of collectServerSideObjectNames(composition)) {
      const fieldName = `${node}_serverOnly`;
      graph.addSymbol({
        key: K(file, fieldName, 'GameRoomState'),
        name: fieldName,
        sourceFile: file,
        kind: 'schema_field',
        tier: 'server_only',
      });
    }
  }

  // ── Top-level registries + constants ─────────────────────────────────────
  for (const [name, tier] of Object.entries(COLYSEUS_CONSTANT_TIERS)) {
    const key = K(file, name);
    graph.addSymbol({
      key,
      name,
      sourceFile: file,
      kind: name.endsWith('_REGISTRY') || name === 'LOOT_TABLES' ? 'registry' : 'constant',
      tier,
      clientExposed: tier === 'client',
    });
    if (tier === 'client') graph.markClientRoot(key);
  }

  // ── One server-only symbol per data-driven construct ─────────────────────
  for (const ability of result.abilities) {
    graph.addSymbol({
      key: K(file, ability.name, 'ability'),
      name: ability.name,
      sourceFile: file,
      kind: 'ability',
      tier: 'server_only',
    });
  }
  for (const table of result.lootTables) {
    graph.addSymbol({
      key: K(file, table.name, 'loot'),
      name: table.name,
      sourceFile: file,
      kind: 'loot_table',
      tier: 'server_only',
    });
  }
  for (const brain of result.brains) {
    graph.addSymbol({
      key: K(file, brain.name, 'brain'),
      name: brain.name,
      sourceFile: file,
      kind: 'brain',
      tier: 'server_only',
    });
  }
  for (const layer of result.worldLayers) {
    graph.addSymbol({
      key: K(file, layer.name, 'layer'),
      name: layer.name,
      sourceFile: file,
      kind: 'world_layer',
      tier: 'server_only',
    });
  }

  return graph;
}

/**
 * Cross-file context for {@link ProvenanceBoundsChecker.check}, built from a
 * ColyseusCompiler result: the authority graph (info-leak reachability) plus each
 * ability's resolved authority envelope (ability_spam / unvalidated_cast).
 */
export interface ColyseusCrossFileContext {
  graph: AuthoritySymbolGraph;
  abilityEnvelopes: Map<string, 'server' | 'client_predicted' | 'client'>;
}

/**
 * Build the cross-file context a {@link ProvenanceBoundsChecker} needs to upgrade
 * its 3 caveated obligations to genuine cross-file proofs. The ability envelopes
 * come straight from the compiler's resolved `result.abilities` (which already
 * merged `.hs` imports via `compileSource`).
 */
export function buildColyseusCrossFileContext(
  result: ColyseusCompilationResult,
  composition?: HoloComposition
): ColyseusCrossFileContext {
  const graph = buildColyseusAuthorityGraph(result, composition);
  const abilityEnvelopes = new Map<string, 'server' | 'client_predicted' | 'client'>();
  for (const ability of result.abilities) {
    abilityEnvelopes.set(ability.name, ability.authorityEnvelope);
  }
  return { graph, abilityEnvelopes };
}

/**
 * Collect names of composition objects carrying a `@server_side` trait — these
 * become `${name}_serverOnly` plain fields on GameRoomState (mirrors
 * `ColyseusCompiler.emitSchemaSection` server-field emission).
 */
function collectServerSideObjectNames(composition: HoloComposition): string[] {
  const names: string[] = [];
  const objects =
    (composition as { objects?: Array<{ name?: string; traits?: HoloObjectTrait[] }> }).objects ??
    [];
  for (const obj of objects) {
    const traits = obj.traits ?? [];
    if (traits.some((t) => traitName(t) === 'server_side' || traitName(t) === 'server_only')) {
      if (obj.name) names.push(obj.name);
    }
  }
  return names;
}
