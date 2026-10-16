import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../args';
import { loadConsentRules, parseConsentRules, validateForCli } from '../consent-rules';

const DIR = path.resolve(__dirname, '../../../core/strict/corpus/invalid');
const GRANT = 'grant_ava_2026_10_14';
const claimed = (trait: string) =>
  `object "Ava" {\n  @consent_gate(grant: "${GRANT}")\n  @${trait}\n}\n`;
const codes = (r: { errors: Array<{ code?: string }> }) => r.errors.map((e) => e.code);

describe('holoscript validate: HS1011 likeness', () => {
  it('parses --consent-rules', () => {
    expect(parseArgs(['validate', 'a.holo', '--consent-rules', 'rules.json']).consentRules).toBe(
      'rules.json'
    );
  });

  it.each([
    ['voice', 'voice_print', 'likeness-voice-trait-grant.holo'],
    ['face', 'face_mesh', 'likeness-face-no-claim.holo'],
    ['body', 'body_scan', 'likeness-body-no-claim.holo'],
  ])(
    '%s: the corpus file is refused; a claim with the rule yes is accepted',
    (source, trait, file) => {
      const refused = validateForCli(readFileSync(path.join(DIR, file), 'utf8'), file);
      expect(refused.valid).toBe(false);
      expect(codes(refused)).toContain('HS1011');
      expect(validateForCli(claimed(trait), 'ava.holo').valid).toBe(false);
      const dir = mkdtempSync(path.join(os.tmpdir(), 'hs1011-'));
      const rulesFile = path.join(dir, 'rules.json');
      writeFileSync(rulesFile, JSON.stringify({ [GRANT]: [source] }));
      const ok = validateForCli(claimed(trait), 'ava.holo', loadConsentRules(rulesFile));
      expect(ok.valid, JSON.stringify(ok.errors)).toBe(true);
    }
  );

  it('a trait-held grant is refused even when the rule says yes', () => {
    const r = validateForCli(
      readFileSync(path.join(DIR, 'likeness-voice-trait-grant.holo'), 'utf8'),
      'ava.holo',
      { [GRANT]: ['voice'] }
    );
    expect(codes(r)).toEqual(['HS1011']);
  });

  it('Trust and Consent: replayed lip sync without a grant is refused; live own mic is not', () => {
    expect(codes(validateForCli(`object "Ava" {\n  @lip_sync(source: "audio_node")\n}\n`, 'ava.holo'))).toContain('HS1011');
    expect(codes(validateForCli(`object "Ava" {\n  @lip_sync(source: "microphone")\n}\n`, 'ava.holo'))).not.toContain('HS1011');
  });

  it('Trust and Consent: tracking source — missing/unknown and remote_user refused, live_self passes', () => {
    const o = (t: string) => `object "Ava" {\n  ${t}\n}\n`;
    expect(codes(validateForCli(o('@face_tracking'), 'ava.holo'))).toContain('HS1011');
    expect(codes(validateForCli(o('@face_tracking(source: "webcam")'), 'ava.holo'))).toContain('HS1011');
    expect(codes(validateForCli(o('@body_tracking(source: "remote_user")'), 'ava.holo'))).toContain('HS1011');
    expect(codes(validateForCli(o('@body_tracking(source: "live_self")'), 'ava.holo'))).not.toContain('HS1011');
  });

  it('Trust: avatar_embodiment playback/remote need a grant; synthetic ai and headset pass', () => {
    const o = (t: string) => `object "Ava" {\n  ${t}\n}\n`;
    expect(codes(validateForCli(o('@avatar_embodiment(tracking_source: "playback")'), 'ava.holo'))).toContain('HS1011');
    expect(codes(validateForCli(o('@avatar_embodiment(tracking_source: "remote")'), 'ava.holo'))).toContain('HS1011');
    const g = `object "Ava" {\n  @consent_gate(grant: "${GRANT}")\n  @avatar_embodiment(tracking_source: "playback")\n}\n`;
    expect(validateForCli(g, 'ava.holo', { [GRANT]: ['body'] }).valid).toBe(true);
    expect(codes(validateForCli(o('@avatar_embodiment(tracking_source: "headset")'), 'ava.holo'))).not.toContain('HS1011');
    expect(codes(validateForCli(o('@avatar_embodiment(tracking_source: "ai")'), 'ava.holo'))).not.toContain('HS1011');
  });

  it('rejects a malformed rules file', () => {
    expect(() => parseConsentRules('{"g": ["smell"]}')).toThrow(/face, voice, body/);
    expect(() => parseConsentRules('[]')).toThrow(/expected an object/);
  });
});
