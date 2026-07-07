import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { createFileSecretBackend, FILE_SECRET_STORE_SCHEMA } from '../file-secret-backend';
import { createSecretStore, type KekProvider } from '../secret-store';

const tempRoots: string[] = [];

function makeKekProvider(keks: Record<string, Buffer>, current: string): KekProvider {
  return {
    async getKek(kekId?: string): Promise<Buffer> {
      const id = kekId ?? current;
      const kek = keks[id];
      if (!kek) throw new Error(`test kek provider: unknown kekId ${id}`);
      return kek;
    },
    currentKekId(): string {
      return current;
    },
  };
}

async function tempStorePath(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'holokey-file-backend-'));
  tempRoots.push(root);
  return join(root, 'secret-store.json');
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('createFileSecretBackend', () => {
  it('persists encrypted rows across store instances without storing plaintext', async () => {
    const filePath = await tempStorePath();
    const kekProvider = makeKekProvider({ k1: randomBytes(32) }, 'k1');

    const firstStore = createSecretStore({
      backend: createFileSecretBackend({ filePath }),
      kekProvider,
    });
    await firstStore.put({
      ownerId: 'infra',
      name: 'HOLOSCRIPT_API_KEY',
      value: 'secret-value-never-in-file',
    });

    const raw = await readFile(filePath, 'utf8');
    expect(raw).toContain(FILE_SECRET_STORE_SCHEMA);
    expect(raw).not.toContain('secret-value-never-in-file');

    const secondStore = createSecretStore({
      backend: createFileSecretBackend({ filePath }),
      kekProvider,
    });
    const got = await secondStore.get({ ownerId: 'infra', ref: 'vault:HOLOSCRIPT_API_KEY' });
    expect(got.value).toBe('secret-value-never-in-file');
  });

  it('persists replacement version and delete semantics', async () => {
    const filePath = await tempStorePath();
    const kekProvider = makeKekProvider({ k1: randomBytes(32) }, 'k1');
    const store = createSecretStore({
      backend: createFileSecretBackend({ filePath }),
      kekProvider,
    });

    expect((await store.put({ ownerId: 'infra', name: 'A', value: 'v1' })).version).toBe(1);
    expect((await store.put({ ownerId: 'infra', name: 'A', value: 'v2' })).version).toBe(2);
    expect((await store.list({ ownerId: 'infra' })).map((item) => item.name)).toEqual(['A']);
    expect((await store.get({ ownerId: 'infra', ref: 'vault:A' })).value).toBe('v2');

    expect((await store.delete({ ownerId: 'infra', ref: 'vault:A' })).deleted).toBe(true);
    expect(await store.list({ ownerId: 'infra' })).toEqual([]);
  });
});
