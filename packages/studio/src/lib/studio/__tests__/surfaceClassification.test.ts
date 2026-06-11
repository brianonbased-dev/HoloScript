import { readdirSync, statSync } from 'node:fs';
import { extname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  STUDIO_LAB_NAVIGATION_ITEMS,
  STUDIO_PRIMARY_NAVIGATION_ITEMS,
  STUDIO_ROUTE_SURFACES,
  getVisibleStudioNavigationItems,
} from '../surfaceClassification';

const appRoot = fileURLToPath(new URL('../../../app', import.meta.url));
const testFilePattern = /(?:^|[\\/])__(?:tests|mocks|fixtures)__[\\/]|(?:\.test|\.spec)\.[tj]sx?$/;
const validSourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx']);

function walkFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = `${current}${sep}${entry.name}`;
      if (entry.isDirectory()) {
        stack.push(path);
      } else if (entry.isFile()) {
        out.push(path);
      }
    }
  }

  return out.sort((a, b) => a.localeCompare(b));
}

function isSourceFile(path: string): boolean {
  return validSourceExtensions.has(extname(path)) && !testFilePattern.test(path);
}

function normalizePath(path: string): string {
  return path.split(sep).join('/');
}

function routeFromPageFile(path: string): string {
  const rel = normalizePath(relative(appRoot, path));
  const routePath = rel.replace(/\/page\.[tj]sx?$/, '');
  if (routePath === '' || routePath === 'page.tsx') return '/';

  const segments = routePath
    .split('/')
    .filter((segment) => segment && !segment.startsWith('(') && !segment.startsWith('@'));
  return `/${segments.join('/')}`.replace(/\/+/g, '/');
}

function collectCurrentPageRoutes(): string[] {
  return [
    ...new Set(
      walkFiles(appRoot)
        .filter((path) => isSourceFile(path) && /[\\/]page\.[tj]sx?$/.test(path))
        .filter((path) => !normalizePath(path).includes('/api/'))
        .filter((path) => statSync(path).isFile())
        .map(routeFromPageFile)
    ),
  ].sort((a, b) => a.localeCompare(b));
}

describe('Studio surface classification', () => {
  it('classifies every current app page route', () => {
    const actualRoutes = collectCurrentPageRoutes();
    const classifiedRoutes = STUDIO_ROUTE_SURFACES.map((surface) => surface.route).sort((a, b) =>
      a.localeCompare(b)
    );

    expect(classifiedRoutes).toEqual(actualRoutes);
    expect(new Set(classifiedRoutes).size).toBe(classifiedRoutes.length);
  });

  it('keeps the A4 7-destination primary nav (Home / Create / Projects / Network / Earn / Operations / Settings)', () => {
    // Settings is a pinned footer item, not in STUDIO_PRIMARY_NAVIGATION_ITEMS —
    // the 6 items below are the main scroll area; Settings is rendered separately.
    const visibleItems = getVisibleStudioNavigationItems(false);

    expect(visibleItems).toEqual(STUDIO_PRIMARY_NAVIGATION_ITEMS);
    expect(visibleItems.map((item) => item.href)).toEqual([
      '/',
      '/create',
      '/projects',
      '/holomesh',
      '/earn',
      '/operations',
    ]);
    expect(
      visibleItems.every((item) =>
        ['core-workbench', 'account-workspace', 'holomesh-public', 'lab'].includes(
          item.surfaceClass
        )
      )
    ).toBe(true);
  });

  it('labs flag does not change the visible nav (A4 consolidation — lab items are parked)', () => {
    // Post-A4: getVisibleStudioNavigationItems always returns STUDIO_PRIMARY_NAVIGATION_ITEMS
    // regardless of the labs flag. STUDIO_LAB_NAVIGATION_ITEMS are kept for structural
    // completeness but are no longer appended to the rendered nav.
    const withLabs = getVisibleStudioNavigationItems(true);
    const withoutLabs = getVisibleStudioNavigationItems(false);

    expect(withLabs).toEqual(withoutLabs);
    expect(withLabs).toEqual(STUDIO_PRIMARY_NAVIGATION_ITEMS);
    expect(STUDIO_LAB_NAVIGATION_ITEMS.every((item) => item.navigationLane === 'lab')).toBe(true);
  });
});
