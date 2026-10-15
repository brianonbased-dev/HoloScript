/**
 * "Which is right?" rounds — rendering, side randomisation, sealing and grading
 * (board task_1791235614927_x7l2). See backtranslation/which-is-right.ts.
 *
 *   corepack pnpm --filter @holoscript/cli exec vitest run \
 *     src/__tests__/backtranslation-which-is-right.test.ts
 *
 * Text rounds are retired for the founder; these run only with BACKTRANS_ROUND_STYLE=text.
 * Picture rounds: backtranslation-moment-round.test.ts.
 *
 * Founder rounds (opt-in, talk to the running ai-ecosystem dashboard on 3401):
 *   BACKTRANS_PUBLISH_ROUND=1   build a round with a fresh random seed, seal its
 *                               answer key under fixtures/.../which-is-right/rounds/<id>/,
 *                               then push the questions (never the key) to the dashboard.
 *                               BACKTRANS_ROUND_REPLACE=1 sets aside a round he started.
 *   BACKTRANS_COLLECT_ROUND=1   read his answers back, check the seal against the
 *                               dashboard's copy of the hash, grade, and write
 *                               receipt.json + receipt.txt next to the sealed key.
 *   WHICH_IS_RIGHT_DASHBOARD    dashboard origin (default http://127.0.0.1:3401).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  DashboardNotRunning,
  ROUNDS_ROOT,
  buildRound,
  codeWordFindings,
  collectAnswers,
  fillTemplate,
  gradeRound,
  plainReceipt,
  publishRound,
  readRecord,
  roundProblems,
  sealRound,
  sha256,
  sidesFromSeed,
  verifySeal,
  writeRecord,
  type DashboardAnswers,
} from './backtranslation/which-is-right';

const PLAIN_CHECKER = 'C:/holo-dev/ai-ecosystem/scripts/check-plain-language.mjs';
const FIXED_SEED = 0x1234abcd;
const FIXED_TIME = '2026-10-05T18:00:00.000Z';
const built = buildRound({ seed: FIXED_SEED, createdAt: FIXED_TIME, salt: '00'.repeat(16) });
const allText = (q: (typeof built.publicRound.questions)[number]) => [q.title, ...q.rules, ...q.steps, ...q.a, ...q.b];

const tmpDirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(path.join(tmpdir(), 'which-is-right-'));
  tmpDirs.push(d);
  return d;
}
afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

describe('which is right — the round', () => {
  it('has about 10 questions: planted faults and car park rebuild disagreements', () => {
    const classes = built.key.questions.map((q) => q.class);
    expect(built.publicRound.questions.length).toBe(10);
    expect(classes.filter((c) => c === 'planted-fault').length).toBe(8);
    expect(classes.filter((c) => c === 'rebuild-disagreement').length).toBe(2);
    for (const q of built.key.questions.filter((x) => x.class === 'rebuild-disagreement')) {
      expect(q.behaviourId).toBe('car-park-barrier');
    }
  });

  it('every question shows one answer per step on each side and ends on the step where they differ', () => {
    for (const q of built.publicRound.questions) {
      expect(q.steps.length).toBeGreaterThan(0);
      expect(q.steps.length).toBeLessThanOrEqual(8);
      expect(q.a.length).toBe(q.steps.length);
      expect(q.b.length).toBe(q.steps.length);
      const last = q.steps.length - 1;
      expect(q.a[last]).not.toBe(q.b[last]);
      for (let k = 0; k < last; k++) expect(q.a[k]).toBe(q.b[k]);
    }
  });

  it('every question carries how its machine should work: the whole checklist, word for word', () => {
    for (const [i, q] of built.publicRound.questions.entries()) {
      const id = built.key.questions[i].behaviourId;
      const checklist = JSON.parse(
        readFileSync(path.join(__dirname, 'fixtures/backtranslation/slice3', id, 'checklist.json'), 'utf8')
      ) as { lines: Array<{ text: string }> };
      expect(q.rules).toEqual(checklist.lines.map((l) => l.text));
    }
    // The rules travel in what the dashboard receives.
    expect(JSON.stringify(built.publicRound)).toContain('Arriving while a car is already inside is refused.');
    expect(roundProblems(built.publicRound)).toEqual([]);
  });

  it('a question without rules is refused by the publisher before anything is sent', async () => {
    const stripped = buildRound({ seed: 13, createdAt: FIXED_TIME });
    stripped.publicRound.questions[2] = { ...stripped.publicRound.questions[2], rules: [] };
    expect(roundProblems(stripped.publicRound)).toEqual(['question 3 has no rules saying how the machine should work']);
    const dir = tmp();
    sealRound(dir, stripped);
    // Port 9 has no dashboard: a refusal that names the rules proves the check ran before any send.
    await expect(publishRound(dir, { url: 'http://127.0.0.1:9' })).rejects.toThrow(/no rules saying how the machine should work/);
    expect(readRecord(dir).published).toBeUndefined();
  });

  it('carries no code words, ids or program values anywhere on screen', () => {
    const findings = built.publicRound.questions.flatMap((q) => allText(q).flatMap(codeWordFindings));
    expect(findings).toEqual([]);
    // The public round never names which side is correct or what the other version was.
    const wire = JSON.stringify(built.publicRound);
    for (const word of ['correct', 'planted', 'rebuild', 'mutant', 'original']) expect(wire).not.toContain(word);
  });

  it('the code-word check goes red on code-shaped text (fault feed)', () => {
    expect(codeWordFindings('It says still_owed: 2.')).not.toEqual([]);
    expect(codeWordFindings('carInside is true')).not.toEqual([]);
    expect(codeWordFindings('The rebuild r2 said so.')).not.toEqual([]);
    expect(codeWordFindings('The screen shows ? owed.')).not.toEqual([]);
    expect(codeWordFindings('The barrier opens.')).toEqual([]);
  });

  it.skipIf(!existsSync(PLAIN_CHECKER))('passes the plain-language check (canon, strict), and the check can fail', () => {
    const run = (text: string): number => {
      try {
        execFileSync(process.execPath, [PLAIN_CHECKER, '--text', text, '--profile', 'canon', '--check', '--strict'], {
          stdio: 'pipe',
        });
        return 0;
      } catch (error) {
        return (error as { status?: number }).status ?? 99;
      }
    };
    const words = new Set(built.publicRound.questions.flatMap(allText));
    const receipt = plainReceipt(
      { shown: 10, answered: 9, notSure: 1, knownAnswered: 9, right: 7, plantedShown: 8, plantedCaught: 6, rebuildShown: 2, rebuildAnswered: 2, rebuildSidedWithRules: 1, averageSeconds: 21 },
      true
    );
    expect(run([...words, receipt].join('\n'))).toBe(0);
    expect(run('We utilize a robust paradigm.')).toBe(1);
  });

  it('fills templates with plural words, yes/no words and visible gaps', () => {
    expect(fillTemplate('{n} {n:coin|coins}', { n: 1 })).toBe('1 coin');
    expect(fillTemplate('{n} {n:coin|coins}', { n: 3 })).toBe('3 coins');
    expect(fillTemplate('{x?open|closed}', { x: false })).toBe('closed');
    expect(fillTemplate('a {k} customer', { k: 'vip' }, { k: { vip: 'VIP' } })).toBe('a VIP customer');
    expect(fillTemplate('{missing} owed', {})).toBe('? owed');
  });
});

describe('which is right — A/B sides', () => {
  it('records the seed and the side of every question in the sealed key, reproducibly', () => {
    expect(built.key.seed).toBe(FIXED_SEED >>> 0);
    const sides = built.key.questions.map((q) => q.correctSide);
    expect(sides).toEqual(sidesFromSeed(FIXED_SEED, sides.length));
    const again = buildRound({ seed: FIXED_SEED, createdAt: FIXED_TIME, salt: '00'.repeat(16) });
    expect(again.publicRound).toEqual(built.publicRound);
    expect(again.key).toEqual(built.key);
  });

  it('puts the correct version on both sides across a round, and a new seed moves them', () => {
    const sides = built.key.questions.map((q) => q.correctSide);
    expect(sides).toContain('A');
    expect(sides).toContain('B');
    const other = sidesFromSeed(FIXED_SEED + 1, 10);
    expect(other).not.toEqual(sidesFromSeed(FIXED_SEED, 10));
  });

  it('the side recorded matches what is shown: the correct column is the original program', () => {
    for (const q of built.key.questions) {
      expect(q.shown[q.correctSide]).toBe('correct');
      expect(q.shown[q.correctSide === 'A' ? 'B' : 'A']).toBe(q.otherVersion);
    }
  });
});

describe('which is right — sealed answer key', () => {
  it('is written before the round record and hashes into it', () => {
    const dir = tmp();
    const record = sealRound(dir, buildRound({ seed: 7, createdAt: FIXED_TIME }));
    expect(record.keySha256).toBe(record.publicRound.keySha256);
    expect(verifySeal(dir).ok).toBe(true);
    expect(() => sealRound(dir, buildRound({ seed: 8, createdAt: FIXED_TIME }))).toThrow(/sealed once/);
  });

  it('salts the key, so the hash cannot be matched by trying every A/B pattern', () => {
    const a = buildRound({ seed: 7, createdAt: FIXED_TIME });
    const b = buildRound({ seed: 7, createdAt: FIXED_TIME });
    expect(a.key.questions).toEqual(b.key.questions);
    expect(a.publicRound.keySha256).not.toBe(b.publicRound.keySha256);
  });

  it('detects a key edited after publishing — against the record and against the dashboard copy', () => {
    const dir = tmp();
    const record = sealRound(dir, buildRound({ seed: 9, createdAt: FIXED_TIME }));
    // What publishRound records once the dashboard echoes the stored hash.
    record.published = { to: 'test', at: FIXED_TIME, dashboardKeySha256: record.keySha256 };
    writeRecord(dir, record);
    const dashboardHash = record.keySha256;
    expect(verifySeal(dir, dashboardHash).ok).toBe(true);

    // Flip the first question's side in the key after "answers came in".
    const keyPath = path.join(dir, 'answer-key.json');
    const key = JSON.parse(readFileSync(keyPath, 'utf8'));
    key.questions[0].correctSide = key.questions[0].correctSide === 'A' ? 'B' : 'A';
    writeFileSync(keyPath, `${JSON.stringify(key, null, 2)}\n`);
    const tampered = verifySeal(dir, dashboardHash);
    expect(tampered.ok).toBe(false);
    expect(tampered.problems.join(' ')).toMatch(/changed after it was sealed/);

    // Re-hash the record to match: the publish-time hash and the dashboard copy still catch it.
    const r2 = readRecord(dir);
    r2.keySha256 = sha256(readFileSync(keyPath));
    writeRecord(dir, r2);
    const covered = verifySeal(dir, dashboardHash);
    expect(covered.ok).toBe(false);
    expect(covered.problems.join(' ')).toMatch(/dashboard stored/);
  });

  it('a publisher with no dashboard says so plainly and pretends nothing', async () => {
    const dir = tmp();
    sealRound(dir, buildRound({ seed: 11, createdAt: FIXED_TIME }));
    await expect(publishRound(dir, { url: 'http://127.0.0.1:9' })).rejects.toBeInstanceOf(DashboardNotRunning);
    await expect(publishRound(dir, { url: 'http://127.0.0.1:9' })).rejects.toThrow(/dashboard is not running/);
    expect(readRecord(dir).published).toBeUndefined();
  });
});

describe('which is right — receipt', () => {
  it('counts answers, right choices, planted faults caught and time taken', () => {
    const key = built.key;
    const answers: DashboardAnswers['answers'] = {};
    const wrong = (s: 'A' | 'B') => (s === 'A' ? 'B' : 'A');
    key.questions.forEach((q, i) => {
      if (i === 9) return; // one left unanswered
      const choice = i === 8 ? 'not-sure' : i < 6 ? q.correctSide : wrong(q.correctSide);
      answers[String(q.n)] = { choice, seconds: 10 + i, answeredAt: FIXED_TIME };
    });
    const r = gradeRound(key, answers, true, built.publicRound.keySha256);
    const planted = key.questions.filter((q) => q.class === 'planted-fault');
    const rightIdx = [0, 1, 2, 3, 4, 5];
    expect(r.totals.shown).toBe(10);
    expect(r.totals.answered).toBe(9);
    expect(r.totals.notSure).toBe(1);
    expect(r.totals.knownAnswered).toBe(9);
    expect(r.totals.right).toBe(6);
    expect(r.totals.plantedShown).toBe(planted.length);
    expect(r.totals.plantedCaught).toBe(
      key.questions.filter((q, i) => q.class === 'planted-fault' && rightIdx.includes(i)).length
    );
    expect(r.totals.averageSeconds).toBe(Math.round((10 + 11 + 12 + 13 + 14 + 15 + 16 + 17 + 18) / 9));
    expect(r.questions[9].chosen).toBeNull();
    expect(r.questions[9].correct).toBeNull();
    expect(r.questions[8].correct).toBeNull();
    expect(r.plain).toContain('You answered 9 questions.');
    expect(r.plain).toContain(`you chose right 6 times`);
    expect(r.plain).toContain(`You caught ${r.totals.plantedCaught} of ${planted.length} planted faults.`);
    expect(r.plain).toContain('You took about 14 seconds each.');
    expect(codeWordFindings(r.plain.replace(/"Not sure"/g, ''))).toEqual([]);
  });

  it('says plainly when the seal failed', () => {
    const r = gradeRound(built.key, {}, false, 'x');
    expect(r.plain).toMatch(/cannot be trusted/);
    expect(r.totals.answered).toBe(0);
  });
});

// Text rounds are retired for the founder (round 1: 10/10 "Not sure", "read like a multi-choice
// math test"). They publish only on request; picture rounds live in backtranslation-moment-round.test.ts.
const TEXT_ROUNDS = process.env.BACKTRANS_ROUND_STYLE === 'text';

describe.runIf(TEXT_ROUNDS && process.env.BACKTRANS_PUBLISH_ROUND === '1')('which is right — publish a founder round', () => {
  it('seals a fresh round and pushes it to the dashboard', async () => {
    const seed = randomInt(1, 2 ** 31);
    const round = buildRound({ seed });
    const dir = path.join(ROUNDS_ROOT, round.key.roundId);
    sealRound(dir, round);
    const record = await publishRound(dir, { replace: process.env.BACKTRANS_ROUND_REPLACE === '1' });
    console.log(`[which-is-right] published ${record.roundId} (${round.publicRound.questions.length} questions) to ${record.published?.to}; key sealed in ${dir}`);
    expect(record.published?.dashboardKeySha256).toBe(record.keySha256);
  }, 300_000);
});

describe.runIf(TEXT_ROUNDS && process.env.BACKTRANS_COLLECT_ROUND === '1')('which is right — collect a founder round', () => {
  it('reads his answers, checks the seal, grades and writes the receipt', async () => {
    const live = await collectAnswers();
    const dir = path.join(ROUNDS_ROOT, live.roundId);
    expect(existsSync(dir), `no sealed key for ${live.roundId} under ${ROUNDS_ROOT} (found ${existsSync(ROUNDS_ROOT) ? readdirSync(ROUNDS_ROOT).join(', ') : 'none'})`).toBe(true);
    const seal = verifySeal(dir, live.keySha256);
    const receipt = gradeRound(seal.key, live.answers, seal.ok, live.keySha256);
    writeFileSync(path.join(dir, 'receipt.json'), `${JSON.stringify({ ...receipt, sealProblems: seal.problems, collectedAt: new Date().toISOString() }, null, 2)}\n`);
    writeFileSync(path.join(dir, 'receipt.txt'), `${receipt.plain}\n`);
    console.log(`[which-is-right] ${live.roundId}\n${receipt.plain}`);
    expect(seal.problems).toEqual([]);
  }, 60_000);
});
