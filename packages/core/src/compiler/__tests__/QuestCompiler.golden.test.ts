/**
 * QuestCompiler golden-output test — production-side drift guard for `compile_to_quest`.
 *
 * Asserts that the in-core QuestCompiler emits BYTE-FOR-BYTE the on-device-proven reference app
 * at `apps/quest-universal-qr-scanner/android`. This is the production twin of the pre-commit
 * gate `scripts/holo-ci/check-quest-emit-matches-reference.mjs` (which guards the dev/Node emitter
 * `quest-emit.mjs`). Both anchor to the SAME reference app, so the two emitters cannot drift apart:
 * a string-templater change that silently diverges from the maintained, on-device-proven app makes
 * THIS test (or the gate) go red. Line endings are normalised (CRLF→LF) so a developer's git
 * `core.autocrlf` cannot cause false drift; everything else must match exactly.
 *
 * When the reference app changes intentionally, update the emitter (QuestCompiler / quest-emit.mjs)
 * so output matches again — never edit one side to match a drifted other.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QuestCompiler } from '../QuestCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

// packages/core/src/compiler/__tests__ → repo root (5 levels up)
const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDir, '..', '..', '..', '..', '..');
const appDir = join(repoRoot, 'apps', 'quest-universal-qr-scanner');

const norm = (s: string) => s.replace(/\r\n/g, '\n');

describe('QuestCompiler → golden reference app', () => {
  // compile() ignores the composition for the canonical scanner (config comes from option
  // defaults == scanner.holo); an empty composition is sufficient. Empty token skips RBAC.
  const compiler = new QuestCompiler();
  const emitted = compiler.compile({} as HoloComposition, '');

  it('emits the full 11-file app project', () => {
    expect(Object.keys(emitted)).toHaveLength(11);
  });

  it('every emitted file byte-matches the on-device-proven reference', () => {
    const drift: string[] = [];
    for (const [relPath, got] of Object.entries(emitted)) {
      let ref: string;
      try {
        ref = readFileSync(join(appDir, relPath), 'utf8');
      } catch {
        drift.push(`MISSING reference file: ${relPath}`);
        continue;
      }
      if (norm(got) !== norm(ref)) {
        const a = norm(got).split('\n');
        const b = norm(ref).split('\n');
        let firstDiff = '';
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
          if (a[i] !== b[i]) {
            firstDiff = `line ${i + 1}: emitted=${JSON.stringify(a[i])} reference=${JSON.stringify(b[i])}`;
            break;
          }
        }
        drift.push(`DRIFT ${relPath} — ${firstDiff}`);
      }
    }
    expect(drift).toEqual([]);
  });
});
