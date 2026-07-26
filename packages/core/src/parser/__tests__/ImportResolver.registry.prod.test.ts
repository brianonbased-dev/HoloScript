import { digestPackageSource } from '@holoscript/platform';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ImportResolver,
  type ImportResolveOptions,
  type RegistryPackageCacheEntry,
} from '../ImportResolver';
import { HoloScriptPlusParser } from '../HoloScriptPlusParser';

const source = '@export template "Ping"\norb ping { }\n';
const specifier = '@cold/ping';

function parseConsumer() {
  return new HoloScriptPlusParser({ enableTypeScriptImports: true }).parse(
    `@import { Ping } from "${specifier}"\norb app { }\n`
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ImportResolver native package registry contract', () => {
  it('resolves a lock-pinned exact version and verifies source integrity', async () => {
    const integrity = await digestPackageSource(source);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          specifier,
          version: '1.0.0',
          integrity,
          source,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const resolver = new ImportResolver();
    const result = await resolver.resolve(parseConsumer(), '/consumer/app.hsplus', {
      baseDir: '/consumer',
      registryBaseUrl: 'https://registry.test',
      registryLock: {
        [specifier]: { version: '1.0.0', integrity },
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.scope.has('Ping')).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://registry.test/api/v1/packages/cold/ping/versions/1.0.0'
    );
  });

  it('rejects digest mismatch as registry_unavailable', async () => {
    const integrity = await digestPackageSource(source);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            specifier,
            version: '1.0.0',
            integrity,
            source: `${source}// tampered`,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    );
    const result = await new ImportResolver().resolve(
      parseConsumer(),
      '/consumer/app.hsplus',
      {
        baseDir: '/consumer',
        registryBaseUrl: 'https://registry.test',
        registryLock: {
          [specifier]: { version: '1.0.0', integrity },
        },
      }
    );

    expect(result.scope.size).toBe(0);
    expect(result.errors[0]?.code).toBe('registry_unavailable');
  });

  it('does not fall through to the filesystem when a registry import lacks a lock pin', async () => {
    const readFile = vi.fn().mockRejectedValue(new Error('filesystem should not be consulted'));
    const result = await new ImportResolver().resolve(
      parseConsumer(),
      '/consumer/app.hsplus',
      {
        baseDir: '/consumer',
        registryBaseUrl: 'https://registry.test',
        readFile,
      }
    );

    expect(readFile).not.toHaveBeenCalled();
    expect(result.errors[0]?.code).toBe('registry_unavailable');
  });

  it('replays a verified cache with the network disabled', async () => {
    const integrity = await digestPackageSource(source);
    const registryCache: Record<string, RegistryPackageCacheEntry> = {
      [specifier]: { version: '1.0.0', integrity, source },
    };
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network must remain unused')));
    const options: ImportResolveOptions = {
      baseDir: '/consumer',
      offline: true,
      registryLock: {
        [specifier]: { version: '1.0.0', integrity },
      },
      registryCache,
    };
    const result = await new ImportResolver().resolve(
      parseConsumer(),
      '/consumer/app.hsplus',
      options
    );

    expect(result.errors).toEqual([]);
    expect(result.scope.has('Ping')).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});
