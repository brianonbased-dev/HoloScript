import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { applyCorsHeaders, getAllowedOrigins, resolveAllowedOrigin } from './cors';

const PROD = { NODE_ENV: 'production' };
const EVIL = 'https://evil.example';

function corsFor(origin: string | null, env: Record<string, string | undefined>, preflight = false) {
  const h = new Headers();
  applyCorsHeaders(h, origin, { env, preflight });
  return h;
}

describe('studio-api CORS allowlist', () => {
  it('defaults to the prod Studio origins only in production', () => {
    expect([...getAllowedOrigins(PROD)].sort()).toEqual([
      'https://holoscript.studio',
      'https://www.holoscript.studio',
    ]);
  });

  it('adds localhost dev origins only outside production', () => {
    expect(getAllowedOrigins({ NODE_ENV: 'development' }).has('http://localhost:3100')).toBe(true);
    expect(getAllowedOrigins(PROD).has('http://localhost:3100')).toBe(false);
  });

  it('includes NEXT_PUBLIC_STUDIO_URL when set', () => {
    expect(resolveAllowedOrigin('https://preview.example', { ...PROD, NEXT_PUBLIC_STUDIO_URL: 'https://preview.example/' })).toBe(
      'https://preview.example'
    );
  });

  it('STUDIO_API_ALLOWED_ORIGINS replaces the defaults and cannot reintroduce *', () => {
    const env = { ...PROD, STUDIO_API_ALLOWED_ORIGINS: 'https://a.example, *' };
    expect([...getAllowedOrigins(env)]).toEqual(['https://a.example']);
    expect(resolveAllowedOrigin('https://holoscript.studio', env)).toBeNull();
    expect(resolveAllowedOrigin(EVIL, env)).toBeNull();
  });

  it('reflects an allowed origin with credentials and Vary: Origin', () => {
    const h = corsFor('https://holoscript.studio', PROD);
    expect(h.get('Access-Control-Allow-Origin')).toBe('https://holoscript.studio');
    expect(h.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(h.get('Vary')).toBe('Origin');
  });

  it('NC: an evil origin gets no ACAO and no credentials (simple and preflight)', () => {
    for (const preflight of [false, true]) {
      const h = corsFor(EVIL, PROD, preflight);
      expect(h.get('Access-Control-Allow-Origin')).toBeNull();
      expect(h.get('Access-Control-Allow-Credentials')).toBeNull();
      expect(h.get('Access-Control-Allow-Methods')).toBeNull();
      expect(h.get('Vary')).toBe('Origin');
    }
  });

  it('NC: lookalike and null origins are rejected', () => {
    for (const o of ['https://holoscript.studio.evil.example', 'http://holoscript.studio', 'null', 'https://evilholoscript.studio']) {
      expect(resolveAllowedOrigin(o, PROD)).toBeNull();
    }
  });

  it('strips an upstream wildcard ACAO for a disallowed origin', () => {
    const h = new Headers({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Credentials': 'true' });
    applyCorsHeaders(h, EVIL, { env: PROD });
    expect(h.get('Access-Control-Allow-Origin')).toBeNull();
    expect(h.get('Access-Control-Allow-Credentials')).toBeNull();
  });
});

describe('production https-only configured origins (Mapping N1)', () => {
  it('drops http:// and localhost from STUDIO_API_ALLOWED_ORIGINS in production', () => {
    const env = {
      ...PROD,
      STUDIO_API_ALLOWED_ORIGINS: 'https://ok.example, http://plain.example, http://localhost:3100, http://127.0.0.1:3105',
    };
    expect([...getAllowedOrigins(env)]).toEqual(['https://ok.example']);
    expect(resolveAllowedOrigin('http://plain.example', env)).toBeNull();
    expect(resolveAllowedOrigin('http://localhost:3100', env)).toBeNull();
  });

  it('drops an http NEXT_PUBLIC_STUDIO_URL in production', () => {
    const env = { ...PROD, NEXT_PUBLIC_STUDIO_URL: 'http://localhost:3100' };
    expect(resolveAllowedOrigin('http://localhost:3100', env)).toBeNull();
    expect(getAllowedOrigins(env).has('http://localhost:3100')).toBe(false);
  });

  it('keeps http configured origins outside production', () => {
    const env = { NODE_ENV: 'development', STUDIO_API_ALLOWED_ORIGINS: 'http://plain.example' };
    expect(resolveAllowedOrigin('http://plain.example', env)).toBe('http://plain.example');
  });
});

describe('ACAO guard (Mapping N2)', () => {
  it('only lib/cors.ts sets Access-Control-Allow-Origin in studio-api src or next.config.js', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const pkgRoot = path.resolve(__dirname, '..', '..');
    const files: string[] = [path.join(pkgRoot, 'next.config.js')];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) walk(f);
        else if (/\.(m?[jt]sx?|cjs)$/.test(e.name) && !/\.test\.[jt]sx?$/.test(e.name)) files.push(f);
      }
    };
    walk(path.join(pkgRoot, 'src'));
    const allowed = path.join(pkgRoot, 'src', 'lib', 'cors.ts');
    const offenders = files.filter(
      (f) => f !== allowed && /access-control-allow-origin/i.test(fs.readFileSync(f, 'utf8'))
    );
    expect(files.length).toBeGreaterThan(5);
    expect(offenders.map((f) => path.relative(pkgRoot, f))).toEqual([]);
  });
});

describe('proxy CORS (integration)', () => {
  afterEach(() => vi.unstubAllEnvs());

  async function run(method: string, origin?: string) {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const { proxy } = await import('../proxy');
    const headers: Record<string, string> = {};
    if (origin) headers.origin = origin;
    if (method === 'OPTIONS') headers['access-control-request-method'] = 'POST';
    return proxy(new NextRequest('https://api.example/api/projects', { method, headers }));
  }

  it('answers an allowed preflight with 204, reflected origin, methods and credentials', async () => {
    const res = await run('OPTIONS', 'https://holoscript.studio');
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://holoscript.studio');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(res.headers.get('Vary')).toContain('Origin');
  });

  it('NC: evil preflight gets no ACAO, no credentials, no methods', async () => {
    const res = await run('OPTIONS', EVIL);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    expect(res.headers.get('Access-Control-Allow-Methods')).toBeNull();
    expect(res.headers.get('Vary')).toContain('Origin');
  });

  it('NC: evil GET gets no ACAO or credentials', async () => {
    const res = await run('GET', EVIL);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });

  it('allowed GET is reflected with credentials', async () => {
    const res = await run('GET', 'https://www.holoscript.studio');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://www.holoscript.studio');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('NC: evil cross-origin POST is still blocked by CSRF and carries no ACAO', async () => {
    const res = await run('POST', EVIL);
    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
