/**
 * Real, unmocked proof that the 'observe' operation captures live DOM/console/network
 * activity via CDP — not just that it doesn't crash against a mock (browser-pool.test.ts
 * covers the graceful-degradation path when playwright is mocked and page.context() is
 * unavailable). This file deliberately does NOT `vi.mock('playwright', ...)`: it launches a
 * genuine Chromium session against a genuine local HTTP server and asserts on genuine
 * console.log output and a genuine subresource fetch, matching the P0 gap-matrix's actual
 * ask ("CDP/BiDi-backed read-only observation adapter ... DOM/console/network observation").
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { browserPool } from '../browser/BrowserPool';
import { browserSession } from '../browser/browser-tools';

describe('browser_session observe (real CDP)', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/ping') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ pong: true }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!doctype html>
<html><body>
  <h1>observe-fixture</h1>
  <p>fixture body text for dom observation</p>
  <script>
    console.log('holo-observe-console-marker');
    fetch('/ping').then(function(r) { return r.json(); });
  </script>
</body></html>`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await browserPool.destroyAll();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('captures real console output, a real network request, and real DOM text over CDP', async () => {
    const opened = await browserSession({
      operation: 'open',
      ownerId: 'agent-observe-test',
      url: `${baseUrl}/`,
      width: 800,
      height: 600,
      headless: true,
      leaseTtlMs: 60_000,
    });
    expect(opened.success).toBe(true);
    if (!('leaseToken' in opened)) throw new Error('open did not return a lease');
    const { sessionId } = opened.session;
    const { leaseToken } = opened;

    try {
      // Give the page's inline script (console.log + fetch) time to run before observing.
      await new Promise((resolve) => setTimeout(resolve, 500));

      const observed = await browserSession({
        operation: 'observe',
        sessionId,
        leaseToken,
        includeDom: true,
        includeConsole: true,
        includeNetwork: true,
        consoleLimit: 50,
        networkLimit: 50,
        domTextLimit: 4000,
      });

      expect(observed).toMatchObject({ success: true, operation: 'observe', permissionEnvelope: 'read_only' });
      expect(observed.receipt.details).toMatchObject({ cdpAttached: true, mutatesPage: false });

      // DOM: real page content, not a placeholder.
      expect(observed.dom?.title).toBe('');
      expect(observed.dom?.bodyText).toContain('fixture body text for dom observation');
      expect(observed.dom?.elementCount).toBeGreaterThan(0);

      // Console: the real console.log call from the page's own script, captured via CDP's
      // Runtime.consoleAPICalled — not injected or synthesized by the test.
      const consoleEntries = observed.console ?? [];
      expect(consoleEntries.some((entry) => entry.text.includes('holo-observe-console-marker'))).toBe(true);
      expect(consoleEntries.every((entry) => typeof entry.timestamp === 'string' && entry.timestamp.length > 0)).toBe(true);

      // Network: the real subresource fetch('/ping') the page issued, captured via CDP's
      // Network domain — proves this observes network traffic, not just JS console output.
      const networkEntries = observed.network ?? [];
      const pingRequest = networkEntries.find((entry) => entry.url.endsWith('/ping'));
      expect(pingRequest).toBeDefined();
      expect(pingRequest?.status).toBe(200);
      expect(pingRequest?.failed).not.toBe(true);

      // Never mutates: no click/type/fill/navigate call exists on this code path at all.
      expect(observed.session.url).toBe(`${baseUrl}/`);
    } finally {
      await browserSession({ operation: 'close', sessionId, leaseToken });
    }
  }, 20_000);
});
