/**
 * task_1790594666743_g1lo: holo_reconstruct_from_video fetched any http(s) URL server-side and
 * reported its size and sha256, so a tools:write caller could probe this host's own network.
 * These tests hold the outbound guard and the video fetch to: an ordinary caller is refused
 * BEFORE any request reaches a non-public address (a stand-in server counts what arrives), on
 * the first hop, on every redirect, and when DNS changes its answer between the check and the
 * connection; an operator or the local stdio process still fetches, and nothing else is trusted
 * for lacking a signing context.
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
    // Found by the pre-review of #420: the translated form SIIT routes (::ffff:0:0:0/96),
    // local-use NAT64 (64:ff9b:1::/48), Teredo (2001::/32) and old site-local (fec0::/10).
    '::ffff:0:7f00:1',
    '::ffff:0:a9fe:a9fe',
    '64:ff9b:1::a9fe:a9fe',
    '2001:0:4136:e378:8000:63bf:3fff:fdd2',
    'fec0::1',
    'not-an-address',
  ])('refuses %s', (address) => {
    expect(isNonPublicAddress(address)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '172.32.0.1',
    '2606:4700:4700::1111',
    '2001:4860:4860::8888',
    '::ffff:0:808:808', // the translated form of a public address is that public address
  ])('allows public %s', (address) => {
    expect(isNonPublicAddress(address)).toBe(false);
  });
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

  it('refuses a local name written with the trailing dot of a fully qualified name', async () => {
    // DNS answers public for everything here, so only the name rule can refuse.
    const lookupAll = async () => ['93.184.216.34'];
    for (const raw of [
      'http://localhost./x',
      'http://svc.railway.internal./x',
      'http://printer.local./x',
      'http://x.home.arpa./x',
    ]) {
      await expect(assertPublicHttpUrl(raw, { lookupAll }), raw).rejects.toThrow(
        /is not a public internet address/
      );
    }
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

interface Seen {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

/** A loopback server that records every request it receives, then answers per path. */
async function recorder(
  respond: (path: string) => { status: number; headers?: Record<string, string>; body?: string }
): Promise<{ base: string; seen: Seen[] }> {
  const seen: Seen[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      seen.push({
        method: req.method ?? '',
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      });
      const out = respond(req.url ?? '/');
      res.writeHead(out.status, out.headers ?? {});
      res.end(out.body ?? '');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  servers.push({
    base,
    hits: () => seen.length,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  });
  return { base, seen };
}

// Loopback is not public, so these tests say every address is fine; the redirect handling is what
// is under test, not the address check (covered above). Two ports are two origins.
const loopbackOk = { isAllowedAddress: () => true };

describe('fetchPublicHttp redirects and credentials', () => {
  const CREDS = { Authorization: 'Bearer X', Cookie: 'sid=1', 'X-Keep': 'yes' };

  it.each([
    ['an object', () => CREDS],
    ['a Headers', () => new Headers(CREDS)],
    ['array pairs', () => Object.entries(CREDS)],
  ])(
    'does not send Authorization or Cookie to another origin after a 302 (%s)',
    async (_name, make) => {
      const other = await recorder(() => ({ status: 200, body: 'ok' }));
      const first = await recorder(() => ({
        status: 302,
        headers: { location: `${other.base}/x` },
      }));
      const res = await fetchPublicHttp(
        `${first.base}/start`,
        { headers: make() as HeadersInit },
        loopbackOk
      );
      expect(res.status).toBe(200);
      expect(first.seen[0].headers.authorization).toBe('Bearer X');
      expect(first.seen[0].headers.cookie).toBe('sid=1');
      expect(other.seen).toHaveLength(1);
      expect(other.seen[0].headers.authorization).toBeUndefined();
      expect(other.seen[0].headers.cookie).toBeUndefined();
      expect(other.seen[0].headers['x-keep']).toBe('yes');
    }
  );

  it('drops Proxy-Authorization cross-origin, whatever the header case', async () => {
    const other = await recorder(() => ({ status: 200 }));
    const first = await recorder(() => ({ status: 302, headers: { location: `${other.base}/x` } }));
    await fetchPublicHttp(
      `${first.base}/start`,
      { headers: { 'PROXY-AUTHORIZATION': 'Basic abc', aUtHoRiZaTiOn: 'Bearer X' } },
      loopbackOk
    );
    expect(other.seen[0].headers['proxy-authorization']).toBeUndefined();
    expect(other.seen[0].headers.authorization).toBeUndefined();
  });

  it('keeps Authorization and Cookie across a same-origin 302', async () => {
    const one = await recorder((path) =>
      path === '/start' ? { status: 302, headers: { location: '/next' } } : { status: 200 }
    );
    await fetchPublicHttp(`${one.base}/start`, { headers: CREDS }, loopbackOk);
    expect(one.seen.map((r) => r.headers.authorization)).toEqual(['Bearer X', 'Bearer X']);
    expect(one.seen[1].headers.cookie).toBe('sid=1');
  });

  it('turns a POST with a body into a body-less GET after a 303', async () => {
    const other = await recorder(() => ({ status: 200 }));
    const first = await recorder(() => ({ status: 303, headers: { location: `${other.base}/x` } }));
    await fetchPublicHttp(
      `${first.base}/start`,
      { method: 'POST', body: '{"a":1}', headers: { ...CREDS, 'Content-Type': 'application/json' } },
      loopbackOk
    );
    expect(first.seen[0].method).toBe('POST');
    expect(first.seen[0].body).toBe('{"a":1}');
    expect(other.seen[0].method).toBe('GET');
    expect(other.seen[0].body).toBe('');
    expect(other.seen[0].headers['content-type']).toBeUndefined();
    expect(other.seen[0].headers['content-length']).toBeUndefined();
  });

  it('a same-origin 303 also becomes a body-less GET, credentials kept', async () => {
    const one = await recorder((path) =>
      path === '/start' ? { status: 303, headers: { location: '/next' } } : { status: 200 }
    );
    await fetchPublicHttp(
      `${one.base}/start`,
      { method: 'POST', body: 'x', headers: CREDS },
      loopbackOk
    );
    expect(one.seen[1].method).toBe('GET');
    expect(one.seen[1].body).toBe('');
    expect(one.seen[1].headers.authorization).toBe('Bearer X');
  });

  it('keeps POST and body across a cross-origin 307 but drops the credentials', async () => {
    const other = await recorder(() => ({ status: 200 }));
    const first = await recorder(() => ({ status: 307, headers: { location: `${other.base}/x` } }));
    await fetchPublicHttp(
      `${first.base}/start`,
      { method: 'POST', body: '{"a":1}', headers: { ...CREDS, 'Content-Type': 'application/json' } },
      loopbackOk
    );
    expect(other.seen[0].method).toBe('POST');
    expect(other.seen[0].body).toBe('{"a":1}');
    expect(other.seen[0].headers['content-type']).toBe('application/json');
    expect(other.seen[0].headers.authorization).toBeUndefined();
    expect(other.seen[0].headers.cookie).toBeUndefined();
  });

  it('keeps POST and body across a 308, and a 302 turns a POST into a GET', async () => {
    const other = await recorder(() => ({ status: 200 }));
    const f308 = await recorder(() => ({ status: 308, headers: { location: `${other.base}/x` } }));
    await fetchPublicHttp(`${f308.base}/s`, { method: 'POST', body: 'b' }, loopbackOk);
    expect(other.seen[0].method).toBe('POST');
    expect(other.seen[0].body).toBe('b');
    const f302 = await recorder(() => ({ status: 302, headers: { location: `${other.base}/y` } }));
    await fetchPublicHttp(`${f302.base}/s`, { method: 'POST', body: 'b' }, loopbackOk);
    expect(other.seen[1].method).toBe('GET');
    expect(other.seen[1].body).toBe('');
  });
});

describe('fetchPublicHttp connects only to an address it checked', () => {
  it('a name that answers public to the check and private to the connection (DNS rebinding) is refused before it connects', async () => {
    const server = await standIn(() => ({ status: 200, body: 'internal' }));
    const { port } = new URL(server.base);
    let lookups = 0;
    const lookupAll = async () => (++lookups === 1 ? ['93.184.216.34'] : ['127.0.0.1']);

    await expect(
      fetchPublicHttp(`http://rebind.example:${port}/secret`, {}, { lookupAll })
    ).rejects.toThrow(/is not a public internet address/);
    expect(lookups).toBe(2);
    expect(server.hits()).toBe(0);
  });

  it('hands back the status, headers and body of the address it connected to', async () => {
    const server = await standIn(() => ({
      status: 201,
      headers: { 'x-probe': 'yes' },
      body: 'hello',
    }));
    const { port } = new URL(server.base);

    const res = await fetchPublicHttp(
      `http://media.example:${port}/v.mp4`,
      {},
      { lookupAll: async () => ['127.0.0.1'], isAllowedAddress: () => true }
    );
    expect(server.hits()).toBe(1);
    expect(res.status).toBe(201);
    expect(res.headers.get('x-probe')).toBe('yes');
    expect(await res.text()).toBe('hello');
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
    // The first import of the handler graph is most of the time; 60s timed out on a loaded box.
  }, 120_000);

  it('refuses a file: URL for an ordinary caller', async () => {
    await expect(
      fetchVideoToTempFile('file:///etc/hostname', { trustedCaller: false })
    ).rejects.toThrow(/file: URL needs an operator caller/);
  });
});

describe('a call with no signing context is trusted only in the stdio process', () => {
  // A missing context is not proof of a local caller. On the hosted server a tool re-entered
  // from inside the server can arrive with none: a workflow step that is a batch did, because
  // the batch ran each child through the tool-health dispatcher, which passes no context.
  const READ_WRITE = {
    signedRequest: false,
    signingValid: true,
    signer: 'client',
    scopes: ['tools:read', 'tools:write'],
  };

  async function withTransport<T>(transport: string | undefined, run: () => Promise<T>) {
    const saved = process.env.HOLOSCRIPT_MCP_TRANSPORT;
    if (transport === undefined) delete process.env.HOLOSCRIPT_MCP_TRANSPORT;
    else process.env.HOLOSCRIPT_MCP_TRANSPORT = transport;
    try {
      return await run();
    } finally {
      if (saved === undefined) delete process.env.HOLOSCRIPT_MCP_TRANSPORT;
      else process.env.HOLOSCRIPT_MCP_TRANSPORT = saved;
    }
  }

  it('on the HTTP server, a tools:write caller cannot reach a non-public server through a workflow step that is a batch', async () => {
    const { _handleSingleToolLogic } = await import('../../index');
    const server = await standIn(() => ({ status: 200, body: 'not really a video' }));
    const args = { videoUrl: `${server.base}/v.mp4`, config: { ingestVideo: true } };
    const workflow = {
      name: 'probe',
      steps: [
        {
          id: 's1',
          skillId: 'batch_tool_call',
          inputs: { calls: [{ name: 'holo_reconstruct_from_video', args }] },
        },
      ],
    };

    await withTransport('http', () =>
      _handleSingleToolLogic('execute_workflow', workflow, READ_WRITE as never)
    );
    expect(server.hits()).toBe(0);
  }, 120_000);

  it('a context-less call fetches only when this process is the stdio server', async () => {
    const { handleTool } = await import('../../handlers');
    const server = await standIn(() => ({ status: 200, body: 'not really a video' }));
    const args = { videoUrl: `${server.base}/v.mp4`, config: { ingestVideo: true } };

    await withTransport('http', () => handleTool('holo_reconstruct_from_video', args));
    await withTransport(undefined, () => handleTool('holo_reconstruct_from_video', args));
    expect(server.hits()).toBe(0);

    await withTransport('stdio', () => handleTool('holo_reconstruct_from_video', args));
    expect(server.hits()).toBe(1);
  }, 120_000);
});
