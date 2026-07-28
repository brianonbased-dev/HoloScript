import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PackagePublisher } from './publisher';

const roots: string[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('native library publisher contract', () => {
  it('publishes the declared HoloScript entrypoint to the v1 package rail', async () => {
    const root = mkdtempSync(join(tmpdir(), 'holoscript-native-publisher-'));
    roots.push(root);
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, 'dist'));
    writeFileSync(join(root, 'src', 'index.hsplus'), '@export template "Ping"\norb ping { }\n');
    writeFileSync(join(root, 'dist', 'index.js'), 'throw new Error("Node main must not publish");');
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        name: '@cold/ping',
        version: '1.0.0',
        main: './dist/index.js',
        license: 'MIT',
        repository: 'https://example.test/cold/ping',
        author: 'cold',
        holoscript: {
          artifact: 'library',
          entrypoint: './src/index.hsplus',
          supportTier: 'preview',
          compatibility: {
            holoscript: '>=8.0.0',
            targets: ['node', 'owned-metal'],
          },
        },
      })
    );

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          specifier: '@cold/ping',
          version: '1.0.0',
          integrity: `sha256:${'a'.repeat(64)}`,
          sourceUrl: '/api/v1/packages/cold/ping/versions/1.0.0',
        }),
        { status: 201, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const publisher = new PackagePublisher(root, {
      registry: 'https://registry.test',
      token: 'cold-token',
    });
    const result = await (publisher as any).uploadToRegistry(
      join(root, 'ignored.tgz'),
      '@cold/ping',
      '1.0.0',
      'cold-token'
    );

    expect(result.success).toBe(true);
    expect(result.url).toBe('https://registry.test/api/v1/packages/cold/ping/versions/1.0.0');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('https://registry.test/api/v1/packages');
    const payload = JSON.parse(request.body);
    expect(payload.packageIR.entrypoints.source).toBe('./src/index.hsplus');
    expect(payload.source).toBe('@export template "Ping"\norb ping { }\n');
    expect(payload.source).not.toContain('Node main must not publish');
  });
});
