/**
 * The default for /api is CLOSED.
 *
 * Nine rounds of door fixes each closed one route and revealed the next,
 * because `src/proxy.ts` matched `/((?!api|_next/|favicon.ico).*)` — /api was
 * excluded, so every guard was a hand-patch against an open default and a route
 * added tomorrow inherited nothing. Census 2026-09-15: 236 route files, 164
 * with no caller gate at all, 27 of those attaching one of our server keys.
 *
 * These tests are about the DEFAULT, not about any one door:
 *
 *  1. a path nobody allowlisted is refused — including one that does not exist,
 *     which is the state every new route file starts in;
 *  2. every path that IS allowlisted still answers a signed-out visitor, so
 *     flipping the default cannot quietly break the public site;
 *  3. the matcher still covers /api, because the gate below is only reached if
 *     the middleware runs at all.
 *
 * Nothing here reaches the network: the middleware decides from the request.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { config, proxy } from '../proxy';
import {
  CALLER_CREDENTIAL_API_PATHS,
  PUBLIC_API_PATHS,
  classifyApiPath,
  type ApiPathRule,
} from '../lib/api-public-paths';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const API_DIR = join(HERE, '..', 'app', 'api');

/** Every route.ts under app/api, as the URL path it answers on. */
function routePaths(dir: string = API_DIR, prefix = '/api'): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      found.push(...routePaths(join(dir, entry.name), `${prefix}/${entry.name}`));
    } else if (entry.name === 'route.ts') {
      found.push(prefix);
    }
  }
  return found;
}

/** Fill dynamic segments so the path is one a real request could carry. */
function concrete(path: string): string {
  return path
    .replace(/\[\[\.\.\.[^\]]+\]\]/g, 'probe')
    .replace(/\[\.\.\.[^\]]+\]/g, 'probe')
    .replace(/\[[^\]]+\]/g, 'probe');
}

function request(path: string, method = 'GET', headers: Record<string, string> = {}) {
  return new NextRequest(`https://studio.test${path}`, { method, headers });
}

async function anonymous(path: string, method = 'GET', headers: Record<string, string> = {}) {
  return proxy(request(path, method, headers));
}

beforeEach(() => {
  // A secret must exist or no session could be verified for anyone; the
  // requests below simply carry no session cookie.
  vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-for-gate-decisions');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the /api default is closed', () => {
  it('refuses a path nobody allowlisted — the state every new route starts in', async () => {
    // This is the compounding assertion. No route file exists here; if someone
    // adds one tomorrow and writes no guard, this is the answer it inherits.
    const response = await anonymous('/api/__a_route_nobody_has_written_yet__', 'POST');

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ signInRequired: true });
  });

  it('refuses every real route that is not allowlisted, signed out', async () => {
    const closed = routePaths()
      .map(concrete)
      .filter((path) => classifyApiPath(path, 'GET') === 'session');

    // Guard against a vacuous pass: if the allowlist ever swallowed everything,
    // this suite would "pass" while proving nothing.
    expect(closed.length).toBeGreaterThan(100);

    const reachable: string[] = [];
    for (const path of closed) {
      const response = await anonymous(path);
      if (response.status !== 401) reachable.push(path);
    }

    expect(reachable).toEqual([]);
  });

  it('refuses the specific doors this lane was opened for', async () => {
    const doors: Array<[string, string]> = [
      ['/api/publish', 'POST'],
      ['/api/admin/probe', 'GET'],
      ['/api/admin/probe', 'POST'],
      ['/api/holomesh/marketplace/sync', 'POST'],
      ['/api/knowledge/sync', 'POST'],
    ];

    for (const [path, method] of doors) {
      const response = await anonymous(path, method);
      expect.soft(response.status, `${method} ${path}`).toBe(401);
    }
  });

  it('still runs for /api at all — the gate is useless if the matcher skips it', () => {
    // The matcher excluded `api` until 2026-09-15. If that exclusion ever comes
    // back, every assertion above keeps passing while production is wide open,
    // because these call proxy() directly. This is the assertion that notices.
    const matcher = new RegExp(`^${config.matcher[0]}$`);

    expect(matcher.test('/api/publish')).toBe(true);
    expect(matcher.test('/api/anything/at/all')).toBe(true);
    expect(matcher.test('/_next/static/chunk.js')).toBe(false);
  });
});

describe('the allowlist keeps the signed-out site working', () => {
  const sample = (rule: ApiPathRule) => ({
    path: concrete(rule.pattern.replace(/\*\*/g, 'probe').replace(/\*/g, 'probe')),
    method: rule.methods?.[0] ?? 'GET',
  });

  it('every public path still answers a visitor with no credential', async () => {
    const refused: string[] = [];
    for (const rule of PUBLIC_API_PATHS) {
      const { path, method } = sample(rule);
      const response = await anonymous(path, method);
      if (response.status === 401) refused.push(`${method} ${path}`);
    }

    expect(refused).toEqual([]);
  });

  it('keeps the sign-in route reachable, or nobody could ever get a session', async () => {
    for (const path of ['/api/auth/session', '/api/auth/callback/github', '/api/auth/csrf']) {
      expect.soft((await anonymous(path)).status, path).not.toBe(401);
    }
  });

  it('never refuses a CORS preflight, which carries no credential by design', async () => {
    for (const path of ['/api/publish', '/api/admin/probe', '/api/holomesh/marketplace/sync']) {
      expect.soft((await anonymous(path, 'OPTIONS')).status, path).not.toBe(401);
    }
  });

  it('lets an agent with its own key reach the routes that run on caller keys', async () => {
    for (const rule of CALLER_CREDENTIAL_API_PATHS) {
      const { path, method } = sample(rule);

      const withKey = await anonymous(path, method, { 'x-mcp-api-key': 'an-agents-own-key' });
      expect.soft(withKey.status, `key ${method} ${path}`).not.toBe(401);

      const without = await anonymous(path, method);
      expect.soft(without.status, `bare ${method} ${path}`).toBe(401);
    }
  });

  it('does not lock out the benchmark runner the routes already accept', async () => {
    // requireAuth has honoured an opt-in `x-benchmark-key` bypass since before
    // this gate existed. A gate in front that refuses what the route behind it
    // would have accepted is a silent lockout, and it presents as a broken key
    // rather than as a new door.
    vi.stubEnv('BRITTNEY_BENCHMARK_KEY', 'configured-benchmark-key');

    const accepted = await anonymous('/api/projects', 'GET', {
      'x-benchmark-key': 'configured-benchmark-key',
    });
    expect(accepted.status).not.toBe(401);

    const wrongKey = await anonymous('/api/projects', 'GET', { 'x-benchmark-key': 'not-the-key' });
    expect(wrongKey.status).toBe(401);
  });

  it('the benchmark header alone opens nothing when the key is not configured', async () => {
    vi.stubEnv('BRITTNEY_BENCHMARK_KEY', '');

    const response = await anonymous('/api/projects', 'GET', {
      'x-benchmark-key': 'anything-at-all',
    });

    expect(response.status).toBe(401);
  });

  it('documents why each allowlisted path is reachable', () => {
    for (const rule of [...PUBLIC_API_PATHS, ...CALLER_CREDENTIAL_API_PATHS]) {
      expect.soft(rule.why.trim().length, rule.pattern).toBeGreaterThan(30);
    }
  });
});
