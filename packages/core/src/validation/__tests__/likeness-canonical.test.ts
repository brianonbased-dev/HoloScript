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
    // face_tracking and body_tracking: only source "live_self" is exempt; omitted is refused (N-2)
    expect(hs1011(v(obj('  @face_tracking\n  @body_tracking')))).toBe(2);
    expect(
      hs1011(v(obj('  @face_tracking { source: "live_self" }\n  @body_tracking { source: "live_self" }')))
    ).toBe(0);
  });

  describe('Trust and Consent: face_tracking / body_tracking source', () => {
    const v = (src: string, consentRules?: Record<string, string[]>) =>
      validateCanonicalSource({ source: src, surface: 'holo', consentRules });
    const obj = (body: string) => `object "Ava" {\n${body}\n}\n`;
    it.each(['face_tracking', 'body_tracking'])(
      '1. %s with a missing or unknown source is a likeness (fail closed)',
      (t) => {
        expect(hs1011(v(obj(`  @${t}`)))).toBe(1);
        expect(hs1011(v(obj(`  @${t}(source: "webcam")`)))).toBe(1);
        expect(hs1011(v(obj(`  @${t}(source: 42)`)))).toBe(1);
        expect(hs1011(v(obj(`  @${t}(source: "recording")`)))).toBe(1);
      }
    );
    it.each([
      ['face_tracking', 'face'],
      ['body_tracking', 'body'],
    ])('2. %s remote_user is gated; a grant with the rule yes passes', (t, src) => {
      expect(hs1011(v(obj(`  @${t}(source: "remote_user")`)))).toBe(1);
      const granted = obj(`  @consent_gate(grant: "${GRANT}")\n  @${t}(source: "remote_user")`);
      expect(hs1011(v(granted))).toBe(1);
      expect(v(granted, { [GRANT]: [src] }).valid).toBe(true);
    });
    it.each(['face_tracking', 'body_tracking'])(
      '3. %s live_self passes the validator statically (runtime verifies the device)',
      (t) => {
        expect(hs1011(v(obj(`  @${t}(source: "live_self")`)))).toBe(0);
      }
    );
  });

  describe('Trust: avatar_embodiment gates on whose likeness it carries', () => {
    const v = (src: string, consentRules?: Record<string, string[]>) =>
      validateCanonicalSource({ source: src, surface: 'holo', consentRules });
    const obj = (body: string) => `object "Ava" {\n${body}\n}\n`;
    it.each(['playback', 'remote'])('%s (a real person\'s tracking) with no grant is refused; with a grant and the rule yes it applies', (ts) => {
      expect(hs1011(v(obj(`  @avatar_embodiment(tracking_source: "${ts}")`)))).toBe(1);
      const granted = obj(`  @consent_gate(grant: "${GRANT}")\n  @avatar_embodiment(tracking_source: "${ts}")`);
      expect(hs1011(v(granted))).toBe(1);
      expect(v(granted, { [GRANT]: ['body'] }).valid).toBe(true);
    });
    it('a synthetic avatar is exempt for ai, unknown, omitted and live sources', () => {
      for (const t of ['@avatar_embodiment', '@avatar_embodiment(tracking_source: "ai")', '@avatar_embodiment(tracking_source: "scripted")', '@avatar_embodiment(tracking_source: "headset")']) {
        expect(hs1011(v(obj(`  ${t}`))), t).toBe(0);
      }
    });
    it('on a real-likeness avatar, ai / unknown / omitted need the grant; live does not', () => {
      const claimed = (t: string) => obj(`  @consent_gate(grant: "${GRANT}")\n  @face_mesh\n  ${t}`);
      const yes = { [GRANT]: ['face', 'body'] };
      for (const t of ['@avatar_embodiment', '@avatar_embodiment(tracking_source: "ai")', '@avatar_embodiment(tracking_source: "scripted")']) {
        expect(hs1011(v(claimed(t), { [GRANT]: ['face'] })), t).toBe(1);
        expect(v(claimed(t), yes).valid, t).toBe(true);
      }
      expect(hs1011(v(claimed('@avatar_embodiment(tracking_source: "headset")'), { [GRANT]: ['face'] }))).toBe(0);
    });
  });

  it('the @body_scan trait definition is not a use', () => {
    const def = readFileSync(path.resolve(__dirname, '../../traits/vision/body_scan.holo'), 'utf8');
    expect(hs1011(validateCanonicalSource({ source: def, surface: 'holo' }))).toBe(0);
  });
});
