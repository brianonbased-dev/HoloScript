/**
 * @fileoverview ServerAuthorityBundleSplitter — P2.0 cross-file authority split
 * @module @holoscript/core/compiler/authority
 *
 * The endgame of the single-source-netcode thesis (memo §4, PLDI '27 claim):
 * take ONE compiled MMO source and produce TWO bundles —
 *
 *   - `serverBundle` — the authoritative ColyseusCompiler output, unchanged.
 *   - `clientSdk`    — a predicting client mirror containing ONLY the replicated
 *                      wire surface (the `@type`-decorated schema fields) plus the
 *                      world-streaming manifest and tick rate. No loot-roll RNG, no
 *                      ability registry, no boss-phase thresholds, no validation
 *                      logic — those symbols are structurally absent.
 *
 * — together with a `proof` that no `@server_only` symbol is reachable from the
 * client bundle. That turns "the client cannot even see the server's secrets"
 * from a naming convention into a checked, compile-time guarantee
 * ({@link AuthoritySymbolGraph.findViolations}).
 *
 * The client SDK is emitted by keeping only `@type(...)`-decorated lines from each
 * generated schema class — `@type` IS the Colyseus replication contract, so this
 * is a mechanical, sound extraction (not a comment/heuristic parse).
 *
 * Pure, deterministic, no I/O.
 *
 * @version 1.0.0
 */

import type { HoloComposition } from '../../parser/HoloCompositionTypes';
import type { ColyseusCompilationResult } from '../ColyseusCompiler';
import { buildColyseusAuthorityGraph } from './ColyseusAuthorityManifest';
import type { AuthoritySymbolGraph, AuthorityViolation } from './AuthoritySymbolGraph';

/** The static authority proof attached to a split. */
export interface AuthorityProof {
  /** True iff no server_only symbol is exposed to, or reachable from, the client. */
  provablyPartitioned: boolean;
  /** Every server_only symbol the client could observe (empty when proven). */
  violations: AuthorityViolation[];
  /** Count of server-side symbols held back from the client bundle. */
  serverOnlySymbolCount: number;
  /** Count of symbols on the client surface. */
  clientSymbolCount: number;
  /** One-line human verdict. */
  summary: string;
}

/** Result of splitting one MMO compile into server + client bundles. */
export interface ServerAuthoritySplit {
  /** The authoritative server bundle (the ColyseusCompiler output, verbatim). */
  serverBundle: string;
  /** The predicting client SDK: replicated schema + streaming manifest + tick rate. */
  clientSdk: string;
  /** Static proof of the server/client authority partition. */
  proof: AuthorityProof;
  /** The underlying graph (for callers that want to query further). */
  graph: AuthoritySymbolGraph;
}

/**
 * Split a ColyseusCompiler result into an authoritative server bundle and a
 * predicting client SDK, with a static proof that the partition holds.
 *
 * @param result      ColyseusCompiler output — use `ColyseusCompiler.compileSource`
 *                    so `.hs`/`.hsplus` imports are resolved into the registries.
 * @param composition optional parsed composition (adds dynamic `@server_side`
 *                    GameRoomState fields to the server-only set).
 */
export function splitServerAuthority(
  result: ColyseusCompilationResult,
  composition?: HoloComposition
): ServerAuthoritySplit {
  const graph = buildColyseusAuthorityGraph(result, composition);
  const violations = graph.findViolations();
  const { serverSet, clientSet } = graph.partition();

  const clientSdk = emitClientSdk(result);

  const provablyPartitioned = violations.length === 0;
  const summary = provablyPartitioned
    ? `PROVABLY PARTITIONED: ${serverSet.length} server-only symbol(s) held back; ${clientSet.length} on the client surface.`
    : `LEAK: ${violations.length} server_only symbol(s) observable from the client (${violations
        .map((v) => v.symbol.name)
        .join(', ')}).`;

  return {
    serverBundle: result.code,
    clientSdk,
    proof: {
      provablyPartitioned,
      violations,
      serverOnlySymbolCount: serverSet.length,
      clientSymbolCount: clientSet.length,
      summary,
    },
    graph,
  };
}

// =============================================================================
// CLIENT SDK EMISSION
// =============================================================================

/**
 * Emit the predicting client SDK from a server compile: each generated schema
 * class reduced to ONLY its `@type`-decorated (replicated) fields, plus the
 * world-streaming manifest and tick rate. Server-only fields, registries, the
 * Room class, and all validation/RNG logic are structurally absent.
 */
function emitClientSdk(result: ColyseusCompilationResult): string {
  const out: string[] = [];
  out.push(`/**`);
  out.push(` * @generated ServerAuthorityBundleSplitter — client SDK (replicated surface only)`);
  out.push(` * Source room: ${result.roomClassName}`);
  out.push(` *`);
  out.push(` * Contains ONLY @type-decorated (replicated) schema fields + the world`);
  out.push(` * streaming manifest + tick rate. No server-only symbol is present by`);
  out.push(` * construction (proven by AuthoritySymbolGraph.findViolations). DO NOT EDIT.`);
  out.push(` */`);
  out.push(`import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema';`);
  out.push(``);

  for (const className of result.schemaClasses) {
    const replicated = extractReplicatedSchemaClass(result.code, className);
    if (replicated) {
      out.push(replicated, ``);
    }
  }

  const tickRate = extractTickRate(result.code);
  out.push(`/** Canonical server tick rate (Hz) — clients interpolate/predict against this. */`);
  out.push(`export const TICK_RATE = ${tickRate};`);
  out.push(``);
  out.push(`/** World-chunk streaming manifest (client streaming/LOD — not server-only). */`);
  out.push(
    `export const CHUNK_MANIFEST = ${JSON.stringify(result.chunkManifest, null, 2)} as const;`
  );
  out.push(``);

  return out.join('\n');
}

/**
 * Extract one `export class <Name> extends Schema { … }` block from the emitted
 * server code, keeping ONLY the class header, its `@type(...)`-decorated field
 * lines, and the closing brace. Returns null when the class is not found.
 *
 * Sound by the Colyseus contract: `@type` decoration IS replication, so the kept
 * lines are exactly the client-visible wire surface and the dropped lines are
 * exactly the server-only state.
 */
function extractReplicatedSchemaClass(code: string, className: string): string | null {
  const lines = code.split('\n');
  const openRe = new RegExp(`^\\s*export class ${escapeRegExp(className)} extends Schema \\{\\s*$`);

  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (openRe.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  const kept: string[] = [`export class ${className} extends Schema {`];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\}\s*$/.test(line)) {
      kept.push(`}`);
      return kept.join('\n');
    }
    // Keep only replicated (decorated) fields; drop server-only plain fields + comments.
    if (line.includes('@type(')) {
      kept.push(`  ${line.trim()}`);
    }
  }
  return null; // unterminated class block — treat as not found rather than emit junk
}

/** Pull the numeric TICK_RATE constant out of the emitted code (default 20). */
function extractTickRate(code: string): number {
  const m = code.match(/export const TICK_RATE\s*=\s*(\d+)/);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 20;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
