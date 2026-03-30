/**
 * DevServer tests — v5.9 "Developer Portal"
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DevServer } from '../serve';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('DevServer', () => {
  let tempDir: string;
  let server: DevServer;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'holoscript-dev-'));
    server = new DevServer({ root: tempDir, port: 0, watch: false });
  });

  afterEach(async () => {
    if (server.isRunning()) {
      await server.stop();
    }
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures on Windows
    }
  });

  // ===========================================================================
  // BASIC LIFECYCLE
  // ===========================================================================

  describe('lifecycle', () => {
    it('starts and stops', async () => {
      await server.start();
      expect(server.isRunning()).toBe(true);

      await server.stop();
      expect(server.isRunning()).toBe(false);
    });

    it('emits started event', async () => {
      let emitted = false;
      server.on('started', () => {
        emitted = true;
      });

      await server.start();
      expect(emitted).toBe(true);
    });
  });

  // ===========================================================================
  // FILE SCANNING
  // ===========================================================================

  describe('file scanning', () => {
    it('discovers .holo files', async () => {
      writeFileSync(join(tempDir, 'scene.holo'), '@world { name: "Test" }');
      writeFileSync(join(tempDir, 'app.hs'), 'object Cube {}');
      writeFileSync(join(tempDir, 'readme.md'), '# Readme');

      await server.start();
      const stats = server.getStats();

      expect(stats.filesWatched).toBe(2); // .holo + .hs
    });

    it('scans subdirectories', async () => {
      mkdirSync(join(tempDir, 'scenes'));
      writeFileSync(join(tempDir, 'scenes', 'main.holo'), '@world {}');

      await server.start();
      expect(server.getStats().filesWatched).toBe(1);
    });

    it('skips node_modules and hidden dirs', async () => {
      mkdirSync(join(tempDir, 'node_modules'));
      writeFileSync(join(tempDir, 'node_modules', 'dep.holo'), 'ignored');
      mkdirSync(join(tempDir, '.git'));
      writeFileSync(join(tempDir, '.git', 'hidden.holo'), 'ignored');

      await server.start();
      expect(server.getStats().filesWatched).toBe(0);
    });
  });

  // ===========================================================================
  // COMPOSITION PARSING
  // ===========================================================================

  describe('compositions', () => {
    it('parses found files into compositions', async () => {
      writeFileSync(join(tempDir, 'test.holo'), 'object Sphere { radius: 1 }');

      await server.start();
      const comps = server.getCompositions();
      expect(comps.size).toBe(1);
    });

    it('returns composition by relative path', async () => {
      writeFileSync(join(tempDir, 'world.holo'), '@world { name: "My World" }');

      await server.start();
      const comp = server.getComposition('world.holo');
      expect(comp).toBeDefined();
      expect(comp!.raw).toContain('My World');
    });

    it('uses custom parser when provided', async () => {
      writeFileSync(join(tempDir, 'custom.holo'), 'custom code');

      const customServer = new DevServer({
        root: tempDir,
        port: 0,
        watch: false,
        parser: (code) => ({
          success: true,
          ast: { parsed: true, length: code.length },
        }),
      });

      await customServer.start();
      const comp = customServer.getComposition('custom.holo');
      expect(comp!.ast).toEqual({ parsed: true, length: 11 });
      await customServer.stop();
    });
  });

  // ===========================================================================
  // STATS
  // ===========================================================================

  describe('stats', () => {
    it('returns comprehensive stats', async () => {
      writeFileSync(join(tempDir, 'a.holo'), 'object A {}');
      writeFileSync(join(tempDir, 'b.holo'), 'object B {}');

      await server.start();
      const stats = server.getStats();

      expect(stats.root).toBe(tempDir);
      expect(stats.watching).toBe(false);
      expect(stats.filesWatched).toBe(2);
      expect(stats.connectedClients).toBe(0);
      expect(stats.totalUpdates).toBe(0);
      expect(stats.totalErrors).toBe(0);
      expect(stats.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  // ===========================================================================
  // HTTP ENDPOINTS
  // ===========================================================================

  describe('HTTP endpoints', () => {
    it('serves stats API', async () => {
      await server.start();
      const { port } = server.getStats();

      const res = await fetch(`http://localhost:${port}/__api/stats`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.root).toBe(tempDir);
    });

    it('serves compositions API', async () => {
      writeFileSync(join(tempDir, 'scene.holo'), 'object Test {}');

      await server.start();
      const { port } = server.getStats();

      const res = await fetch(`http://localhost:${port}/__api/compositions`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Object.keys(data)).toHaveLength(1);
    });

    it('serves overlay page', async () => {
      await server.start();
      const { port } = server.getStats();

      const res = await fetch(`http://localhost:${port}/`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('HoloScript Dev Server');
    });

    it('serves dashboard page', async () => {
      await server.start();
      const { port } = server.getStats();

      const res = await fetch(`http://localhost:${port}/dashboard`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('Developer Dashboard');
    });

    it('returns 404 for unknown paths', async () => {
      await server.start();
      const { port } = server.getStats();

      const res = await fetch(`http://localhost:${port}/nonexistent`);
      expect(res.status).toBe(404);
    });
  });

  // ===========================================================================
  // SSE (Server-Sent Events)
  // ===========================================================================

  describe('SSE', () => {
    it('accepts SSE connections', async () => {
      await server.start();
      const { port } = server.getStats();

      const res = await fetch(`http://localhost:${port}/__hmr`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/event-stream');
      // Read first event
      const reader = res.body!.getReader();
      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);
      expect(text).toContain('full-reload');
      reader.cancel();
    });
  });
});
