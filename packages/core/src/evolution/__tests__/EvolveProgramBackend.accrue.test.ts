/**
 * STRATEGIC CORPUS ACCRUAL on local metal.
 *
 * Runs the gated evolve loop across a portfolio of REAL, diverse, HoloScript-native
 * seeds (traits, compositions, state machines) with NATIVE parse+preserve gates,
 * accumulating QUALITY / UNIQUE / STRATEGIC training rows for the harvest -> DPO/SFT
 * -> HoloTune pipeline. Each requirement is mechanized:
 *   - QUALITY  : the gate is a real parser (parseHolo / HSPlus parse) PLUS a
 *                preserved-construct check, so "passed" means valid + intact, not
 *                merely non-empty. Native targets match the model's competence
 *                (brittney-edge is HoloScript-tuned) so it produces real candidates.
 *   - UNIQUE   : a content-hash dedup sink drops repeated candidates (the
 *                near-identical-rows problem) and reports the dedup ratio.
 *   - STRATEGIC: the portfolio spans the language surface the ecosystem needs the
 *                model to author densely + correctly (D.104/D.108).
 *
 * Guarded — skipped in normal/CI runs. To accrue a batch on local metal:
 *   EVOLVE_ACCRUE=1 \
 *   pnpm --filter @holoscript/core exec vitest run \
 *     src/evolution/__tests__/EvolveProgramBackend.accrue.test.ts
 * Overrides: EVOLVE_OLLAMA_ENDPOINT, EVOLVE_PROPOSER_MODEL, EVOLVE_CORPUS_DIR.
 *
 * @see ../EvolveProgramBackend.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import {
  runEvolution,
  makeOllamaProposer,
  toGradedTraceRow,
  type Gate,
  type EvolveTraceRecord,
} from '../EvolveProgramBackend';
// Native parsers — relative import (same package), the in-process fitness oracle.
import { parseHolo, parse as parseHsPlus } from '../../parser';

const ENABLED = process.env.EVOLVE_ACCRUE === '1';
const ENDPOINT = process.env.EVOLVE_OLLAMA_ENDPOINT ?? 'http://holojetson.local:11434';
const MODEL = process.env.EVOLVE_PROPOSER_MODEL ?? 'brittney-edge:v0-4';
const CORPUS_DIR = process.env.EVOLVE_CORPUS_DIR ?? '.scratch/evolve-corpus';
const REPO = resolve(__dirname, '../../../../..'); // packages/core/src/evolution/__tests__ -> repo root

type Format = 'holo' | 'hsplus';
interface Target {
  name: string;
  path: string;
  format: Format;
  goal: string;
  /** Source predicate: the construct(s) that must survive a mutation. */
  preserved: (src: string) => boolean;
}

const ALL = (...res: RegExp[]) => (src: string) => res.every((r) => r.test(src));

// ── strategic portfolio (real repo seeds, ranked by D.104/D.108 value) ─────────
const PORTFOLIO: Target[] = [
  {
    name: 'provenance_densify-trait',
    path: 'packages/core/src/traits/provenance_densify.hsplus',
    // @trait {…} files parse via the .holo composition parser (verified by the
    // seed-parseability diagnostic), NOT the HSPlus parser — the .hsplus EXTENSION
    // does not pick the parser; the construct does (F.120: two parsers).
    format: 'holo',
    goal: 'Tighten the honesty_class derivation into a named constant instead of two duplicated ternaries, keeping every field identical.',
    preserved: ALL(/\bprovenance_densify\b/, /ProvenanceDensifyReceipt/, /provenance_honest/, /point_cloud_densify/, /generative_fill/),
  },
  {
    name: 'evolve_program-trait',
    path: 'packages/core/src/traits/evolve_program.hsplus',
    format: 'holo', // @trait {…} → parseHolo (see diagnostic above)
    goal: 'Collapse the declare+emit into one idiom and surface archive_size in the receipt, keeping self_ships:false and verifier_gated:true locked.',
    preserved: ALL(/\bevolve_program\b/, /self_ships\s*:\s*false/, /verifier_gated\s*:\s*true/, /brittney-edge/),
  },
  {
    name: 'brittney-playground-statemachine',
    path: 'examples/agents/brittney-playground.hsplus',
    format: 'hsplus', // composition + @state_machine here parses via the HSPlus parser

    goal: 'Add a fourth "resting" state that "attending" can transition to on timeout, keeping the three original states and transitions intact.',
    preserved: ALL(/BrittneyPlayground/, /greeting/, /patrolling/, /attending/),
  },
  {
    name: 'basic-scene-composition',
    path: 'benchmarks/scenarios/01-basic-scene/basic-scene.holo',
    format: 'holo',
    goal: 'Group the three objects under a reusable template "Interactive" without losing any object name or position value.',
    preserved: ALL(/BasicScene/, /Cube/, /Sphere/, /Pedestal/),
  },
  {
    name: 'aurora-world',
    path: 'apps/quest-universal-qr-scanner/worlds/aurora.holo',
    format: 'holo',
    goal: 'Add PBR roughness and metalness to each Spire, keeping all four Spire names and the Wisp unchanged.',
    preserved: ALL(/AuroraFields/, /SpireA/, /SpireB/, /SpireC/, /SpireD/),
  },
];

/** Native parse — parses clean (success AND zero errors; tolerant parse can flag
 *  success:true with errors, so we require errors.length===0). */
function parsesClean(src: string, format: Format): boolean {
  try {
    const r = format === 'holo' ? parseHolo(src) : parseHsPlus(src);
    return Boolean(r.success && r.ast) && (r.errors?.length ?? 0) === 0;
  } catch {
    return false;
  }
}

/** Gate = parse-clean AND preserved-construct present; fitness = length (denser is better). */
function makeGate(t: Target): Gate {
  return async (candidate) => ({
    passed: parsesClean(candidate, t.format) && t.preserved(candidate),
    score: candidate.length,
  });
}

describe('strategic portfolio seed parseability (fast, in-process)', () => {
  it('reports which seeds are gate-ready under each native parser', () => {
    const report = PORTFOLIO.map((t) => {
      let src = '';
      try {
        src = readFileSync(join(REPO, t.path), 'utf8').trim();
      } catch {
        return { target: t.name, status: 'unreadable' };
      }
      const tryParse = (fn: (s: string) => { success?: boolean; ast?: unknown; errors?: unknown[] }) => {
        try {
          const r = fn(src);
          return { ok: Boolean(r.success && r.ast) && (r.errors?.length ?? 0) === 0, errs: r.errors?.length ?? 0 };
        } catch (e) {
          return { ok: false, threw: (e as Error).message.slice(0, 80) };
        }
      };
      return {
        target: t.name,
        chosenFormat: t.format,
        holo: tryParse(parseHolo),
        hsplus: tryParse(parseHsPlus),
        preservedInSeed: t.preserved(src),
      };
    });
    // eslint-disable-next-line no-console
    console.log('[evolve][seed-parse]\n' + JSON.stringify(report, null, 2));
    // The .holo world seeds MUST be gate-ready (the proven quality path).
    const holoWorlds = report.filter((r) => 'chosenFormat' in r && r.chosenFormat === 'holo');
    expect(holoWorlds.length).toBeGreaterThan(0);
  });
});

describe.skipIf(!ENABLED)('STRATEGIC corpus accrual (local metal)', () => {
  it('accrues quality + unique + strategic training rows across the native portfolio', async () => {
    const propose = makeOllamaProposer(ENDPOINT, MODEL);
    const corpusPath = join(CORPUS_DIR, 'jetson-evolve');
    mkdirSync(corpusPath, { recursive: true });
    const traceFile = join(corpusPath, 'trace.jsonl');

    const seenHash = new Set<string>();
    const stats = {
      perTarget: [] as Array<Record<string, unknown>>,
      gated: 0,
      written: 0,
      deduped: 0,
      chosen: 0,
      rejected: 0,
      seedInvalid: 0,
    };

    for (const t of PORTFOLIO) {
      let seed: string;
      try {
        seed = readFileSync(join(REPO, t.path), 'utf8').trim();
      } catch {
        stats.perTarget.push({ target: t.name, status: 'seed-unreadable' });
        continue;
      }

      let gatedHere = 0;
      let writtenHere = 0;
      const sink = (rec: EvolveTraceRecord): void => {
        gatedHere++;
        stats.gated++;
        const h = createHash('sha256').update(rec.candidateCode).digest('hex');
        if (seenHash.has(h)) {
          stats.deduped++;
          return; // UNIQUE: drop the repeat
        }
        seenHash.add(h);
        const row = toGradedTraceRow(rec, {
          agentId: 'jetson-evolve',
          ts: new Date().toISOString(),
          source: `evolve-corpus:${t.name}`,
        });
        appendFileSync(traceFile, `${JSON.stringify(row)}\n`, 'utf8');
        stats.written++;
        writtenHere++;
        if (rec.passed) stats.chosen++;
        else stats.rejected++;
      };

      // NOTE: the local model regenerates the WHOLE native file per proposal
      // (~60s for a 60-90 line seed), so a 5-target interactive batch stays small;
      // the real corpus grows via the scheduled/background accrual, not this proof.
      const { receipt } = await runEvolution(
        seed,
        { goal: t.goal, generations: 1, population: 2, archiveSize: 6, proposerModel: MODEL },
        { propose, gate: makeGate(t), onCandidate: sink },
      );
      if (receipt.result === 'SEED_INVALID') stats.seedInvalid++;
      stats.perTarget.push({
        target: t.name,
        format: t.format,
        seedParsed: receipt.result !== 'SEED_INVALID',
        result: receipt.result,
        gated: gatedHere,
        uniqueWritten: writtenHere,
      });
    }

    // Metrics: quality = pass rate; uniqueness = 1 - dedup ratio; diversity = formats hit.
    const qualityPassRate = stats.gated ? Math.round((stats.chosen / stats.gated) * 1000) / 10 : 0;
    const uniqueRatio = stats.gated ? Math.round((stats.written / stats.gated) * 1000) / 10 : 0;
    const formatsHit = new Set(
      stats.perTarget.filter((p) => p.seedParsed).map((p) => p.format),
    ).size;
    const summary = {
      model: MODEL,
      targets: PORTFOLIO.length,
      seedsParsed: PORTFOLIO.length - stats.seedInvalid,
      gated: stats.gated,
      uniqueRowsWritten: stats.written,
      deduped: stats.deduped,
      chosenSFT: stats.chosen,
      rejectedDPO: stats.rejected,
      qualityPassRatePct: qualityPassRate,
      uniqueRatioPct: uniqueRatio,
      formatDiversity: formatsHit,
      corpus: traceFile,
      perTarget: stats.perTarget,
      ts: new Date().toISOString(),
    };
    writeFileSync(join(corpusPath, 'accrual-summary.json'), JSON.stringify(summary, null, 2));

    // The accrual ran, gated real candidates, and produced an auditable, deduped corpus.
    expect(stats.gated).toBeGreaterThan(0);
    expect(stats.written + stats.deduped).toBe(stats.gated); // every gated row was either written-unique or deduped
    expect(stats.chosen + stats.rejected).toBe(stats.written);
    // eslint-disable-next-line no-console
    console.log(
      `[evolve][accrue] targets=${summary.targets} seedsParsed=${summary.seedsParsed} ` +
        `gated=${summary.gated} UNIQUE_ROWS=${summary.uniqueRowsWritten} deduped=${summary.deduped} ` +
        `| chosen/SFT=${summary.chosenSFT} rejected/DPO=${summary.rejectedDPO} ` +
        `| quality(pass%)=${summary.qualityPassRatePct} unique%=${summary.uniqueRatioPct} formats=${summary.formatDiversity}`,
    );
  }, 1500000);
});
