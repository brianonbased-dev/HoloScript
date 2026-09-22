/**
 * Two properties of the price list that nothing was checking.
 *
 * 1. LOCAL WORK IS FREE. Founder rule, 2026-09-16: "for pricing i dont want to
 *    rob people and i do want to give sovereignty away", and execution tier is
 *    a property of the capability — cloud-bound work is charged because it costs
 *    us money, and anything running on hardware we or the user already own is
 *    not. A row tiered 'local' that carries a price breaks that rule, so it
 *    fails here.
 *
 * 2. THE SHADOW COPY MATCHES. Studio keeps a duplicate of this table because it
 *    cannot import across the workspace. The two drifted for months with nobody
 *    able to see it: measured 2026-09-21, eight of the fourteen shared
 *    operations disagreed, and in EVERY case Studio showed more than the server
 *    charged. Customers were quoted prices that were not real.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OPERATION_COSTS } from '../pricing';

const REPO_ROOT = join(import.meta.dirname || __dirname, '..', '..', '..', '..', '..');
const ORIGINAL = join(REPO_ROOT, 'packages', 'absorb-service', 'src', 'credits', 'pricing.ts');
const SHADOW = join(REPO_ROOT, 'packages', 'studio', 'src', 'lib', 'absorb', 'pricing.ts');

/** The OPERATION_COSTS literal, exactly as written, from either copy. */
function costsBlock(file: string): string {
  const text = readFileSync(file, 'utf-8');
  const start = text.indexOf('export const OPERATION_COSTS = {');
  if (start === -1) throw new Error(`no OPERATION_COSTS block in ${file}`);
  const end = text.indexOf('} as const;', start);
  if (end === -1) throw new Error(`unterminated OPERATION_COSTS block in ${file}`);
  return text.slice(start, end + '} as const;'.length);
}

describe('pricing — local work is free', () => {
  it('every operation tiered local costs nothing', () => {
    const paidLocal = Object.entries(OPERATION_COSTS)
      .filter(([, v]) => (v as { tier: string }).tier === 'local')
      .filter(([, v]) => (v as { baseCostCents: number }).baseCostCents !== 0)
      .map(([k]) => k);

    expect(paidLocal).toEqual([]);
  });

  it('there is at least one local row, so the check above cannot pass by finding nothing', () => {
    const local = Object.values(OPERATION_COSTS).filter(
      (v) => (v as { tier: string }).tier === 'local'
    );
    expect(local.length).toBeGreaterThan(0);
  });

  it('every operation declares a tier from the known set', () => {
    const allowed = new Set(['cloud', 'local', 'unbilled', 'unverified']);
    const bad = Object.entries(OPERATION_COSTS)
      .filter(([, v]) => !allowed.has((v as { tier: string }).tier))
      .map(([k]) => k);

    expect(bad).toEqual([]);
  });
});

/**
 * A `cloud` tier asserts the charge is COLLECTED. This checks that the route
 * doing the collecting exists.
 *
 * Why it is here: on 2026-09-21 five rows were tiered `cloud` with the comment
 * "verified at the route, not assumed", and nothing collected any of them.
 * Studio's creditGate posts to /api/credits/check and /api/credits/deduct on
 * the absorb host, whose credits router serves only /balance, /purchase,
 * /history and /success. Both calls 404 and are swallowed. The tier was a claim
 * about money changing hands, made without following the request to the server
 * that answers it.
 *
 * The test is dormant while nothing is tiered `cloud` — which is the state a
 * founder ruling of 2026-06-06 put Studio operations in, by making the
 * orchestrator wallet the metered-credit authority. It arms the moment someone
 * claims the tier again.
 */
describe('pricing — a cloud tier needs a route that collects', () => {
  const CREDIT_GATE = join(REPO_ROOT, 'packages', 'studio', 'src', 'lib', 'creditGate.ts');
  const ABSORB_ROUTER = join(
    REPO_ROOT,
    'services',
    'absorb-service',
    'src',
    'routes',
    'credits.ts'
  );

  /** Paths creditGate posts to on the absorb host, e.g. "/deduct". */
  function pathsStudioPosts(): string[] {
    const text = readFileSync(CREDIT_GATE, 'utf-8');
    return [
      ...new Set(
        [...text.matchAll(/\$\{ABSORB_BASE\}\/api\/credits\/([a-z-]+)/g)].map((m) => `/${m[1]}`)
      ),
    ];
  }

  /** Paths the absorb credits router actually registers. */
  function pathsAbsorbServes(): string[] {
    const text = readFileSync(ABSORB_ROUTER, 'utf-8');
    return [...text.matchAll(/router\.(?:get|post)\('([^']+)'/g)].map((m) => m[1]);
  }

  it('nothing claims cloud unless the deduction route it relies on is served', async () => {
    const { OPERATION_COSTS } = await import('../pricing');
    const cloud = Object.entries(OPERATION_COSTS)
      .filter(([, v]) => (v as { tier: string }).tier === 'cloud')
      .map(([k]) => k);

    if (cloud.length === 0) return; // dormant, and correct: nothing claims it

    const served = pathsAbsorbServes();
    const missing = pathsStudioPosts().filter((p) => !served.includes(p));

    expect(
      missing,
      `operations tiered cloud (${cloud.join(', ')}) rely on routes the absorb host does not serve: ${missing.join(', ')}`
    ).toEqual([]);
  });

  it('records the routes that are posted to but not served, so the gap is visible', () => {
    // Not an assertion about correctness — a printed inventory, so the next
    // person reading this file does not have to rediscover it. Today both
    // /check and /deduct are in this list.
    const served = pathsAbsorbServes();
    const unserved = pathsStudioPosts().filter((p) => !served.includes(p));
    expect(Array.isArray(unserved)).toBe(true);
    if (unserved.length > 0) {
      console.log(
        `[pricing] creditGate posts to ${unserved.join(', ')} on the absorb host, which serves ${served.join(', ')}. ` +
          `Deliberate per the 2026-06-06 ruling: metered Studio work belongs on the orchestrator wallet.`
      );
    }
  });
});

describe('pricing — the shadow copy Studio shows matches the one the server charges', () => {
  it('the OPERATION_COSTS blocks are byte-identical', () => {
    // Not a value-by-value comparison on purpose: the shown DESCRIPTION and the
    // tier are part of what a customer is told, and a value compare would let
    // those drift while the numbers agreed.
    expect(costsBlock(SHADOW)).toBe(costsBlock(ORIGINAL));
  });

  it('the blocks are non-trivial, so identity is not two empty strings', () => {
    expect(costsBlock(ORIGINAL).length).toBeGreaterThan(500);
  });
});
