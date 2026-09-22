/**
 * The front door: what a stranger gets at an address that is not a page.
 *
 * WHY THIS SUITE EXISTS. On 2026-09-16 every unmatched single-segment path on
 * production answered HTTP 200 with ~54KB of the industry portal — `/pricing`,
 * `/login`, `/billing`, `/robots.txt`, and an invented
 * `/zzz-probe-9182-not-a-real-page` alike. The cause was one file:
 * `src/app/(industry)/[vertical]/page.tsx`. A route group's parentheses add no
 * URL segment, so it registered the dynamic route `/[vertical]` AT THE ROOT.
 * `app/not-found.tsx` existed and was unreachable, because nothing was ever
 * unmatched.
 *
 * Every assertion here reads the route tree from disk rather than booting Next,
 * because the defect was a FILE LAYOUT defect: the wrong file in the wrong
 * place, with no code in it wrong at all.
 *
 * A note on what is NOT asserted: the body text of a rendered page. Measured
 * 2026-09-16, the string "Page not found" appears in the HTML of EVERY Studio
 * response, real pages included — it ships inside the client bundle. Grepping a
 * response body for it would pass on a page that is not a 404, which is the
 * exact class of check this lane exists to delete.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { INDUSTRY_VERTICALS, INDUSTRY_VERTICAL_SLUGS } from '@/lib/industry-verticals';
import { SITEMAP_PATHS } from '../sitemap';

const appDir = dirname(fileURLToPath(new URL('../layout.tsx', import.meta.url)));
const studioRoot = join(appDir, '..', '..');

/** Nine addresses an operator or a customer would plausibly type. */
const OPERATOR_PATHS = [
  '/pricing',
  '/docs',
  '/api-keys',
  '/login',
  '/signup',
  '/gram',
  '/marketplace',
  '/onboarding',
  '/billing',
] as const;

interface PageRoute {
  /** URL path with route groups stripped, e.g. `/industry/[vertical]`. */
  route: string;
  /** Path segments of `route`, without empties. */
  segments: string[];
  /** Repo-relative source file. */
  file: string;
}

function collectPageRoutes(): PageRoute[] {
  const routes: PageRoute[] = [];
  const stack: string[] = [appDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) continue;

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);

      if (entry.isDirectory()) {
        // `api` holds route handlers, not pages; `__tests__` holds this file.
        if (entry.name === 'api' || entry.name === '__tests__') continue;
        stack.push(full);
        continue;
      }

      if (!/^page\.(tsx|ts|jsx|js)$/.test(entry.name)) continue;

      const relative = full.slice(appDir.length).split(/[\\/]/).filter(Boolean);
      relative.pop(); // drop the page file itself
      // Route groups `(name)` and parallel slots `@name` add no URL segment.
      const segments = relative.filter(
        (segment) => !segment.startsWith('(') && !segment.startsWith('@')
      );

      routes.push({
        route: `/${segments.join('/')}`,
        segments,
        file: full.slice(studioRoot.length + 1).split('\\').join('/'),
      });
    }
  }

  return routes;
}

const pageRoutes = collectPageRoutes();

/** Is this the kind of route that claims every unmatched path at the top level? */
function isRootLevelDynamic(route: PageRoute): boolean {
  return (
    route.segments.length === 1 &&
    route.segments[0].startsWith('[') &&
    route.segments[0].endsWith(']')
  );
}

/** Routes that claim every unmatched path at the top level, e.g. `/[vertical]`. */
function rootLevelDynamicRoutes(): PageRoute[] {
  return pageRoutes.filter(isRootLevelDynamic);
}

function routeMatches(route: PageRoute, wanted: string[]): boolean {
  const candidate = route.segments;
  const isCatchAll = candidate.at(-1)?.startsWith('[...') ?? false;

  if (!isCatchAll && candidate.length !== wanted.length) return false;
  if (isCatchAll && wanted.length < candidate.length - 1) return false;

  return candidate.every((segment, index) => {
    if (segment.startsWith('[')) return true;
    return segment === wanted[index];
  });
}

/**
 * Does this path resolve to a page of ITS OWN?
 *
 * Root-level dynamic routes are excluded on purpose, and that exclusion is the
 * whole point. Such a route matches EVERY single-segment path, so counting it
 * as "resolved" makes every question below answer yes whether the page exists
 * or not.
 *
 * This is not hypothetical. On 2026-09-16 this suite was run against a copy with
 * the catch-all restored and the `/docs` page deleted, and three assertions —
 * the nine operator paths, the front-page links, and the sitemap — passed
 * anyway, because the catch-all answered for the page that was missing. They
 * were checks that could not fail. That is the defect this suite exists to
 * delete, so it must not be the shape of the suite itself.
 */
function resolvesToOwnPage(path: string): boolean {
  const wanted = path.split('/').filter(Boolean);
  return pageRoutes.some((route) => !isRootLevelDynamic(route) && routeMatches(route, wanted));
}

/** Would a root-level catch-all answer this path instead of a page of its own? */
function isAnsweredByRootCatchAll(path: string): boolean {
  if (resolvesToOwnPage(path)) return false;

  const wanted = path.split('/').filter(Boolean);
  return pageRoutes.some((route) => isRootLevelDynamic(route) && routeMatches(route, wanted));
}

describe('a wrong address is refused', () => {
  it('has no route that claims every unmatched path at the root', () => {
    const offenders = rootLevelDynamicRoutes().map((route) => `${route.route} (${route.file})`);

    expect(offenders).toEqual([]);
  });

  it('keeps a not-found page for the refusal to land on', () => {
    expect(existsSync(join(appDir, 'not-found.tsx'))).toBe(true);
  });

  it('does not answer an invented address with somebody else’s page', () => {
    expect(resolvesToOwnPage('/zzz-probe-9182-not-a-real-page')).toBe(false);
    expect(isAnsweredByRootCatchAll('/zzz-probe-9182-not-a-real-page')).toBe(false);
  });

  it.each(OPERATOR_PATHS)('answers %s with its own page or with a 404, never a stand-in', (path) => {
    // Either a page of its own exists, or nothing matches and Next renders
    // not-found.tsx with a 404. What must never happen is a DIFFERENT page
    // answering to this address and calling it a success.
    expect(isAnsweredByRootCatchAll(path)).toBe(false);
  });
});

describe('the industry verticals still work', () => {
  it('serves every declared vertical from one shared list', () => {
    expect(INDUSTRY_VERTICAL_SLUGS.length).toBeGreaterThan(0);

    const missing = INDUSTRY_VERTICAL_SLUGS.filter(
      (slug) => !resolvesToOwnPage(`/industry/${slug}`)
    );

    expect(missing).toEqual([]);
  });

  it('gives every vertical a name and a description of its own', () => {
    const unnamed = INDUSTRY_VERTICALS.filter(
      (vertical) => vertical.title.trim() === '' || vertical.description.trim() === ''
    );

    expect(unnamed).toEqual([]);
  });

  it('is the list the setup wizard navigates by', () => {
    const wizard = readFileSync(
      join(studioRoot, 'src/components/wizard/useStudioSetupWizard.ts'),
      'utf8'
    );

    // The wizard pushes /industry/<category>; it must read the declared list
    // rather than keep a second copy that can drift out of agreement.
    expect(wizard).toContain('INDUSTRY_VERTICAL_SLUGS');
    expect(wizard).toContain('/industry/');
  });
});

describe('our own links go somewhere', () => {
  it('resolves every internal link the front page prints', () => {
    const frontPage = readFileSync(join(appDir, 'page.tsx'), 'utf8');
    const hrefs = [...frontPage.matchAll(/href="(\/[^"#?]*)"/g)].map((match) => match[1]);

    expect(hrefs.length).toBeGreaterThan(0);

    const broken = [...new Set(hrefs)].filter((href) => !resolvesToOwnPage(href));

    expect(broken).toEqual([]);
  });
});

describe('crawlers are told the truth', () => {
  it('serves robots.txt and sitemap.xml as their own routes', () => {
    expect(existsSync(join(appDir, 'robots.ts'))).toBe(true);
    expect(existsSync(join(appDir, 'sitemap.ts'))).toBe(true);
  });

  it('keeps the private half of the app out of the crawl', () => {
    const robots = readFileSync(join(appDir, 'robots.ts'), 'utf8');

    for (const prefix of ['/api/', '/admin', '/settings', '/auth/']) {
      expect(robots).toContain(`'${prefix}'`);
    }
  });

  it('lists only paths that are really pages', () => {
    expect(SITEMAP_PATHS.length).toBeGreaterThan(0);

    const advertisedButMissing = SITEMAP_PATHS.filter((path) => !resolvesToOwnPage(path));

    expect(advertisedButMissing).toEqual([]);
  });
});

describe('a redirect lands on a real page', () => {
  // A redirect is a promise about another address. `/learn` pointed at
  // `/examples`, which has no page of its own — and nobody noticed for as long
  // as the root catch-all answered `/examples` with HTTP 200. Removing the
  // catch-all turns every such redirect into a 404, so they are checked here.
  it('resolves every redirect target declared in holo-pages', () => {
    const holoPagesDir = join(studioRoot, 'holo-pages');
    const sources: string[] = [];
    const stack = [holoPagesDir];

    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) continue;

      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const full = join(current, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (entry.name.endsWith('.holo')) sources.push(full);
      }
    }

    expect(sources.length).toBeGreaterThan(0);

    const broken: string[] = [];
    for (const source of sources) {
      const target = readFileSync(source, 'utf8').match(/redirect:\s*"([^"]+)"/)?.[1];
      if (target === undefined || !target.startsWith('/')) continue;

      // Compare paths, not query strings: /settings?tab=x is the /settings page.
      const path = target.split(/[?#]/)[0];
      if (path !== '/' && !resolvesToOwnPage(path)) {
        broken.push(`${source.slice(studioRoot.length + 1)} -> ${target}`);
      }
    }

    expect(broken).toEqual([]);
  });

  it('resolves every static redirect destination in next.config.js', () => {
    const config = readFileSync(join(studioRoot, 'next.config.js'), 'utf8');
    const destinations = [...config.matchAll(/destination:\s*'([^']+)'/g)].map((match) => match[1]);

    expect(destinations.length).toBeGreaterThan(0);

    const broken = destinations.filter((destination) => {
      // Skip absolute URLs (the host-scoped canonical redirect) and patterns
      // carrying a :param, which name a shape rather than a concrete address.
      if (!destination.startsWith('/') || destination.includes(':')) return false;
      // /api/* destinations are route handlers, not pages.
      if (destination.startsWith('/api/')) return false;
      return destination !== '/' && !resolvesToOwnPage(destination);
    });

    expect(broken).toEqual([]);
  });
});

describe('the committed inventory matches the app', () => {
  it('counts the pages and API routes that exist today', () => {
    const snapshotPath = join(studioRoot, 'docs', 'STUDIO_INVENTORY_SNAPSHOT.json');
    const snapshot: { counts: { appPages: number; apiRoutes: number } } = JSON.parse(
      readFileSync(snapshotPath, 'utf8')
    );

    const apiDir = join(appDir, 'api');
    const countRouteHandlers = (root: string): number => {
      let total = 0;
      const stack = [root];

      while (stack.length > 0) {
        const current = stack.pop();
        if (current === undefined) continue;

        for (const entry of readdirSync(current, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            if (entry.name !== '__tests__') stack.push(join(current, entry.name));
            continue;
          }
          if (/^route\.(ts|js)$/.test(entry.name)) total += 1;
        }
      }

      return total;
    };

    expect(snapshot.counts.appPages).toBe(pageRoutes.length);
    expect(snapshot.counts.apiRoutes).toBe(countRouteHandlers(apiDir));
  });
});

/**
 * The door itself exists, is authored the right way, and can be found.
 *
 * WHAT THIS SUITE COULD NOT SEE BEFORE. `/pricing` and `/signup` were already
 * in OPERATOR_PATHS above, and the only thing asserted about them was
 * `isAnsweredByRootCatchAll(path) === false` — which a clean 404 satisfies. So
 * a file named front-door.test.ts passed green for as long as there was no
 * front door at all. It proved no other page was impersonating /pricing; it
 * never asked whether /pricing existed. That is the shape this lane deletes,
 * and it was sitting inside the lane's own suite.
 *
 * Three assertions, because three different things can go wrong: the page can
 * be missing, it can be hand-written .tsx that drifts from no source, or it can
 * exist and be unreachable. 40 of this app's 65 static routes are reachable
 * only by typing the address; a new page is one careless commit from joining
 * them.
 */
describe('the front door is built, and reachable', () => {
  const FRONT_DOOR = ['/pricing', '/download', '/install'] as const;

  it('each front-door page exists', () => {
    const routes = collectPageRoutes().map((r) => r.route);
    const missing = FRONT_DOOR.filter((p) => !routes.includes(p));
    expect(missing).toEqual([]);
  });

  it('each is generated from a .holo source, not hand-written', () => {
    // Hand-authoring a render .tsx is refused at commit time by the
    // render-surface gate, so a hand-written page here would mean the gate was
    // bypassed. Assert the source of truth exists and the output says so.
    const notGenerated = FRONT_DOOR.filter((p) => {
      const holo = join(studioRoot, 'holo-pages', p.slice(1), 'page.holo');
      const out = join(studioRoot, 'src', 'app', p.slice(1), 'page.tsx');
      if (!existsSync(holo) || !existsSync(out)) return true;
      return !readFileSync(out, 'utf-8').includes('@generated by HoloScript');
    });
    expect(notGenerated).toEqual([]);
  });

  it('each is linked from the landing page, where the sidebar is suppressed', () => {
    // AppShell returns children bare for the marketing prefixes, '/' included,
    // so the navigation registry cannot carry these. The link has to be in the
    // landing page itself or no visitor will ever see it.
    const landing = readFileSync(join(studioRoot, 'src', 'app', 'page.tsx'), 'utf-8');
    const unlinked = FRONT_DOOR.filter((p) => !landing.includes(`href="${p}"`));
    expect(unlinked).toEqual([]);
  });
});

/**
 * The prices on the page are the prices in the table.
 *
 * Measured 2026-09-21: Studio's copy of the operation table and the server's
 * had drifted on eight of fourteen shared operations, and in EVERY case Studio
 * showed MORE than the server charged — daemon_balanced quoted 250c against
 * 100c taken. Two numbers for one price is a lie with a receipt. The page is
 * hand-authored prose, so the only thing that can keep it honest is a test that
 * reads the table and refuses to let the prose disagree.
 */
describe('the pricing page agrees with the price table', () => {
  const pricingPage = () =>
    readFileSync(join(studioRoot, 'src', 'app', 'pricing', 'page.tsx'), 'utf-8');

  it('every credit package appears with its real price and credit count', async () => {
    const { CREDIT_PACKAGES } = await import('@/lib/absorb/pricing');
    const page = pricingPage();

    const wrong = CREDIT_PACKAGES.filter(
      (p) => !page.includes(`$${p.priceCents / 100} for ${p.credits} credits`)
    ).map((p) => `${p.id}: expected "$${p.priceCents / 100} for ${p.credits} credits"`);

    expect(wrong).toEqual([]);
  });

  it('the markup is stated once, and matches the constant', async () => {
    const { LLM_MARKUP } = await import('@/lib/absorb/pricing');
    const page = pricingPage();
    const percent = `${Math.round((LLM_MARKUP - 1) * 100)}%`;

    expect(page).toContain(percent);
    // The settings panel says 15% in one paragraph and 30% in another while the
    // constant is 1.15. Whatever this page says, it may not say the other one.
    const contradiction = percent === '15%' ? '30%' : '15%';
    expect(page).not.toContain(contradiction);
  });

  it('the page states how many operations carry a price, and the count is right', async () => {
    const { OPERATION_COSTS } = await import('@/lib/absorb/pricing');
    const rows = Object.values(OPERATION_COSTS) as Array<{ baseCostCents: number; tier: string }>;

    const charged = rows.filter((v) => v.baseCostCents > 0);
    const justified = charged.filter((v) => v.tier === 'cloud');
    const unjustified = charged.length - justified.length;

    // The first version of this page said five operations were charged and
    // "nothing else in the product does". Sixteen are. This test caught that
    // before it shipped, which is the whole reason a prose page gets one.
    const page = pricingPage();
    expect(page).toContain(`${charged.length} operations carry a price`);
    expect(page).toContain(`The other ${unjustified} we audited`);
  });
});
