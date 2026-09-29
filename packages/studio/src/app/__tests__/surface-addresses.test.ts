/**
 * Every composition address a Studio page asks for is one a route serves.
 *
 * WHY THIS SUITE EXISTS. The industry portal asked `useHoloComposition` for
 * `/api/surface/industry/<vertical>` on every visit. The surface route is
 * `api/surface/[slug]`: one segment, so no route matched that address, and no
 * rewrite either. Each visit made a request that could only 404, and the
 * composition slot in the portal header could never render. Nothing said so,
 * because the hook turns any failed load into "render nothing".
 *
 * Like front-door.test.ts, this reads the route tree from disk instead of
 * booting Next: an address that matches nothing is a file-layout fact.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const appDir = dirname(fileURLToPath(new URL('../layout.tsx', import.meta.url)));
const srcDir = join(appDir, '..');
const studioRoot = join(srcDir, '..');

/** Stands for a `${...}` part of an address: any value, so only a dynamic segment matches it. */
const ANY = '\u0000any';

/** Route handler files under app/api, as URL segments with route groups dropped. */
function apiRoutes(): string[][] {
  const routes: string[][] = [];
  const stack = [join(appDir, 'api')];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (/^route\.(ts|js)$/.test(entry.name)) {
        const segments = relative(appDir, current)
          .split(/[\\/]/)
          .filter((s) => s && !s.startsWith('(') && !s.startsWith('@'));
        routes.push(segments);
      }
    }
  }
  return routes;
}

/** Does a route with these segments serve `wanted`? */
function serves(route: string[], wanted: string[]): boolean {
  for (let i = 0; i < route.length; i++) {
    const segment = route[i];
    if (segment.startsWith('[[...')) return true; // zero or more of anything
    if (segment.startsWith('[...')) return wanted.length > i; // one or more
    if (i >= wanted.length) return false;
    if (segment.startsWith('[')) continue; // any one segment
    if (segment !== wanted[i]) return false;
  }
  return route.length === wanted.length;
}

interface AskedAddress {
  address: string;
  segments: string[];
  file: string;
}

/** Every `useHoloComposition('...')` or `` useHoloComposition(`...`) `` address in src. */
function askedAddresses(): AskedAddress[] {
  const asked: AskedAddress[] = [];
  const stack = [srcDir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && entry.name !== 'node_modules') stack.push(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
      const text = readFileSync(full, 'utf8');
      for (const match of text.matchAll(/useHoloComposition\(\s*(['"`])([^'"`]*)\1\s*\)/g)) {
        const address = match[2];
        const path = address.split('?')[0];
        asked.push({
          address,
          segments: path
            .split('/')
            .filter(Boolean)
            .map((s) => (s.includes('${') ? ANY : s)),
          file: relative(studioRoot, full).split('\\').join('/'),
        });
      }
    }
  }
  return asked;
}

const routes = apiRoutes();
const asked = askedAddresses();

describe('composition addresses Studio pages ask for', () => {
  it('finds the pages that load a composition, so the check below is not empty', () => {
    expect(asked.map((a) => a.address)).toEqual(
      expect.arrayContaining(['/api/surface/registry', '/api/surface/settings'])
    );
  });

  it('asks only for addresses a route serves', () => {
    const unserved = asked
      .filter((a) => !a.address.startsWith('/api/') || !routes.some((r) => serves(r, a.segments)))
      .map((a) => `${a.file}: ${a.address}`);
    expect(unserved).toEqual([]);
  });

  it('asks the generic surface route only for compositions it serves', () => {
    // api/surface/[slug] serves compositions/studio/<slug>.hsplus for the slugs it
    // allows, and 404s for anything else.
    const routeSource = readFileSync(join(appDir, 'api', 'surface', '[slug]', 'route.ts'), 'utf8');
    const allowedList = /ALLOWED_SLUGS = new Set\(\[([^\]]*)\]\)/.exec(routeSource)?.[1] ?? '';
    const allowed = new Set([...allowedList.matchAll(/'([^']+)'/g)].map((m) => m[1]));
    expect(allowed.size).toBeGreaterThan(0);
    const compositionsDir = join(studioRoot, '..', '..', 'compositions', 'studio');
    const unserved = asked
      .filter(
        (a) => a.segments.length === 3 && a.segments[0] === 'api' && a.segments[1] === 'surface'
      )
      .filter(
        (a) =>
          !allowed.has(a.segments[2]) ||
          !existsSync(join(compositionsDir, `${a.segments[2]}.hsplus`))
      )
      .map((a) => `${a.file}: ${a.address}`);
    expect(unserved).toEqual([]);
  });
});
