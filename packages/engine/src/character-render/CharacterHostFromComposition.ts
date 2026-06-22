/**
 * CharacterHostFromComposition — derive a renderable CharacterHost from an authored
 * `.holo`/`.hsplus` character composition. The bridge that makes the native authored
 * structure library actually RENDER (composition → CharacterHost → renderCharacter).
 *
 * Pure-data + GPU-free + parser-decoupled: it takes a STRUCTURAL view of the parsed AST (the
 * minimal subset it reads), so it needs no cross-package type import and no runtime parser
 * dependency — the caller parses (`parseHolo`) and passes `.ast` in. It maps the cleanly
 * supported traits (@body, @subsurface_scattering, @locomotion) onto CharacterHost and returns
 * an honest report of what is mapped vs stubbed (@morph/@skeleton/@hair seams not yet wired).
 *
 * @module character-render
 */

import { CharacterHost } from './CharacterHost';
import type { GaitMode } from './gait';

// ── Minimal structural view of the parsed composition (matches HoloComposition AST shape). ──
export interface CompTrait {
  name: string;
  config?: Record<string, unknown>;
}
export interface CompObject {
  id?: string;
  name?: string;
  position?: { x?: number; y?: number; z?: number };
  template?: string;
  traits?: CompTrait[];
  children?: CompObject[];
}
export interface CompTemplate {
  name: string;
  traits?: CompTrait[];
}
export interface ParsedComposition {
  name?: string;
  objects?: CompObject[];
  templates?: CompTemplate[];
  spatialGroups?: Array<{ objects?: CompObject[] }>;
}

export interface CharacterHostFromCompositionOptions {
  /** Override the entity id (else: chosen object id → name → composition name → 'character'). */
  entityId?: string;
  /** Pick a specific character node by id/name (else: first object with a body/skeleton trait). */
  objectId?: string;
  /** Clamp bounds for derived scales (default 0.5..2.0). */
  scaleBounds?: { min: number; max: number };
}

export interface CharacterHostFromCompositionResult {
  ok: boolean;
  host?: CharacterHost;
  /** Gait descriptor for the caller's per-frame `host.applyLocomotion(mode, t, speed)`. */
  gait?: { mode: GaitMode; speed: number };
  /** Packed 0xRRGGBB derived from @subsurface_scattering(color), if present. */
  materialColor?: number;
  report: {
    objectId?: string;
    resolvedVia: 'objectId' | 'body-trait-heuristic' | 'first-object' | 'none';
    mapped: string[];
    stubbed: Array<{ trait: string; reason: string }>;
    warnings: string[];
  };
}

const DEFAULT_BOUNDS = { min: 0.5, max: 2.0 };
const HUMAN_REF_HEIGHT_M = 1.75;
const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);
const asNum = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
const asStr = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** Read a trait config value by key, falling back to the parser's positional `_arg0`. */
function cfgVal(t: TraitRec | undefined, ...keys: string[]): unknown {
  if (!t) return undefined;
  for (const k of keys) if (t.config[k] !== undefined) return t.config[k];
  return t.config._arg0;
}

interface TraitRec {
  config: Record<string, unknown>;
}
type TraitMap = Map<string, TraitRec>;

/** Merge an object's own traits over its `using` template's traits (template carries the set). */
function mergeTraits(obj: CompObject, templates: CompTemplate[]): TraitMap {
  const m: TraitMap = new Map();
  const add = (tr: CompTrait): void => {
    m.set(tr.name.replace(/^@/, '').toLowerCase(), { config: tr.config ?? {} });
  };
  if (obj.template) templates.find((t) => t.name === obj.template)?.traits?.forEach(add);
  obj.traits?.forEach(add);
  return m;
}

/** Flatten scene objects + spatial groups + nested children. */
function allObjects(comp: ParsedComposition): CompObject[] {
  const out: CompObject[] = [];
  const walk = (o: CompObject): void => {
    out.push(o);
    o.children?.forEach(walk);
  };
  comp.objects?.forEach(walk);
  comp.spatialGroups?.forEach((g) => g.objects?.forEach(walk));
  return out;
}

const BODY_TRAITS = ['body', 'skeleton', 'poseable'];

/**
 * Project a LocomotionConfig / VR-locomotion mode onto a skeletal gait. Movement modes →
 * walk/run; comfort/teleport/none → idle (recorded as stubbed). Covers the full LocomotionMode
 * vocabulary + VR `default_mode` values.
 */
const GAIT_FROM_MODE: Record<string, GaitMode | null> = {
  idle: 'idle',
  walk: 'walk',
  smooth: 'walk', // VR smooth-locomotion = continuous walking
  run: 'run',
  jog: 'run',
  glide: 'walk',
  path: 'walk',
  orbit: 'walk',
  follow: 'walk',
  // no skinned gait — comfort / discrete / non-bipedal:
  teleport: null,
  room_scale: null,
  snap: null,
  fly: null,
  swim: null,
};

/**
 * Build a renderable CharacterHost from a parsed character composition.
 * The caller parses the source (e.g. `parseHolo(src).ast`) and passes it here.
 */
export function buildCharacterHostFromComposition(
  parsed: ParsedComposition,
  opts: CharacterHostFromCompositionOptions = {}
): CharacterHostFromCompositionResult {
  const bounds = opts.scaleBounds ?? DEFAULT_BOUNDS;
  const templates = parsed.templates ?? [];
  const objs = allObjects(parsed);
  const report: CharacterHostFromCompositionResult['report'] = {
    resolvedVia: 'none',
    mapped: [],
    stubbed: [],
    warnings: [],
  };

  // 1. Resolve the character object.
  let obj: CompObject | undefined;
  if (opts.objectId) {
    obj = objs.find((o) => o.id === opts.objectId || o.name === opts.objectId);
    if (obj) report.resolvedVia = 'objectId';
  }
  if (!obj) {
    obj = objs.find((o) => {
      const tm = mergeTraits(o, templates);
      return BODY_TRAITS.some((t) => tm.has(t));
    });
    if (obj) report.resolvedVia = 'body-trait-heuristic';
  }
  if (!obj && objs.length > 0) {
    obj = objs[0];
    report.resolvedVia = 'first-object';
  }
  if (!obj) {
    report.warnings.push('no character object found; not fabricating a body');
    return { ok: false, report };
  }
  report.objectId = obj.id ?? obj.name;
  const traits = mergeTraits(obj, templates);

  // 2. @body → heightScale / buildScale (height authored in METRES; reference = 1.75 m).
  let heightScale = 1;
  let buildScale = 1;
  const body = traits.get('body');
  if (body) {
    report.mapped.push('@body');
    const h = asNum(cfgVal(body, 'height', 'height_m'));
    if (h !== undefined) {
      const scale = h > 0.5 ? h / HUMAN_REF_HEIGHT_M : h; // metres → scale; tiny values = explicit scale
      heightScale = clamp(scale, bounds.min, bounds.max);
    }
    const b = asNum(cfgVal(body, 'build_scale', 'thickness'));
    if (b !== undefined) buildScale = clamp(b, bounds.min, bounds.max);
  }

  // 3. Skin tone → packed colour. Prefer @subsurface_scattering(color); fall back to
  //    @body(skin_tone) (the canonical avatar-template authoring shape).
  let color: number | undefined;
  const sss = traits.get('subsurface_scattering');
  const sssColor = sss ? cfgVal(sss, 'color', 'base_color', 'skin_tone') : undefined;
  if (Array.isArray(sssColor) && sssColor.length >= 3 && sssColor.every((x) => typeof x === 'number')) {
    const [r, g, b] = sssColor as number[];
    color = (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
    report.mapped.push('@subsurface_scattering');
  } else if (typeof sssColor === 'string' && /^#?[0-9a-fA-F]{6}$/.test(sssColor)) {
    color = parseInt(sssColor.replace('#', ''), 16);
    report.mapped.push('@subsurface_scattering');
  } else {
    const tone = asStr(cfgVal(body, 'skin_tone'));
    if (tone && /^#?[0-9a-fA-F]{6}$/.test(tone)) {
      color = parseInt(tone.replace('#', ''), 16);
      report.warnings.push('skin tone taken from @body(skin_tone)');
    }
  }

  // 4. entityId + position.
  const entityId = opts.entityId ?? obj.id ?? obj.name ?? parsed.name ?? 'character';
  const p = obj.position;
  const position: [number, number, number] | undefined = p
    ? [p.x ?? 0, p.y ?? 0, p.z ?? 0]
    : undefined;

  // 5. Construct (color undefined → CharacterHost uses its skin-tone default).
  const host = new CharacterHost({ entityId, heightScale, buildScale, skinTone: color, position });

  // 6. @locomotion → gait descriptor (caller drives the per-frame clock).
  let gait: { mode: GaitMode; speed: number } | undefined;
  const loco = traits.get('locomotion');
  if (loco) {
    const rawMode = (
      asStr(cfgVal(loco, 'mode', 'default_mode')) ?? 'walk'
    ).toLowerCase();
    const speed =
      asNum(cfgVal(loco, 'speed', 'smooth_speed', 'walk_speed', 'move_speed')) ?? 1.4;
    const mapped = GAIT_FROM_MODE[rawMode];
    if (mapped) {
      gait = { mode: mapped, speed };
      report.mapped.push('@locomotion');
      if (rawMode === 'glide' || rawMode === 'smooth') {
        report.warnings.push(`locomotion '${rawMode}' rendered as 'walk' gait`);
      }
    } else {
      gait = { mode: 'idle', speed };
      report.stubbed.push({
        trait: '@locomotion',
        reason: `mode '${rawMode}' has no skinned gait (only idle/walk/run); rendered idle`,
      });
    }
  }

  // 7. STUBBED traits — captured, never faked (the underlying CharacterHost seams don't exist).
  if (traits.has('morph'))
    report.stubbed.push({ trait: '@morph', reason: 'no FACS/morph-target channel yet' });
  if (traits.has('skeleton'))
    report.stubbed.push({ trait: '@skeleton', reason: 'host fixed to HUMANOID_65; no skeleton swap' });
  // @hair: the procedural body DOES grow hair, but its colour/style aren't author-driven yet.
  if (traits.has('hair'))
    report.warnings.push('@hair present: default procedural hair rendered; style/colour not yet author-driven');

  return { ok: true, host, gait, materialColor: color, report };
}
