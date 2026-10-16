/**
 * N-2 (Mapping): KnownTraits folds case and underscores, so HS1011 must too. Every spelling of a
 * likeness or source-gated tracking trait is refused with HS1011 when no grant is held, on the
 * canonical validator (CLI, MCP, LSP) and on the strict layer, with and without core's check.
 */
import { describe, expect, it } from 'vitest';
import { validateCanonicalSource } from '../CanonicalSourceValidator';
import { likenessTraitName, LIKENESS_SOURCES, SOURCE_GATED_TRACKING } from '../LikenessCheck';
import { isKnownTrait } from '../KnownTraits';
import { resolveTraitName, traitNameKey } from '../TraitName';
import * as parser from '../../parser/index';
// @ts-expect-error -- plain .mjs without types
import { analyze } from '../../../strict/holo_strict.mjs';

// Mapping's named cases first, then every other spelling family.
const VARIANTS: Array<[string, string]> = [
  ['facemesh', 'face_mesh'],
  ['bodyscan', 'body_scan'],
  ['facetracking', 'face_tracking'],
  ['face_tracking', 'face_tracking'],
  ['voiceprint', 'voice_print'],
  ['FaceMesh', 'face_mesh'],
  ['face_Mesh', 'face_mesh'],
  ['FACE_MESH', 'face_mesh'],
  ['face__mesh', 'face_mesh'],
  ['faceMesh', 'face_mesh'],
  ['VoicePrint', 'voice_print'],
  ['VOICEPRINT', 'voice_print'],
  ['BodyScan', 'body_scan'],
  ['body_Scan', 'body_scan'],
  ['LipSync', 'lip_sync'],
  ['lipSync', 'lip_sync'],
  ['LIP_SYNC', 'lip_sync'],
  ['lipsync', 'lipsync'],
  ['LIPSYNC', 'lipsync'],
  ['FaceTracking', 'face_tracking'],
  ['face_Tracking', 'face_tracking'],
  ['bodytracking', 'body_tracking'],
  ['BodyTracking', 'body_tracking'],
  ['body_tracking', 'body_tracking'],
];

const src = (name: string) => `composition "Variant" {\n  object "Ava" {\n    @${name} { }\n  }\n}\n`;
const strictDeps = {
  tokenizeHoloSource: parser.tokenizeHoloSource,
  parseHolo: parser.parseHolo,
  isKnownTrait: parser.isKnownTrait,
  declaredTraitNames: parser.declaredTraitNames,
  checkLikeness: parser.checkLikeness,
  likenessTraitName: parser.likenessTraitName,
  likenessSources: { ...parser.LIKENESS_SOURCES, ...parser.SOURCE_GATED_TRACKING },
};
const fallbackDeps = { tokenizeHoloSource: parser.tokenizeHoloSource, parseHolo: parser.parseHolo };
const codes = (ds: Array<{ code?: string; severity?: string }>) => ds.map((d) => d.code);

describe('one folding for HS1006 and HS1011', () => {
  it('KnownTraits and LikenessCheck use the same key', () => {
    for (const [written, canonical] of VARIANTS) {
      expect(likenessTraitName(written)).toBe(canonical);
      expect(traitNameKey(written)).toBe(traitNameKey(canonical));
      expect(isKnownTrait(written)).toBe(isKnownTrait(canonical));
    }
    const gated = [...Object.keys(LIKENESS_SOURCES), ...Object.keys(SOURCE_GATED_TRACKING)];
    expect(resolveTraitName('consent_gate', gated)).toBeUndefined();
  });
});

describe.each(VARIANTS)('@%s (a spelling of %s) with no grant', (written) => {
  it('canonical validator: HS1011 error, not valid', () => {
    const r = validateCanonicalSource({ source: src(written), surface: 'holo' });
    expect(r.valid).toBe(false);
    expect(codes(r.errors)).toContain('HS1011');
  });
  it('strict with core: HS1011 error', () => {
    const r = analyze(src(written), strictDeps);
    expect(r.diagnostics.filter((d: { severity: string }) => d.severity === 'error').map((d: { code: string }) => d.code)).toContain('HS1011');
  });
  it('strict without core (fail closed): HS1011 error', () => {
    const r = analyze(src(written), fallbackDeps);
    expect(codes(r.diagnostics)).toContain('HS1011');
  });
});

describe('live exemptions still hold for every spelling', () => {
  it.each(['face_tracking', 'facetracking', 'FaceTracking', 'BodyTracking'])('@%s source: "live_self" needs no grant', (n) => {
    const r = validateCanonicalSource({ source: src(n).replace('{ }', '{ source: "live_self" }'), surface: 'holo' });
    expect(codes(r.errors)).not.toContain('HS1011');
  });
  it.each(['facetracking', 'FaceTracking'])('@%s source: "recording" needs the grant', (n) => {
    const r = validateCanonicalSource({ source: src(n).replace('{ }', '{ source: "recording" }'), surface: 'holo' });
    expect(codes(r.errors)).toContain('HS1011');
  });
});
