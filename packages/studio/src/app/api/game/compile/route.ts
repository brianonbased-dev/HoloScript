/**
 * POST /api/game/compile
 *
 * Compile a HoloScript composition source to a self-contained, playable 2D HTML
 * game via the canvas2d-game ExportManager target (Canvas2DGameCompiler — the
 * I.017 Native/Canvas 2D game pipeline). This is the server side of
 * /create?mode=game, mirroring POST /api/simulation/run (mode=sim) and the
 * manufacturing mesh route (mode=part).
 *
 * Request body (JSON):
 *   {
 *     source:   string             — HoloScript composition (.hs/.holo) source
 *     options?: {                  — overrides merged onto the compile options
 *       timeLimit?: number,        — vault timer seconds (clamped [5, 600])
 *       hearts?:    number,        — starting hearts (clamped [1, 9])
 *       title?:     string,        — page/banner title
 *     }
 *   }
 *
 * Response 200 (JSON):
 *   {
 *     html:   string,              — playable self-contained HTML game
 *     report: GameBuildReport,     — derived gameplay counts + html digest
 *     gates:  GameGate[],          — derived-gameplay gate status (verify card)
 *   }
 *
 * Response 400: { error: string }
 *
 * Compilation runs through @holoscript/core (parseHolo + ExportManager). Core is
 * NOT webpack-stubbed in the studio (only @holoscript/engine is — next.config.js),
 * and existing API routes already import it server-side (repl/route.ts,
 * mcp/call/route.ts), so a static import is safe in this route handler.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { parseHolo, getExportManager } from '@holoscript/core';

// ── Constants / safety limits ──────────────────────────────────────────────────

const MAX_SOURCE_BYTES = 256 * 1024; // 256 KB — generous for a composition
const TIME_LIMIT_MIN = 5;
const TIME_LIMIT_MAX = 600;
const HEARTS_MIN = 1;
const HEARTS_MAX = 9;

// ── Validation helpers ──────────────────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function clampInt(v: unknown, min: number, max: number): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(Math.max(Math.round(n), min), max);
}

/**
 * Set (or replace) a key in an AST environment's `properties` list.
 * Mirrors the {key, value} property shape the canvas2d-game target reads via
 * propOf(). No-op when value is undefined.
 */
function setEnvProperty(ast: unknown, key: string, value: number | undefined): void {
  if (value === undefined) return;
  if (!isPlainObject(ast)) return;
  let env = (ast as Record<string, unknown>)['environment'];
  if (!isPlainObject(env)) {
    env = { properties: [] };
    (ast as Record<string, unknown>)['environment'] = env;
  }
  const envObj = env as Record<string, unknown>;
  if (!Array.isArray(envObj['properties'])) envObj['properties'] = [];
  const props = envObj['properties'] as Array<{ key: string; value: unknown }>;
  const existing = props.find((p) => p && p.key === key);
  if (existing) existing.value = value;
  else props.push({ key, value });
}

function applyEnvOverrides(
  ast: unknown,
  overrides: { timeLimit?: number; startingHearts?: number }
): void {
  setEnvProperty(ast, 'timeLimit', overrides.timeLimit);
  setEnvProperty(ast, 'startingHearts', overrides.startingHearts);
}

// ── Game-spec extraction ─────────────────────────────────────────────────────────
// The compiled HTML embeds `const GAME = {...};` — the derived GameSpec. We parse
// it back out to build the report + gates without re-importing the compiler's
// internal deriveGameSpec (keeps the route coupled only to the public export path).

interface DerivedGameSpec {
  title?: string;
  timeLimit?: number;
  hearts?: number;
  player?: { x: number; y: number };
  collectibles?: unknown[];
  hazards?: unknown[];
  npcs?: unknown[];
  goal?: unknown;
  tiers?: unknown[];
}

function extractGameSpec(html: string): DerivedGameSpec | null {
  // RUNTIME_TEMPLATE emits: const GAME = {..json..};
  const m = html.match(/const GAME\s*=\s*(\{[\s\S]*?\});/);
  if (!m) return null;
  try {
    return JSON.parse(m[1] as string) as DerivedGameSpec;
  } catch {
    return null;
  }
}

interface GameGate {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
}

function buildGates(spec: DerivedGameSpec, htmlBytes: number, html: string): GameGate[] {
  const collectibles = Array.isArray(spec.collectibles) ? spec.collectibles.length : 0;
  const hazards = Array.isArray(spec.hazards) ? spec.hazards.length : 0;
  const npcs = Array.isArray(spec.npcs) ? spec.npcs.length : 0;
  const tiers = Array.isArray(spec.tiers) ? spec.tiers.length : 0;
  const goalPresent = spec.goal != null;

  // deriveGameSpec ALWAYS seeds a default player object, so `!!spec.player` is
  // not a discriminator. A meaningful game also needs at least one derived
  // gameplay entity (collectible / hazard / npc / goal / tier) — otherwise the
  // composition derived no playable content. This gate reflects that honestly.
  const hasGameplay = collectibles + hazards + npcs + tiers > 0 || goalPresent;
  const playerPresent = !!spec.player && hasGameplay;

  return [
    {
      id: 'parse',
      label: 'Parses to a composition',
      pass: true,
      detail: 'parseHolo succeeded against @holoscript/core',
    },
    {
      id: 'player',
      label: 'Has a controllable player in a non-empty game',
      pass: playerPresent,
      detail: playerPresent
        ? `player @ (${spec.player!.x}, ${spec.player!.y})`
        : 'no playable content derived (default player only)',
    },
    {
      id: 'objective',
      label: 'Has a win objective (goal or collectibles)',
      pass: goalPresent || collectibles > 0,
      detail: goalPresent
        ? 'goal present (@dialogue keeper)'
        : collectibles > 0
          ? `${collectibles} collectible(s) (@grabbable)`
          : 'no goal or collectibles derived',
    },
    {
      id: 'challenge',
      label: 'Has challenge (hazards or tiers)',
      pass: hazards > 0 || tiers >= 2,
      detail:
        hazards > 0
          ? `${hazards} hazard(s) (@collidable)`
          : tiers >= 2
            ? `${tiers} tiers to climb`
            : 'no hazards and < 2 tiers',
    },
    {
      id: 'playable-html',
      label: 'Emits playable HTML (canvas + keydown loop)',
      pass: /<canvas/.test(html) && /keydown/.test(html) && !/WebGLRenderer/.test(html),
      detail: `${htmlBytes} bytes, native 2D canvas runtime`,
    },
  ];
}

// ── SHA-256 of the compiled HTML ──────────────────────────────────────────────────

function htmlDigest(html: string): string {
  return createHash('sha256').update(html, 'utf8').digest('hex');
}

// ── Route handler ───────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!isPlainObject(body)) {
    return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 });
  }

  const source = body['source'];
  if (typeof source !== 'string' || source.trim().length === 0) {
    return NextResponse.json({ error: '`source` must be a non-empty string' }, { status: 400 });
  }
  if (Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) {
    return NextResponse.json(
      { error: `\`source\` exceeds ${MAX_SOURCE_BYTES} bytes` },
      { status: 400 }
    );
  }

  // Parse + clamp options
  const rawOptions = isPlainObject(body['options']) ? body['options'] : {};
  const timeLimit = clampInt(rawOptions['timeLimit'], TIME_LIMIT_MIN, TIME_LIMIT_MAX);
  const hearts = clampInt(rawOptions['hearts'], HEARTS_MIN, HEARTS_MAX);
  const title = typeof rawOptions['title'] === 'string' ? rawOptions['title'] : undefined;

  // Parse the composition
  const parsed = parseHolo(source);
  if (!parsed.success || !parsed.ast) {
    const first = parsed.errors?.[0];
    const msg = first
      ? `Parse error: ${typeof first === 'string' ? first : ((first as { message?: string }).message ?? JSON.stringify(first))}`
      : 'Failed to parse composition';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Apply timeLimit / hearts overrides by injecting them into the composition's
  // `environment` properties — that is the key the canvas2d-game target reads
  // (Canvas2DGameCompilerTarget.normalizeHoloComposition → env.timeLimit /
  // env.startingHearts → deriveGameSpec). Per-call ExportManager options are NOT
  // threaded to the compiler (exportDirect calls compile() with no per-call
  // options), so writing the AST is the reliable override path.
  applyEnvOverrides(parsed.ast, { timeLimit, startingHearts: hearts });

  const t0 = performance.now();

  // Export to the canvas2d-game target via the public ExportManager path —
  // identical to the path the compile_to_canvas2d_game MCP tool drives.
  let html: string;
  try {
    const exportOptions: Record<string, unknown> = {
      useCircuitBreaker: false,
      throwOnError: false,
    };
    if (title !== undefined) exportOptions['title'] = title;

    const result = await getExportManager().export('canvas2d-game', parsed.ast, exportOptions);
    if (!result.success || typeof result.output !== 'string') {
      return NextResponse.json(
        { error: `Compile failed: ${result.error ?? 'unknown export error'}` },
        { status: 400 }
      );
    }
    html = result.output;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Compile failed: ${msg}` }, { status: 400 });
  }

  const wallMs = performance.now() - t0;
  const spec = extractGameSpec(html);
  const htmlBytes = Buffer.byteLength(html, 'utf8');
  const digest = htmlDigest(html);

  if (!spec) {
    // HTML compiled but the GAME spec couldn't be parsed back — still return the
    // playable HTML, but flag the report honestly.
    return NextResponse.json({
      html,
      report: {
        target: 'canvas2d-game',
        title: title ?? 'HoloScript 2D Game',
        playerPresent: false,
        collectibles: 0,
        hazards: 0,
        npcs: 0,
        goalPresent: false,
        tiers: 0,
        timeLimit: timeLimit ?? 70,
        hearts: hearts ?? 3,
        htmlDigest: digest,
        htmlBytes,
        wallMs,
      },
      gates: [
        {
          id: 'playable-html',
          label: 'Emits playable HTML (canvas + keydown loop)',
          pass: /<canvas/.test(html) && /keydown/.test(html),
          detail: `${htmlBytes} bytes (game spec not introspectable)`,
        },
      ],
    });
  }

  const collectibles = Array.isArray(spec.collectibles) ? spec.collectibles.length : 0;
  const hazards = Array.isArray(spec.hazards) ? spec.hazards.length : 0;
  const npcs = Array.isArray(spec.npcs) ? spec.npcs.length : 0;
  const tiers = Array.isArray(spec.tiers) ? spec.tiers.length : 0;
  // Honest player presence: a default player is always seeded, so require at
  // least one derived gameplay entity for the report flag too (matches the
  // `player` gate in buildGates).
  const reportHasGameplay = collectibles + hazards + npcs + tiers > 0 || spec.goal != null;

  return NextResponse.json({
    html,
    report: {
      target: 'canvas2d-game',
      title: spec.title ?? title ?? 'HoloScript 2D Game',
      playerPresent: !!spec.player && reportHasGameplay,
      collectibles,
      hazards,
      npcs,
      goalPresent: spec.goal != null,
      tiers,
      timeLimit: typeof spec.timeLimit === 'number' ? spec.timeLimit : (timeLimit ?? 70),
      hearts: typeof spec.hearts === 'number' ? spec.hearts : (hearts ?? 3),
      htmlDigest: digest,
      htmlBytes,
      wallMs,
    },
    gates: buildGates(spec, htmlBytes, html),
  });
}
