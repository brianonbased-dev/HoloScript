/**
 * Fails if a self / dashboard / spend route reaches HoloMesh through a helper
 * that falls back to Studio's server key (HOLOMESH_API_KEY, the founder's).
 *
 * Covered: agent/self, /me, dashboard, earn, transactions (not the
 * founder-gated sync), contribute, purchase, and entry POST. Those routes must
 * use the self-only helpers in lib/holomesh-proxy.ts (proxyHoloMeshSelf,
 * fetchHoloMeshJsonSelf, callerHoloMeshHeaders) and refuse a keyless caller
 * with 404 no_holomesh_agent. New files matching the pattern are picked up
 * automatically.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const API = path.resolve(__dirname, '../app/api');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (name === 'route.ts') out.push(p);
  }
  return out;
}

const rel = (p: string) => path.relative(API, p).split(path.sep).join('/');

const SELF_ROUTE =
  /(^|\/)(agent\/self|me|dashboard|earn|earnings|transactions|contribute)(\/|$)|\/purchase\/route\.ts$/;
// Founder-gated server-only mirror jobs; documented in the audit PR.
const SERVER_ONLY = new Set(['holomesh/transactions/sync/route.ts']);

const selfRoutes = walk(API)
  .map(rel)
  .filter((r) => SELF_ROUTE.test(r) && !SERVER_ONLY.has(r));

const FALLBACK_HELPER = /\b(proxyHoloMesh|fetchHoloMeshJson)\b(?!Self)/;
const SERVER_KEY_ENV = /process\.env\.HOLOMESH_(API_)?KEY\b/;

describe('self routes never use the server-key fallback', () => {
  it('found the self routes this guard is about', () => {
    for (const must of [
      'holomesh/agent/self/contributions/route.ts',
      'holomesh/agent/self/knowledge/route.ts',
      'holomesh/dashboard/route.ts',
      'holomesh/dashboard/earnings/route.ts',
      'holomesh/transactions/route.ts',
      'holomesh/contribute/route.ts',
      'holomesh/entry/[id]/purchase/route.ts',
    ]) {
      expect(selfRoutes).toContain(must);
    }
  });

  it.each(selfRoutes)('%s does not import or call proxyHoloMesh / fetchHoloMeshJson', (r) => {
    const src = fs.readFileSync(path.join(API, r), 'utf8');
    expect(src).not.toMatch(FALLBACK_HELPER);
  });

  it.each(selfRoutes)('%s does not read HOLOMESH_API_KEY itself', (r) => {
    const src = fs.readFileSync(path.join(API, r), 'utf8');
    expect(src).not.toMatch(SERVER_KEY_ENV);
  });

  it('entry/[id] POST (public GET shares the file) uses only the caller key', () => {
    const src = fs.readFileSync(path.join(API, 'holomesh/entry/[id]/route.ts'), 'utf8');
    const post = src.slice(src.indexOf('export async function POST'));
    const postBody = post.slice(0, post.indexOf('\n}\n'));
    expect(postBody).toMatch(/noHoloMeshAgentResponse\(\)/);
    expect(postBody).not.toMatch(/buildHeaders\(|\bKEY\b|proxyHoloMesh\(|fetchHoloMeshJson\(/);
  });
});
