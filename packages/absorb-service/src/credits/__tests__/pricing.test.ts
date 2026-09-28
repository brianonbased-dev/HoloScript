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

/**
 * Every export that exists in BOTH copies, with the token that ends its
 * literal. Adding a row here is what makes a table checked; a shared export
 * missing from this list is one nothing compares.
 */
const SHARED_EXPORTS: ReadonlyArray<readonly [name: string, endsWith: string]> = [
  ['OPERATION_COSTS', '} as const;'],
  ['CREDIT_PACKAGES', '] as const;'],
  ['LLM_COSTS_PER_MTOK', '};'],
  ['TIER_LIMITS', '};'],
  ['LLM_MARKUP', ';'],
];

/** One named export's literal, exactly as written, from either copy. */
function sharedBlock(file: string, name: string, endsWith: string): string {
  const text = readFileSync(file, 'utf-8');
  const start = text.indexOf(`export const ${name}`);
  if (start === -1) throw new Error(`no ${name} in ${file}`);
  const end = text.indexOf(endsWith, start);
  if (end === -1) throw new Error(`unterminated ${name} in ${file}`);
  return text.slice(start, end + endsWith.length);
}

/** The OPERATION_COSTS literal, exactly as written, from either copy. */
function costsBlock(file: string): string {
  return sharedBlock(file, 'OPERATION_COSTS', '} as const;');
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

describe('pricing - the shadow copy Studio shows matches the one the server charges', () => {
  /**
   * PINNING ONE TABLE IS WHY THE OTHERS DRIFTED.
   *
   * This suite checked OPERATION_COSTS and nothing else, which read as "the
   * shadow copy is verified" while three of the four shared tables were free to
   * diverge - and had. Measured 2026-09-21, before this test grew:
   *
   *  - LLM_COSTS_PER_MTOK: openrouter 3.0/15.0 on the server, 2.5/10.0 in
   *    Studio; and Studio carried gemini, cloud and fleet keys the server did
   *    not. estimateLLMCostCents falls back to `ollama` - zero - for an unknown
   *    provider, so any request routed to gemini metered FREE on the side that
   *    bills.
   *  - TIER_LIMITS: Studio advertised 500 free credits to Pro and 2000 to
   *    Enterprise; the server granted 0 to both. maxProjectsActive differed on
   *    every tier.
   *
   * Same defect as the price table itself: the shop window showed one thing and
   * the till charged another. A per-table pin is the only version of this test
   * that cannot quietly stop covering something.
   */
  it.each(SHARED_EXPORTS)('the %s blocks are byte-identical', (name, endsWith) => {
    // Not a value-by-value comparison on purpose: the shown DESCRIPTION and the
    // tier are part of what a customer is told, and a value compare would let
    // those drift while the numbers agreed.
    expect(sharedBlock(SHADOW, name, endsWith)).toBe(sharedBlock(ORIGINAL, name, endsWith));
  });

  it('the blocks are non-trivial, so identity is not two empty strings', () => {
    expect(costsBlock(ORIGINAL).length).toBeGreaterThan(500);
    for (const [name, endsWith] of SHARED_EXPORTS) {
      expect(sharedBlock(ORIGINAL, name, endsWith).length, name).toBeGreaterThan(20);
    }
  });

  it('every export shared by both files is in the pinned list', () => {
    // The guard on the guard. A future export added to both copies but not to
    // SHARED_EXPORTS would be unpinned, and the suite above would still be
    // green - exactly how LLM_COSTS_PER_MTOK and TIER_LIMITS drifted unseen.
    const names = (file: string) =>
      new Set([...readFileSync(file, 'utf-8').matchAll(/^export const (\w+)/gm)].map((m) => m[1]));

    const inBoth = [...names(ORIGINAL)].filter((n) => names(SHADOW).has(n));
    const pinned = new Set(SHARED_EXPORTS.map(([n]) => n));
    const unpinned = inBoth.filter((n) => !pinned.has(n));

    expect(
      unpinned,
      `these exports exist in both copies but nothing compares them: ${unpinned.join(', ')}`
    ).toEqual([]);
  });
});

/**
 * A provider absent from the cost table meters at ZERO, because
 * estimateLLMCostCents falls back to `ollama`. That makes an omission a silent
 * pricing decision rather than a gap, so the table must name every provider the
 * code can actually route to.
 */
describe('pricing - no provider meters free by accident', () => {
  it('every provider the router can name has a row in the cost table', async () => {
    const { LLM_COSTS_PER_MTOK } = await import('../pricing');
    const expected = ['openrouter', 'anthropic', 'xai', 'openai', 'gemini', 'ollama'];
    const missing = expected.filter((p) => !(p in LLM_COSTS_PER_MTOK));

    expect(
      missing,
      `these providers would meter at 0 via the ollama fallback: ${missing.join(', ')}`
    ).toEqual([]);
  });

  it('a paid provider costs more than nothing, so the table is not zeroed', async () => {
    const { LLM_COSTS_PER_MTOK } = await import('../pricing');
    expect(LLM_COSTS_PER_MTOK.anthropic.input).toBeGreaterThan(0);
    expect(LLM_COSTS_PER_MTOK.openrouter.output).toBeGreaterThan(0);
  });
});
