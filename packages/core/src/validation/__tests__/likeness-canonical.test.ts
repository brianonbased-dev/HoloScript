import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateCanonicalSource } from '../CanonicalSourceValidator';

const read = (f: string) =>
  readFileSync(path.resolve(__dirname, '../../../strict/corpus/invalid', f), 'utf8');
const GRANT = 'grant_ava_2026_10_14';
const hs1011 = (r: { errors: Array<{ code?: string }> }) =>
  r.errors.filter((e) => e.code === 'HS1011').length;
const claimed = (trait: string) =>
  `object "Ava" {\n  @consent_gate(grant: "${GRANT}")\n  @${trait}\n}\n`;

describe('canonical validator: HS1011 likeness (fail closed)', () => {
  it.each([
    ['face', 'face_mesh', 'likeness-face-no-claim.holo'],
    ['voice', 'voice_print', 'likeness-voice-no-claim.holo'],
    ['body', 'body_scan', 'likeness-body-no-claim.holo'],
  ])(
    '%s: refused with no claim, refused with no rules, accepted with the rule yes',
    (source, trait, file) => {
      expect(hs1011(validateCanonicalSource({ source: read(file), surface: 'holo' }))).toBe(1);
      expect(validateCanonicalSource({ source: claimed(trait), surface: 'holo' }).valid).toBe(
        false
      );
      const yes = validateCanonicalSource({
        source: claimed(trait),
        surface: 'holo',
        consentRules: { [GRANT]: [source] },
      });
      expect(yes.valid, JSON.stringify(yes.errors)).toBe(true);
    }
  );

  it('fault #1: a trait-held grant is refused even with the rule yes', () => {
    const r = validateCanonicalSource({
      source: read('likeness-voice-trait-grant.holo'),
      surface: 'holo',
      consentRules: { [GRANT]: ['face', 'voice', 'body'] },
    });
    expect(r.valid).toBe(false);
    expect(r.errors.map((e) => [e.code, e.line, e.column])).toEqual([['HS1011', 2, 3]]);
  });

  it('Trust and Consent: replayed lip sync without a grant is refused; live own mic is exempt', () => {
    const v = (src: string, consentRules?: Record<string, string[]>) =>
      validateCanonicalSource({ source: src, surface: 'holo', consentRules });
    const obj = (body: string) => `object "Ava" {\n${body}\n}\n`;
    // replayed recording, unknown and missing sources all fail closed
    expect(hs1011(v(obj('  @lip_sync(source: "audio_node")')))).toBe(1);
    expect(hs1011(v(obj('  @lipsync(source: "audio_file")')))).toBe(1);
    expect(hs1011(v(obj('  @lip_sync(source: "clips/ava.wav")')))).toBe(1);
    expect(hs1011(v(obj('  @lip_sync')))).toBe(1);
    // live user's own capture stays exempt; a granted replay is accepted
    expect(hs1011(v(obj('  @lip_sync(source: "microphone")')))).toBe(0);
    expect(hs1011(v(obj('  @lipsync(source: "live_mic")')))).toBe(0);
    const granted = obj(`  @consent_gate(grant: "${GRANT}")\n  @lip_sync(source: "audio_node")`);
    expect(hs1011(v(granted))).toBe(1);
    expect(v(granted, { [GRANT]: ['voice'] }).valid).toBe(true);
    // a commented-out `@lip_sync` does not shift the reported position
    const commented = v(`// @lip_sync in a comment\nobject "Ava" {\n  @lip_sync\n}\n`);
    expect(commented.errors.map((e) => [e.code, e.line, e.column])).toEqual([['HS1011', 3, 3]]);
    // face_tracking and body_tracking declare no source parameter: ungated
    expect(hs1011(v(obj('  @face_tracking\n  @body_tracking')))).toBe(0);
  });

  it('the @body_scan trait definition is not a use', () => {
    const def = readFileSync(path.resolve(__dirname, '../../traits/vision/body_scan.holo'), 'utf8');
    expect(hs1011(validateCanonicalSource({ source: def, surface: 'holo' }))).toBe(0);
  });
});
