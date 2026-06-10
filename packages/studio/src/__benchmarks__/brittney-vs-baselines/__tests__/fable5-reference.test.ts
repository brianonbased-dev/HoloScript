/**
 * Fable-5 Ultracode reference bar — integrity tests (founder 2026-06-10).
 *
 * The reference transcripts ARE the benchmark bar, so they must be green by
 * construction: every fable5-dimension task has a reference artifact, and
 * every deterministically-verifiable criterion passes against it. If a
 * future edit breaks a reference, this fails before any benchmark run does.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadAllTasks } from '../tasks';
import { verifyDeterministically, hasDeterministicVerifier } from '../deterministic-verifier';
import { makeFable5UltracodeReference, type Fable5ReferenceArtifact } from '../configs/fable5-ultracode';
import type { Task } from '../types';

const REF_DIR = path.join(__dirname, '..', 'reference', 'fable5');

function fable5Tasks(): Task[] {
  return loadAllTasks().filter((t) => t.tier === 'fable5-dimension');
}

describe('fable5-dimension task set', () => {
  it('loads 40 tasks total with exactly 10 fable5-dimension tasks across 5 dimensions', () => {
    const all = loadAllTasks();
    expect(all.length).toBe(40);
    const f5 = fable5Tasks();
    expect(f5.length).toBe(10);
    const dims = new Set(f5.map((t) => t.dimension));
    expect(dims).toEqual(
      new Set(['orchestration', 'capability-mindset', 'physics', 'reality', 'game-feel'])
    );
    for (const dim of dims) {
      expect(f5.filter((t) => t.dimension === dim).length).toBe(2);
    }
  });

  it('every fable5 task has a reference artifact authored by Fable 5 on Ultracode', () => {
    for (const t of fable5Tasks()) {
      const file = path.join(REF_DIR, `${t.id}.json`);
      expect(fs.existsSync(file), `missing reference for ${t.id}`).toBe(true);
      const art = JSON.parse(fs.readFileSync(file, 'utf8')) as Fable5ReferenceArtifact;
      expect(art.task_id).toBe(t.id);
      expect(art.authored_by).toContain('claude-fable-5');
      expect(art.output_text.length).toBeGreaterThan(50);
    }
  });

  it('every deterministically-verifiable criterion PASSES against the reference (the bar is green by construction)', () => {
    for (const t of fable5Tasks()) {
      if (!hasDeterministicVerifier(t.id)) continue;
      const art = JSON.parse(
        fs.readFileSync(path.join(REF_DIR, `${t.id}.json`), 'utf8')
      ) as Fable5ReferenceArtifact;
      const results = verifyDeterministically(t, art.scene_mutations);
      expect(results.length, `${t.id}: verifier returned no results`).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.passed, `${t.id}/${r.criterion_id}: ${r.rationale}`).toBe(true);
      }
    }
  });

  it('replay config serves reference artifacts and errors honestly on uncovered tasks', async () => {
    const runner = makeFable5UltracodeReference();
    expect(runner.name).toBe('fable5-ultracode');
    const f5 = fable5Tasks();
    const ac = new AbortController();
    const result = await runner.run(f5[0], ac.signal);
    expect(result.error).toBeUndefined();
    expect(result.model_id).toContain('replay');
    expect(result.usage.input_tokens).toBe(0);
    // A non-fable5 task has no reference — must surface an error, never an empty pass.
    const other = loadAllTasks().find((t) => t.tier === 'trivial-scene')!;
    const miss = await runner.run(other, ac.signal);
    expect(miss.error).toContain('no Fable-5 reference transcript');
  });
});
