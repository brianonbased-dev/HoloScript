import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';

import {
  LibraryPackageStore,
  createLibraryPackageRouter,
  type LibraryPackagePublishEnvelope,
} from '../LibraryPackageStore.js';

const roots: string[] = [];
const servers: Server[] = [];

function fixtureEnvelope(
  overrides: Partial<LibraryPackagePublishEnvelope> = {}
): LibraryPackagePublishEnvelope {
  return {
    packageIR: {
      schemaVersion: 'holoscript.package-ir.v0.1',
      name: '@cold/ping',
      version: '1.0.0',
      kind: 'library',
      supportTier: 'preview',
      entrypoints: { source: './index.hsplus' },
      dependencies: {},
      compatibility: { holoscript: '>=8.0.0', targets: ['node', 'owned-metal'] },
      capabilities: ['ping'],
      provenance: {
        license: 'MIT',
        repository: 'https://example.test/cold/ping',
        owner: 'cold',
      },
    },
    source: '@export template "Ping"\norb ping { }\n',
    ...overrides,
  };
}

async function startRegistry(storagePath: string): Promise<string> {
  const app = express();
  app.use(express.json());
  app.use(
    createLibraryPackageRouter({
      store: new LibraryPackageStore(storagePath),
      authenticate: (request) =>
        request.headers.authorization === 'Bearer cold-token' ? { namespace: 'cold' } : null,
    })
  );
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('registry did not bind a TCP port');
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve()))
          )
      )
  );
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('native library package HTTP contract', () => {
  it('persists source and resolves an exact immutable artifact after restart', async () => {
    const root = mkdtempSync(join(tmpdir(), 'holoscript-library-registry-'));
    roots.push(root);
    const storagePath = join(root, 'packages.json');
    const firstOrigin = await startRegistry(storagePath);

    const publish = await fetch(`${firstOrigin}/api/v1/packages`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer cold-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify(fixtureEnvelope()),
    });
    expect(publish.status).toBe(201);
    const published = await publish.json();
    expect(published.specifier).toBe('@cold/ping');
    expect(published.version).toBe('1.0.0');
    expect(published.integrity).toMatch(/^sha256:[0-9a-f]{64}$/);

    await new Promise<void>((resolve, reject) =>
      servers.shift()!.close((error) => (error ? reject(error) : resolve()))
    );
    const secondOrigin = await startRegistry(storagePath);
    const resolution = await fetch(
      `${secondOrigin}/api/v1/packages/cold/ping/resolve?range=${encodeURIComponent('^1.0.0')}`
    );
    expect(resolution.status).toBe(200);
    const lockPin = await resolution.json();
    expect(lockPin).toMatchObject({
      specifier: '@cold/ping',
      version: '1.0.0',
      integrity: published.integrity,
    });

    const exact = await fetch(
      `${secondOrigin}/api/v1/packages/cold/ping/versions/${lockPin.version}`
    );
    expect(exact.status).toBe(200);
    const artifact = await exact.json();
    expect(artifact.source).toBe(fixtureEnvelope().source);
    expect(artifact.integrity).toBe(published.integrity);
  });

  it('rejects namespace spoofing and duplicate immutable versions', async () => {
    const root = mkdtempSync(join(tmpdir(), 'holoscript-library-registry-'));
    roots.push(root);
    const origin = await startRegistry(join(root, 'packages.json'));
    const headers = {
      authorization: 'Bearer cold-token',
      'content-type': 'application/json',
    };

    const spoofed = await fetch(`${origin}/api/v1/packages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(
        fixtureEnvelope({
          packageIR: { ...fixtureEnvelope().packageIR, name: '@other/ping' },
        })
      ),
    });
    expect(spoofed.status).toBe(403);

    const first = await fetch(`${origin}/api/v1/packages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(fixtureEnvelope()),
    });
    expect(first.status).toBe(201);
    const duplicate = await fetch(`${origin}/api/v1/packages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(fixtureEnvelope({ source: '// replacement is forbidden' })),
    });
    expect(duplicate.status).toBe(409);
  });
});
