/**
 * task_1790594666743_g1lo: holo_reconstruct_from_video fetched any http(s) URL server-side and
 * reported its size and sha256, so a tools:write caller could probe this host's own network.
 * These tests hold the outbound guard and the video fetch to: an ordinary caller is refused
 * BEFORE any request reaches a non-public address (a stand-in server counts what arrives), on
 * the first hop and on every redirect; an operator or the local stdio process still fetches.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { assertPublicHttpUrl, fetchPublicHttp, isNonPublicAddress } from '../outbound-url-guard';
import { fetchVideoToTempFile } from '../../holo-video-ingest';

interface StandIn {
  base: string;
  hits: () => number;
  close: () => Promise<void>;
}

const servers: StandIn[] = [];

async function standIn(
  respond: (path: string) => { status: number; headers?: Record<string, string>; body?: string }
): Promise<StandIn> {
  let hits = 0;
  const server: Server = createServer((req, res) => {
    hits += 1;
    const out = respond(req.url ?? '/');
    res.writeHead(out.status, out.headers ?? {});
    res.end(out.body ?? '');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { address, port } = server.address() as AddressInfo;
  const host = address.includes(':') ? `[${address}]` : address;
  const handle: StandIn = {
    base: `http://${host}:${port}`,
    hits: () => hits,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
  servers.push(handle);
  return handle;
}

afterEach(async () => {
  while (servers.length) await servers.pop()!.close();
});

describe('isNonPublicAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    '::ffff:10.0.0.1',
    '::ffff:7f00:1',
    '::7f00:1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'ff02::1',
    '64:ff9b::a00:1',
    '2002:a00:1::',
    'not-an-address',
  ])('refuses %s', (address) => {
    expect(isNonPublicAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111', '2001:4860:4860::8888'])(
    'allows public %s',
    (address) => {
      expect(isNonPublicAddress(address)).toBe(false);
    }
  );
});

describe('assertPublicHttpUrl', () => {
  it('refuses non-http schemes, local names, private literals in any spelling, and names that resolve private', async () => {
    await expect(assertPublicHttpUrl('ftp://files.example.com/a')).rejects.toThrow(
      /only http and https/
    );
    for (const raw of [
      'http://svc.railway.internal/x',
      'http://printer.local/x',
      'http://0x7f.1/x', // the URL parser reads this as a loopback literal
      'http://2130706433/x',
      'http://[::ffff:a9fe:a9fe]/latest/meta-data',
    ]) {
      await expect(assertPublicHttpUrl(raw), raw).rejects.toThrow(
        /is not a public internet address/
      );
    }
    const lookupAll = async (host: string) =>
      host === 'split.example' ? ['93.184.216.34', '10.0.0.5'] : ['93.184.216.34'];
    await expect(assertPublicHttpUrl('https://split.example/v.mp4', { lookupAll })).rejects.toThrow(
      /is not a public internet address/
    );
    await expect(
      assertPublicHttpUrl('https://media.example/v.mp4', { lookupAll })
    ).resolves.toBeInstanceOf(URL);
  });

  it('gives one message whether a name fails to resolve or resolves private', async () => {
    const failing = async () => {
      throw new Error('ENOTFOUND');
    };
    const privateOnly = async () => ['10.0.0.9'];
    const a = assertPublicHttpUrl('https://ghost.example/x', { lookupAll: failing }).catch(
      (e: Error) => e.message
    );
    const b = assertPublicHttpUrl('https://ghost.example/x', { lookupAll: privateOnly }).catch(
      (e: Error) => e.message
    );
    expect(await a).toBe(await b);
  });
});

describe('fetchPublicHttp redirects', () => {
  it('re-checks every hop: a redirect onto a non-public address is refused before it connects', async () => {
    const target = await standIn(() => ({ status: 200, body: 'internal' }));
    const first = await standIn(() => ({
      status: 302,
      headers: { location: `${target.base}/secret` },
    }));
    // The first check passes, standing in for a public host; every later check is the real
    // question: is the redirect target checked again before the server connects to it?
    let checks = 0;
    const opts = { isAllowedAddress: () => ++checks === 1 };
    await expect(fetchPublicHttp(`${first.base}/start`, {}, opts)).rejects.toThrow(
      /is not a public internet address/
    );
    expect(first.hits()).toBe(1);
    expect(target.hits()).toBe(0);
    expect(checks).toBe(2);
  });
});

describe('fetchVideoToTempFile (the holo_reconstruct_from_video fetch)', () => {
  it('refuses an ordinary caller before any request reaches a non-public server; an operator still fetches', async () => {
    const server = await standIn(() => ({ status: 200, body: 'not really a video' }));
    const url = `${server.base}/v.mp4`;

    await expect(fetchVideoToTempFile(url, { trustedCaller: false })).rejects.toThrow(
      /is not a public internet address/
    );
    expect(server.hits()).toBe(0);

    const file = await fetchVideoToTempFile(url, { trustedCaller: true });
    try {
      expect(server.hits()).toBe(1);
      expect(file.bytes).toBe('not really a video'.length);
    } finally {
      await file.cleanup();
    }
  });

  it('through handleTool, the production dispatch: a tools:write caller is refused, an operator fetches', async () => {
    const { handleTool } = await import('../../handlers');
    const server = await standIn(() => ({ status: 200, body: 'not really a video' }));
    const args = { videoUrl: `${server.base}/v.mp4`, config: { ingestVideo: true } };
    const caller = (scopes: string[]) => ({
      signedRequest: true,
      signingValid: true,
      signer: 'test-caller',
      scopes,
    });

    const refused = (await handleTool(
      'holo_reconstruct_from_video',
      args,
      caller(['tools:read', 'tools:write'])
    )) as { ingestWarning?: string };
    expect(server.hits()).toBe(0);
    expect(refused.ingestWarning).toMatch(/is not a public internet address/);

    await handleTool('holo_reconstruct_from_video', args, caller(['admin:*']));
    expect(server.hits()).toBe(1);
  }, 60_000);

  it('refuses a file: URL for an ordinary caller', async () => {
    await expect(
      fetchVideoToTempFile('file:///etc/hostname', { trustedCaller: false })
    ).rejects.toThrow(/file: URL needs an operator caller/);
  });
});
