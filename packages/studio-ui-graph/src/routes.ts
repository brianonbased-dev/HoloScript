import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export interface PageEntry {
  /** Stable id usable as an identifier in .holo output (a-z, 0-9, _). */
  id: string;
  /** Next.js route, e.g. "/agents/[id]/storefront". */
  route: string;
  /** Repo-relative path to page.tsx, with forward slashes. */
  file: string;
  /** Resolved abs path on disk. */
  abs: string;
}

const PAGE_FILE = 'page.tsx';

/**
 * Walk a Next.js app router root and return every page.tsx with its derived
 * route. Handles route groups (e.g. `(industry)`) by stripping their segment,
 * dynamic segments (`[id]`, `[...slug]`), and per-platform alternates.
 */
export function findPages(appRoot: string, repoRoot: string): PageEntry[] {
  const out: PageEntry[] = [];
  walk(appRoot, (abs) => {
    if (abs.endsWith(`${sep}${PAGE_FILE}`) || abs.endsWith(`/${PAGE_FILE}`)) {
      out.push(makeEntry(abs, appRoot, repoRoot));
    }
  });
  out.sort((a, b) => a.route.localeCompare(b.route));
  return out;
}

function walk(dir: string, visit: (abs: string) => void): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const abs = join(dir, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      walk(abs, visit);
    } else if (st.isFile()) {
      visit(abs);
    }
  }
}

function makeEntry(abs: string, appRoot: string, repoRoot: string): PageEntry {
  const rel = relative(appRoot, abs).split(sep).join('/');
  const dir = rel.replace(/\/page\.tsx$/, '');
  const route = '/' + dir
    .split('/')
    .filter((seg) => seg && !(seg.startsWith('(') && seg.endsWith(')')))
    .join('/');
  const id = idFromRoute(route);
  const file = relative(repoRoot, abs).split(sep).join('/');
  return { id, route: route === '/' ? '/' : route, file, abs };
}

/**
 * Build a stable, filesystem-safe identifier from a route path. Brackets and
 * parens are dropped (with the dynamic segment kept lowercase) and `/` becomes
 * `_`. Empty (the index route) becomes `_index`.
 */
export function idFromRoute(route: string): string {
  if (!route || route === '/') return '_index';
  const cleaned = route
    .replace(/^\//, '')
    .replace(/\(([^)]+)\)/g, '$1')
    .replace(/\[\.\.\.([^\]]+)\]/g, '$1')
    .replace(/\[([^\]]+)\]/g, '$1')
    .replace(/[^a-zA-Z0-9/]+/g, '_')
    .replace(/\//g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return cleaned || '_index';
}
