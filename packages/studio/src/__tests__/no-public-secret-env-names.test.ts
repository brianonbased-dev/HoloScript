/**
 * Guard: no env name shaped like NEXT_PUBLIC_*KEY / *SECRET / *TOKEN may appear
 * in Studio source, env files, next.config or Dockerfiles. Next inlines every
 * NEXT_PUBLIC_* value into the browser bundle, so such a name means a
 * credential shipped to every visitor. Tests are skipped (they name the banned
 * variable to prove routes ignore it). Allowlist only names proven public.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const STUDIO_ROOT = path.resolve(__dirname, '..', '..');
const BANNED = /NEXT_PUBLIC_[A-Z0-9_]*(KEY|SECRET|TOKEN)[A-Z0-9_]*/g;
/** name -> why it is safe to ship to the browser */
const ALLOWLIST: Record<string, string> = {
  NEXT_PUBLIC_POSTHOG_KEY: 'PostHog project key: write-only ingest id, public by design',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'Stripe publishable key: public by design',
};

const SCAN_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage']);

function walk(dir: string, out: string[]) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (SCAN_EXT.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
}

function findBannedNames(root: string): string[] {
  const files: string[] = [];
  walk(path.join(root, 'src'), files);
  for (const f of fs.readdirSync(root)) {
    if (/^\.env/.test(f) || /^next\.config\./.test(f) || /^Dockerfile/.test(f)) {
      files.push(path.join(root, f));
    }
  }
  const hits: string[] = [];
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(BANNED)) {
      if (!ALLOWLIST[m[0]]) hits.push(`${path.relative(root, f)}: ${m[0]}`);
    }
  }
  return hits;
}

describe('no NEXT_PUBLIC_*KEY|SECRET|TOKEN env names in Studio', () => {
  it('finds none in source, env files, next.config or Dockerfiles', () => {
    expect(findBannedNames(STUDIO_ROOT)).toEqual([]);
  });
});
