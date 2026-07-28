/**
 * POST /api/avatar/compile
 *
 * Derive a VRM-1.0-shaped humanoid rig descriptor from a HoloScript avatar
 * composition. This is the server side of /create?mode=avatar, mirroring
 * POST /api/game/compile (mode=game) and POST /api/simulation/run (mode=sim).
 *
 * The derivation is GENERIC over the @holoscript/core humanoid-avatar trait
 * vocabulary (skeleton/body/face/expressive/hair/clothing/hands/...):
 *   @skeleton            -> declares the humanoid bone chain (rig root)
 *   @body / @hands       -> body + limb bones
 *   @face / @expressive  -> expression presets
 *   @hair / @clothing    -> surface layers
 * Bone coverage is scored against the VRM 1.0 required-humanoid bone set — the
 * same REQUIRED_BONES contract @holoscript/vrm-avatar-plugin uses.
 *
 * Request body (JSON):
 *   {
 *     source:   string             — HoloScript composition (.hs/.holo) source
 *     options?: {
 *       scale?:           number,  — avatar root uniform scale (clamped [0.5, 2.0])
 *       expressionCount?: number,  — target expression presets (clamped [1, 10])
 *     }
 *   }
 *
 * Response 200 (JSON):
 *   {
 *     rig:    { name, version, scale, humanoid_bones, expressions, layers },
 *     bones:  AvatarBone[],
 *     report: AvatarBuildReport,
 *     gates:  AvatarGate[],
 *   }
 *
 * Response 400: { error: string }
 *
 * Parsing runs through @holoscript/core (parseHolo). Core is NOT webpack-stubbed
 * in the studio (only @holoscript/engine is — next.config.js), and existing API
 * routes already import it server-side (game/compile, repl, mcp/call), so a
 * static import is safe here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { parseHolo } from '@holoscript/core';

// ── Constants / safety limits ──────────────────────────────────────────────────

const MAX_SOURCE_BYTES = 256 * 1024; // 256 KB — generous for a composition
const SCALE_MIN = 0.5;
const SCALE_MAX = 2.0;
const EXPR_MIN = 1;
const EXPR_MAX = 10;

/**
 * VRM 1.0 required-humanoid bones — the @holoscript/vrm-avatar-plugin
 * REQUIRED_BONES contract. Bone coverage is `present / REQUIRED_BONES.length`.
 */
const REQUIRED_BONES = [
  'hips',
  'spine',
  'head',
  'leftUpperArm',
  'rightUpperArm',
  'leftUpperLeg',
  'rightUpperLeg',
] as const;

/**
 * Full VRM humanoid bone chain emitted when a @skeleton template is present.
 * Mirrors VrmHumanoidBone in @holoscript/vrm-avatar-plugin. Body-only rigs (no
 * @skeleton) emit just the core required set.
 */
const FULL_BONE_CHAIN = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
] as const;

/** Limb bones that require an @body or @hands template to be emitted. */
const LIMB_BONES = new Set<string>([
  'leftLowerArm',
  'leftHand',
  'rightLowerArm',
  'rightHand',
  'leftLowerLeg',
  'leftFoot',
  'rightLowerLeg',
  'rightFoot',
]);

/** Default expression preset ramp (VRM expression presets), ordered by priority. */
const EXPRESSION_RAMP = [
  'neutral',
  'happy',
  'sad',
  'angry',
  'relaxed',
  'surprised',
  'blink',
  'aa',
  'ih',
  'ou',
] as const;

// ── Validation helpers ──────────────────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function clampNumber(v: unknown, min: number, max: number): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(Math.max(n, min), max);
}

function clampInt(v: unknown, min: number, max: number): number | undefined {
  const c = clampNumber(v, min, max);
  return c === undefined ? undefined : Math.round(c);
}

// ── Trait extraction ──────────────────────────────────────────────────────────────
// parseHolo emits template.traits as either string[] (trait names) or objects
// with a `name`. Normalise to a lower-cased string set across all templates.

interface ParsedTemplate {
  name?: string;
  traits?: Array<string | { name?: string }>;
}

function collectTraits(templates: ParsedTemplate[]): Set<string> {
  const traits = new Set<string>();
  for (const t of templates) {
    for (const tr of t.traits ?? []) {
      const name = typeof tr === 'string' ? tr : tr?.name;
      if (typeof name === 'string') traits.add(name.toLowerCase());
    }
  }
  return traits;
}

// ── Rig derivation ──────────────────────────────────────────────────────────────

interface AvatarBone {
  vrmBone: string;
  node: string;
  required: boolean;
}

interface DerivedRig {
  bones: AvatarBone[];
  expressions: Array<{ preset: string; target_shape_keys: string[] }>;
  layers: string[];
}

/**
 * Derive a humanoid rig from the composition's trait set.
 *
 * - @skeleton present  -> emit the FULL_BONE_CHAIN (minus limb bones that need @body/@hands).
 * - no @skeleton       -> emit only the REQUIRED_BONES core (a face/body-only rig).
 * - @body / @hands     -> include the limb bones.
 * - @face/@expressive  -> derive expression presets (capped at expressionCount).
 * - @hair/@clothing    -> surface layers.
 */
function deriveRig(traits: Set<string>, expressionCount: number): DerivedRig {
  const hasSkeleton = traits.has('skeleton') || traits.has('poseable');
  const hasLimbs = traits.has('body') || traits.has('hands');
  const hasFaceTrait = traits.has('face') || traits.has('expressive') || traits.has('morph');
  // No humanoid-avatar traits at all (e.g. junk/empty composition) -> empty rig.
  // The skeleton/rig-integrity gates then fail honestly rather than fabricating
  // a default axial skeleton out of nothing.
  const hasAnyRigTrait =
    hasSkeleton || hasLimbs || hasFaceTrait || traits.has('hair') || traits.has('clothing');

  const requiredSet = new Set<string>(REQUIRED_BONES);
  const bones: AvatarBone[] = [];

  if (!hasAnyRigTrait) {
    return { bones: [], expressions: [], layers: [] };
  }

  if (hasSkeleton) {
    for (const b of FULL_BONE_CHAIN) {
      // Limb-tail bones only emit when the rig has a body/hands template.
      if (LIMB_BONES.has(b) && !hasLimbs) continue;
      bones.push({ vrmBone: b, node: `${b}_node`, required: requiredSet.has(b) });
    }
  } else {
    // Body/face-only rig — emit the core required bones the avatar can support.
    for (const b of REQUIRED_BONES) {
      // Without a skeleton AND without a body, only the axial bones make sense.
      if (!hasLimbs && (b.endsWith('Arm') || b.endsWith('Leg'))) continue;
      bones.push({ vrmBone: b, node: `${b}_node`, required: true });
    }
  }

  // Expressions — only when the avatar has an expressive/face surface.
  const expressions = hasFaceTrait
    ? EXPRESSION_RAMP.slice(0, Math.max(1, Math.min(expressionCount, EXPRESSION_RAMP.length))).map(
        (preset) => ({
          preset,
          target_shape_keys: [`${preset}_shape`],
        })
      )
    : [];

  // Surface layers.
  const layers: string[] = [];
  if (traits.has('hair')) layers.push('hair');
  if (traits.has('clothing')) layers.push('clothing');
  if (traits.has('eye_tracked') || traits.has('hand_tracking')) layers.push('tracking');

  return { bones, expressions, layers };
}

// ── Gates ────────────────────────────────────────────────────────────────────────

interface AvatarGate {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
}

function buildGates(rig: DerivedRig, boneCoverage: number, requiredPresent: number): AvatarGate[] {
  const boneCount = rig.bones.length;
  const exprCount = rig.expressions.length;

  return [
    {
      id: 'parse',
      label: 'Parses to a composition',
      pass: true,
      detail: 'parseHolo succeeded against @holoscript/core',
    },
    {
      id: 'skeleton',
      label: 'Derives a humanoid skeleton',
      pass: boneCount > 0,
      detail: boneCount > 0 ? `${boneCount} humanoid bones derived` : 'no bones derived',
    },
    {
      id: 'rig-integrity',
      label: 'VRM required-humanoid bones present',
      pass: requiredPresent === REQUIRED_BONES.length,
      detail: `${requiredPresent}/${REQUIRED_BONES.length} required bones (coverage ${(boneCoverage * 100).toFixed(0)}%)`,
    },
    {
      id: 'expressions',
      label: 'Has at least one facial expression preset',
      pass: exprCount > 0,
      detail:
        exprCount > 0
          ? `${exprCount} expression preset(s) derived`
          : 'no @face / @expressive template — no expressions',
    },
    {
      id: 'polycount-budget',
      label: 'Rig descriptor within budget',
      pass: boneCount <= FULL_BONE_CHAIN.length && exprCount <= EXPRESSION_RAMP.length,
      detail: `${boneCount} bones · ${exprCount} expressions · ${rig.layers.length} surface layers`,
    },
  ];
}

// ── Canonical digest ──────────────────────────────────────────────────────────────
// Deterministic: stable key ordering so identical config -> identical digest.

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) out[k] = canonicalize(value[k]);
    return out;
  }
  return value;
}

function rigDigest(rig: unknown): { json: string; digest: string } {
  const json = JSON.stringify(canonicalize(rig));
  return { json, digest: createHash('sha256').update(json, 'utf8').digest('hex') };
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

  // Parse + clamp options.
  const rawOptions = isPlainObject(body['options']) ? body['options'] : {};
  const scale = clampNumber(rawOptions['scale'], SCALE_MIN, SCALE_MAX) ?? 1.0;
  const expressionCount = clampInt(rawOptions['expressionCount'], EXPR_MIN, EXPR_MAX) ?? 5;

  const t0 = performance.now();

  // Parse the composition.
  const parsed = parseHolo(source);
  if (!parsed.success || !parsed.ast) {
    const first = parsed.errors?.[0];
    const msg = first
      ? `Parse error: ${typeof first === 'string' ? first : ((first as { message?: string }).message ?? JSON.stringify(first))}`
      : 'Failed to parse composition';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const ast = parsed.ast as {
    name?: string;
    metadata?: { name?: string };
    templates?: ParsedTemplate[];
  };
  const templates = Array.isArray(ast.templates) ? ast.templates : [];
  const traits = collectTraits(templates);

  const rig = deriveRig(traits, expressionCount);

  const requiredPresent = rig.bones.filter((b) => b.required).length;
  const boneCoverage = requiredPresent / REQUIRED_BONES.length;

  const title = ast.metadata?.name ?? ast.name ?? 'HoloScript Avatar';

  // Canonical VRM-1.0-shaped rig descriptor (downloadable on Ship).
  const humanoidBones: Record<string, string> = {};
  for (const b of rig.bones) humanoidBones[b.vrmBone] = b.node;

  const rigDescriptor = {
    name: title,
    version: '1.0' as const,
    scale,
    humanoid_bones: humanoidBones,
    expressions: rig.expressions,
    layers: rig.layers,
  };

  const { json, digest } = rigDigest(rigDescriptor);
  const wallMs = performance.now() - t0;

  return NextResponse.json({
    rig: rigDescriptor,
    bones: rig.bones,
    report: {
      target: 'vrm-humanoid-rig',
      title,
      boneCount: rig.bones.length,
      requiredBonesPresent: requiredPresent,
      requiredBonesTotal: REQUIRED_BONES.length,
      boneCoverage,
      expressionCount: rig.expressions.length,
      layerCount: rig.layers.length,
      scale,
      rigDigest: digest,
      rigBytes: Buffer.byteLength(json, 'utf8'),
      wallMs,
    },
    gates: buildGates(rig, boneCoverage, requiredPresent),
  });
}
