import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { handleTool } from '../handlers';

const DIR = path.resolve(__dirname, '../../../core/strict/corpus/invalid');
const GRANT = 'grant_ava_2026_10_14';
const claimed = (trait: string) =>
  `object "Ava" {\n  @consent_gate(grant: "${GRANT}")\n  @${trait}\n}\n`;
type Result = { valid: boolean; errors: Array<{ code?: string }> };
const validate = async (code: string, consentRules?: unknown) =>
  (await handleTool('validate_holoscript', { code, format: 'holo', consentRules })) as Result;

describe('validate_holoscript: HS1011 likeness', () => {
  it.each([
    ['voice', 'voice_print', 'likeness-voice-trait-grant.holo'],
    ['face', 'face_mesh', 'likeness-face-no-claim.holo'],
    ['body', 'body_scan', 'likeness-body-no-claim.holo'],
  ])(
    '%s: the corpus file is refused; a claim with the rule yes is accepted',
    async (source, trait, file) => {
      const refused = await validate(readFileSync(path.join(DIR, file), 'utf8'));
      expect(refused.valid).toBe(false);
      expect(refused.errors.map((e) => e.code)).toContain('HS1011');
      expect((await validate(claimed(trait))).valid).toBe(false);
      const ok = await validate(claimed(trait), { [GRANT]: [source] });
      expect(ok.valid, JSON.stringify(ok.errors)).toBe(true);
    }
  );

  it('a trait-held grant is refused even when the rule says yes', async () => {
    const r = await validate(
      readFileSync(path.join(DIR, 'likeness-voice-trait-grant.holo'), 'utf8'),
      {
        [GRANT]: ['voice'],
      }
    );
    expect(r.valid).toBe(false);
    expect(r.errors.map((e) => e.code)).toEqual(['HS1011']);
  });

  it('Trust and Consent: replayed lip sync without a grant is refused; live own mic is not', async () => {
    expect((await validate(`object "Ava" {\n  @lip_sync(source: "audio_node")\n}\n`)).errors.map((e) => e.code)).toContain('HS1011');
    expect((await validate(`object "Ava" {\n  @lip_sync(source: "microphone")\n}\n`)).errors.map((e) => e.code)).not.toContain('HS1011');
  });
});
