import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { canonicalSourceDiagnostics } from '../canonicalDiagnostics';

const DIR = path.resolve(__dirname, '../../../core/strict/corpus/invalid');
const GRANT = 'grant_ava_2026_10_14';
const claimed = (trait: string) =>
  `object "Ava" {\n  @consent_gate(grant: "${GRANT}")\n  @${trait}\n}\n`;
const likeness = (text: string, rules?: Record<string, string[]>) =>
  canonicalSourceDiagnostics(text, 'holo', rules).diagnostics.filter((d) => d.code === 'HS1011');

describe('LSP: HS1011 likeness shows as an error', () => {
  it.each([
    ['voice', 'voice_print', 'likeness-voice-trait-grant.holo'],
    ['face', 'face_mesh', 'likeness-face-no-claim.holo'],
    ['body', 'body_scan', 'likeness-body-no-claim.holo'],
  ])(
    '%s: the corpus file shows HS1011; a claim with the rule yes shows none',
    (source, trait, file) => {
      const shown = likeness(readFileSync(path.join(DIR, file), 'utf8'));
      expect(shown).toHaveLength(1);
      expect(shown[0].severity).toBe(DiagnosticSeverity.Error);
      expect(shown[0].range.start).toEqual({ line: 1, character: 2 });
      expect(likeness(claimed(trait))).toHaveLength(1);
      expect(likeness(claimed(trait), { [GRANT]: [source] })).toHaveLength(0);
    }
  );

  it('a trait-held grant shows HS1011 even when the rule says yes', () => {
    const text = readFileSync(path.join(DIR, 'likeness-voice-trait-grant.holo'), 'utf8');
    expect(likeness(text, { [GRANT]: ['voice'] })).toHaveLength(1);
  });

  it('Trust and Consent: replayed lip sync without a grant shows HS1011; live own mic does not', () => {
    expect(likeness(`object "Ava" {\n  @lip_sync(source: "audio_node")\n}\n`)).toHaveLength(1);
    expect(likeness(`object "Ava" {\n  @lip_sync(source: "microphone")\n}\n`)).toHaveLength(0);
  });
});
