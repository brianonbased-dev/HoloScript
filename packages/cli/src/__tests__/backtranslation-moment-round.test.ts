/**
 * Picture rounds ("one moment per question") for the founder — board task
 * task_1791235614927_x7l2. See backtranslation/moment-rounds.ts.
 *
 *   corepack pnpm --filter @holoscript/cli exec vitest run \
 *     src/__tests__/backtranslation-moment-round.test.ts
 *
 * Founder rounds (opt-in, talk to the running ai-ecosystem dashboard, DASHBOARD_URL):
 *   BACKTRANS_PUBLISH_ROUND=1   build a round of at most 5 moments with a fresh
 *                               random seed, seal its answer key under
 *                               fixtures/backtranslation/hvac/which-is-right/rounds/<id>/,
 *                               then push the questions (never the key).
 *                               BACKTRANS_ROUND_REPLACE=1 sets aside a round he started
 *                               (the dashboard keeps it, with his answers, in its history).
 *   BACKTRANS_COLLECT_ROUND=1   read his answers back, check the seal against the
 *                               dashboard's copy of the hash, grade, and write
 *                               receipt.json + receipt.txt next to the sealed key.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { GENERIC_SEED, generateGenericSituation } from './backtranslation/generic';
import {
  CHOICES,
  MAX_QUESTIONS,
  MODE_BADGE,
  buildMomentRound,
  choiceAfter,
  gradeMomentRound,
  momentCandidates,
  momentRoundProblems,
  momentSidesFromSeed,
  plainMomentReceipt,
  type MomentKey,
  type MomentRound,
} from './backtranslation/moment-rounds';
import { HVAC_ROOT, HVAC_TARGETS, slice3Inputs } from './backtranslation/slice3';
import {
  DASHBOARD_URL,
  DashboardNotRunning,
  codeWordFindings,
  collectAnswers,
  publishRound,
  readRecord,
  sealRound,
  sha256,
  verifySeal,
  writeRecord,
} from './backtranslation/which-is-right';

const PLAIN_CHECKER = 'C:/holo-dev/ai-ecosystem/scripts/check-plain-language.mjs';
const MOMENT_ROUNDS_ROOT = path.join(HVAC_ROOT, 'which-is-right', 'rounds');
/** The dashboard's own address on a port nothing listens on (the "not running" case). */
const NO_DASHBOARD = (() => {
  const u = new URL(DASHBOARD_URL);
  u.port = '9';
  return u.origin;
})();
const FIXED_SEED = 0x1234abcd;
const FIXED_TIME = '2026-10-05T20:00:00.000Z';
const candidates = momentCandidates();
const built = buildMomentRound({ seed: FIXED_SEED, createdAt: FIXED_TIME, salt: '00'.repeat(16), candidates });
const qs = built.publicRound.questions;
const screenText = (q: (typeof qs)[number]) => [
  q.title,
  q.mode.label,
  ...q.dials.map((d) => `${d.label} ${d.value}`),
  ...q.facts.map((f) => f.text),
  ...q.choices.map((c) => c.label),
];

const tmpDirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(path.join(tmpdir(), 'moment-round-'));
  tmpDirs.push(d);
  return d;
}
afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

describe('moment round — the questions', () => {
  it('has at most 5 questions, each one moment, mixing machines and planted faults with a rebuild disagreement', () => {
    expect(qs.length).toBe(MAX_QUESTIONS);
    expect(qs.every((q) => q.type === 'moment')).toBe(true);
    const classes = built.key.questions.map((q) => q.class);
    expect(classes.filter((c) => c === 'rebuild-disagreement').length).toBe(1);
    expect(new Set(built.key.questions.map((q) => q.behaviourId)).size).toBe(2);
    const faults = built.key.questions.filter((q) => q.class === 'planted-fault').map((q) => q.otherVersion);
    expect(new Set(faults).size).toBe(faults.length);
    expect(momentRoundProblems(built.publicRound)).toEqual([]);
  });

  it('every question shows mode, fan and the compressor timer in words; heat pumps also outdoor, strips and cut-off', () => {
    for (const q of qs) {
      const words = q.facts.map((f) => f.text);
      expect(words.some((w) => /^Mode: (Heat|Cool|Auto|Off)$/.test(w))).toBe(true);
      expect(q.mode.label).toBe(`Mode: ${q.mode.word}`);
      expect(words.some((w) => /^Fan: (Auto|On)$/.test(w))).toBe(true);
      expect(words.some((w) => /^Compressor/.test(w))).toBe(true);
      if (q.title === 'Heat pump') {
        expect(words.some((w) => /^Outdoors: \d+ degrees?$/.test(w))).toBe(true);
        expect(words.some((w) => /^Backup heat strips: /.test(w))).toBe(true);
        expect(words.some((w) => /^Outdoor cut-off: /.test(w))).toBe(true);
        expect(q.dials.map((d) => d.label)).toEqual(['Room', 'Set to', 'Outdoors']);
      } else {
        expect(q.dials.map((d) => d.label)).toEqual(['Room', 'Set to']);
      }
      expect(q.prompt).toBe('What should happen now?');
    }
  });

  it('carries no code words, no rules wall and no sums', () => {
    const text = qs.flatMap(screenText);
    expect(text.flatMap(codeWordFindings)).toEqual([]);
    for (const t of text) {
      expect(t.length).toBeLessThan(60);
      expect(t).not.toMatch(/[+*=]|\bminus\b|\bplus\b/);
    }
    const wire = JSON.stringify(built.publicRound);
    for (const word of ['correct', 'planted', 'rebuild', 'mutant', 'original', 'rules']) expect(wire).not.toContain(word);
  });

  it.skipIf(!existsSync(PLAIN_CHECKER))('passes the plain-language check (canon, strict), and the check can fail', () => {
    const run = (text: string): number => {
      try {
        execFileSync(process.execPath, [PLAIN_CHECKER, '--text', text, '--profile', 'canon', '--check', '--strict'], { stdio: 'pipe' });
        return 0;
      } catch (error) {
        return (error as { status?: number }).status ?? 99;
      }
    };
    const receipt = plainMomentReceipt(
      { shown: 5, answered: 5, knownAnswered: 5, right: 4, plantedShown: 4, plantedCaught: 3, rebuildShown: 1, rebuildAnswered: 1, rebuildSidedWithRules: 1, neitherVersion: 1, averageSeconds: 12 },
      true
    );
    const all = new Set([...qs.flatMap(screenText), ...qs.map((q) => q.prompt), receipt, 'Version A', 'Version B', 'Matches you', 'Does not match you', 'Next question']);
    expect(run([...all].join('\n'))).toBe(0);
    expect(run('We utilize a robust paradigm.')).toBe(1);
  });
});

describe('moment round — colours follow trade meaning only', () => {
  it('dials carry a label and a number and nothing else; the mode badge and choices take their tone from meaning', () => {
    for (const q of qs) {
      for (const d of q.dials) expect(Object.keys(d).sort()).toEqual(['label', 'value']);
      expect(q.mode.tone).toBe(MODE_BADGE[q.mode.word.toLowerCase()].tone);
      for (const c of q.choices) expect(c.tone).toBe(CHOICES[c.id].tone);
    }
    expect(CHOICES.cool.tone).toBe('cool');
    expect(CHOICES.heat.tone).toBe('heat');
    expect(CHOICES.backup.tone).toBe('heat');
    expect(CHOICES.off.tone).toBe('off');
    expect(CHOICES.fan.tone).toBe('off');
    expect(MODE_BADGE.auto.tone).toBe('neutral');
  });

  it('fails when the set-point dial is coloured, a badge or a choice takes the wrong colour (fault feed)', () => {
    const broken = (mutate: (r: MomentRound) => void): string[] => {
      const r = JSON.parse(JSON.stringify(built.publicRound)) as MomentRound;
      mutate(r);
      return momentRoundProblems(r);
    };
    expect(broken((r) => Object.assign(r.questions[0].dials[1], { tone: 'cool' })).join(' ')).toMatch(/Set to dial carries tone/);
    expect(broken((r) => Object.assign(r.questions[0].dials[1], { color: '#3b82f6' })).join(' ')).toMatch(/Set to dial carries color/);
    expect(broken((r) => { r.questions[0].mode.tone = r.questions[0].mode.tone === 'cool' ? 'heat' : 'cool'; }).join(' ')).toMatch(/mode badge colour/);
    expect(broken((r) => { r.questions[0].choices[0].id = 'heat'; r.questions[0].choices[0].tone = 'cool'; }).join(' ')).toMatch(/colour does not follow/);
  });
});

describe('moment round — choices', () => {
  it('offers 2 to 4 choices that make sense for the moment, always including what each version did', () => {
    for (const q of qs) {
      const ids = q.choices.map((c) => c.id);
      expect(ids.length).toBeGreaterThanOrEqual(2);
      expect(ids.length).toBeLessThanOrEqual(4);
      expect(ids).toContain(q.a.choice);
      expect(ids).toContain(q.b.choice);
      expect(q.a.choice).not.toBe(q.b.choice);
      expect(ids).toContain('off');
      const mode = q.mode.word.toLowerCase();
      // Heat is offered in cool mode (and cool in heat mode) only when a version did it.
      if (mode === 'cool' && ids.includes('heat')) expect([q.a.choice, q.b.choice]).toContain('heat');
      if (mode === 'heat' && ids.includes('cool')) expect([q.a.choice, q.b.choice]).toContain('cool');
      if (ids.includes('backup')) expect(q.title).toBe('Heat pump');
    }
  });

  it('the recorded results are what the programs really do in that moment', () => {
    for (const k of built.key.questions) {
      const target = HVAC_TARGETS.find((t) => t.id === k.behaviourId)!;
      const inputs = slice3Inputs(target);
      const steps = generateGenericSituation(inputs.spec, GENERIC_SEED, k.situation.iteration).steps.slice(0, k.situation.step + 1);
      expect(choiceAfter(inputs.originalSource, steps)).toBe(k.correctChoice);
      const q = qs.find((x) => x.n === k.n)!;
      expect(q[k.correctSide === 'A' ? 'a' : 'b'].choice).toBe(k.correctChoice);
      expect(q[k.correctSide === 'A' ? 'b' : 'a'].choice).toBe(k.otherChoice);
    }
  });
});

describe('moment round — A/B sides and the sealed key', () => {
  it('records the seed and every side in the key, reproducibly', () => {
    expect(built.key.seed).toBe(FIXED_SEED >>> 0);
    expect(built.key.questions.map((q) => q.correctSide)).toEqual(momentSidesFromSeed(FIXED_SEED, qs.length));
    const again = buildMomentRound({ seed: FIXED_SEED, createdAt: FIXED_TIME, salt: '00'.repeat(16), candidates });
    expect(again).toEqual(built);
    expect(momentSidesFromSeed(FIXED_SEED + 1, 5)).not.toEqual(momentSidesFromSeed(FIXED_SEED, 5));
  });

  it('seals the key before publishing, salted, and catches a key edited afterwards', () => {
    const dir = tmp();
    const round = buildMomentRound({ seed: 21, createdAt: FIXED_TIME, candidates });
    const record = sealRound(dir, round);
    expect(record.keySha256).toBe(round.publicRound.keySha256);
    expect(buildMomentRound({ seed: 21, createdAt: FIXED_TIME, candidates }).publicRound.keySha256).not.toBe(record.keySha256);
    record.published = { to: 'test', at: FIXED_TIME, dashboardKeySha256: record.keySha256 };
    writeRecord(dir, record);
    expect(verifySeal<MomentKey>(dir, record.keySha256).ok).toBe(true);
    const keyPath = path.join(dir, 'answer-key.json');
    const key = JSON.parse(readFileSync(keyPath, 'utf8')) as MomentKey;
    key.questions[0].correctSide = key.questions[0].correctSide === 'A' ? 'B' : 'A';
    writeFileSync(keyPath, `${JSON.stringify(key, null, 2)}\n`);
    const r2 = readRecord(dir);
    r2.keySha256 = sha256(readFileSync(keyPath));
    writeRecord(dir, r2);
    const seal = verifySeal<MomentKey>(dir, record.keySha256);
    expect(seal.ok).toBe(false);
    expect(seal.problems.join(' ')).toMatch(/dashboard stored/);
  });

  it('the publisher refuses a round that breaks the colour rule, before anything is sent', async () => {
    const dir = tmp();
    const round = buildMomentRound({ seed: 22, createdAt: FIXED_TIME, candidates });
    Object.assign(round.publicRound.questions[0].dials[1], { tone: 'cool' });
    sealRound(dir, round);
    await expect(publishRound(dir, { url: NO_DASHBOARD, validate: momentRoundProblems })).rejects.toThrow(/dials stay neutral/);
    expect(readRecord(dir).published).toBeUndefined();
  });

  it('a publisher with no dashboard says so plainly', async () => {
    const dir = tmp();
    sealRound(dir, buildMomentRound({ seed: 23, createdAt: FIXED_TIME, candidates }));
    await expect(publishRound(dir, { url: NO_DASHBOARD, validate: momentRoundProblems })).rejects.toBeInstanceOf(DashboardNotRunning);
  });
});

describe('moment round — receipt', () => {
  it('records his expected choice, which version matched, and the plain totals', () => {
    const answers: Record<string, { choice: string; seconds: number }> = {};
    built.key.questions.forEach((k, i) => {
      const q = qs.find((x) => x.n === k.n)!;
      const neither = q.choices.find((c) => c.id !== q.a.choice && c.id !== q.b.choice)!.id;
      answers[String(k.n)] = { choice: i === 0 ? k.otherChoice : i === 1 ? neither : k.correctChoice, seconds: 10 + i };
    });
    const r = gradeMomentRound(built.key, built.publicRound, answers, true);
    expect(r.totals.answered).toBe(5);
    expect(r.totals.right).toBe(3);
    expect(r.totals.neitherVersion).toBe(1);
    expect(r.questions[0].matchedVersion).toBe(built.key.questions[0].correctSide === 'A' ? 'B' : 'A');
    expect(r.questions[1].matchedVersion).toBe('neither');
    expect(r.questions[2].matchedVersion).toBe(built.key.questions[2].correctSide);
    expect(r.questions[2].expectedChoice).toBe(built.key.questions[2].correctChoice);
    const planted = built.key.questions.filter((k) => k.class === 'planted-fault');
    expect(r.totals.plantedShown).toBe(planted.length);
    expect(r.totals.plantedCaught).toBe(built.key.questions.filter((k, i) => k.class === 'planted-fault' && i >= 2).length);
    expect(r.totals.averageSeconds).toBe(12);
    expect(r.plain).toContain('You answered 5 questions.');
    expect(r.plain).toContain('On the 5 where we knew the answer, you chose right 3 times.');
    expect(r.plain).toContain(`You caught ${r.totals.plantedCaught} of ${planted.length} planted faults.`);
    expect(r.plain).toContain('You took about 12 seconds each.');
    expect(r.plain).toContain('Once, you expected something neither version did.');
  });
});

describe.runIf(process.env.BACKTRANS_PUBLISH_ROUND === '1')('moment round — publish a founder round', () => {
  it('seals a fresh round of at most 5 moments and pushes it to the dashboard', async () => {
    const seed = randomInt(1, 2 ** 31);
    const round = buildMomentRound({ seed, candidates });
    const dir = path.join(MOMENT_ROUNDS_ROOT, round.key.roundId);
    sealRound(dir, round);
    const record = await publishRound(dir, { replace: process.env.BACKTRANS_ROUND_REPLACE === '1', validate: momentRoundProblems });
    console.log(`[moment-round] published ${record.roundId} (${round.publicRound.questions.length} questions); key sealed in ${dir}`);
    expect(record.published?.dashboardKeySha256).toBe(record.keySha256);
  }, 600_000);
});

describe.runIf(process.env.BACKTRANS_COLLECT_ROUND === '1')('moment round — collect a founder round', () => {
  it('reads his answers, checks the seal, grades and writes the receipt', async () => {
    const live = await collectAnswers();
    const dir = path.join(MOMENT_ROUNDS_ROOT, live.roundId);
    expect(existsSync(dir), `no sealed moment key for ${live.roundId}`).toBe(true);
    const seal = verifySeal<MomentKey>(dir, live.keySha256);
    const round = readRecord(dir).publicRound as MomentRound;
    const receipt = gradeMomentRound(seal.key, round, live.answers, seal.ok);
    writeFileSync(path.join(dir, 'receipt.json'), `${JSON.stringify({ ...receipt, sealProblems: seal.problems, collectedAt: new Date().toISOString() }, null, 2)}\n`);
    writeFileSync(path.join(dir, 'receipt.txt'), `${receipt.plain}\n`);
    console.log(`[moment-round] ${live.roundId}\n${receipt.plain}`);
    expect(seal.problems).toEqual([]);
  }, 60_000);
});
