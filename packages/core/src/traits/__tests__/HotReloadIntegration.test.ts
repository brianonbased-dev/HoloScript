/**
 * HotReloadIntegration.test.ts — Integration test with real file writes
 *
 * Tests the HotReloadWatcher with actual file system operations:
 * writes a temp .hs file, creates watcher, modifies file, verifies reload event.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { HotReloadWatcher } from '../HotReloadTrait';

describe('@hot_reload Integration', () => {
  const tmpDirs: string[] = [];

  function createTmpDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-hr-'));
    tmpDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tmpDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // best effort cleanup
      }
    }
    tmpDirs.length = 0;
  });

  it('detects .hs file write', async () => {
    const dir = createTmpDir();
    const filePath = path.join(dir, 'agent.hs');
    fs.writeFileSync(filePath, 'template "Agent" { @physics }');

    const watcher = new HotReloadWatcher({
      watchPaths: [dir],
      debounceMs: 50, // Fast for testing
      extensions: ['.hs', '.hsplus', '.holo'],
    });

    const reloadPromise = new Promise<{ filePath: string; type: string }>((resolve) => {
      watcher.on('reload', resolve);
    });

    watcher.start();
    expect(watcher.isRunning()).toBe(true);

    // Wait 100ms then modify the file
    await new Promise((r) => setTimeout(r, 100));
    fs.writeFileSync(filePath, 'template "Agent" { @physics @grabbable }');

    // Wait for debounced reload (50ms debounce + buffer)
    const event = await Promise.race([
      reloadPromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);

    watcher.stop();

    expect(event).not.toBeNull();
    if (event) {
      expect(event.filePath).toContain('agent.hs');
    }
    expect(watcher.getStats().running).toBe(false);
  });

  it('ignores non-HoloScript files', async () => {
    const dir = createTmpDir();
    const hsFile = path.join(dir, 'scene.hs');
    const txtFile = path.join(dir, 'readme.txt');
    fs.writeFileSync(hsFile, 'template "A" {}');
    fs.writeFileSync(txtFile, 'some docs');

    const watcher = new HotReloadWatcher({
      watchPaths: [dir],
      debounceMs: 50,
      extensions: ['.hs', '.hsplus', '.holo'],
    });

    const events: string[] = [];
    watcher.on('reload', (e: { filePath: string }) => events.push(e.filePath));

    watcher.start();

    // Modify the .txt file — should NOT trigger
    await new Promise((r) => setTimeout(r, 100));
    fs.writeFileSync(txtFile, 'updated docs');

    // Wait for any debounced event
    await new Promise((r) => setTimeout(r, 200));

    watcher.stop();

    // Should have 0 events (txt file not watched)
    const hsEvents = events.filter((p) => p.endsWith('.hs') || p.endsWith('.hsplus') || p.endsWith('.holo'));
    // txt modifications should not appear
    expect(events.filter((p) => p.endsWith('.txt'))).toHaveLength(0);
  });

  it('counts reloads correctly', async () => {
    const dir = createTmpDir();
    const filePath = path.join(dir, 'counter.hs');
    fs.writeFileSync(filePath, 'template "V1" {}');

    const watcher = new HotReloadWatcher({
      watchPaths: [dir],
      debounceMs: 30,
      extensions: ['.hs'],
    });

    let reloadCount = 0;
    watcher.on('reload', () => reloadCount++);

    watcher.start();
    expect(watcher.getStats().reloadCount).toBe(0);

    // Write twice with delay between
    await new Promise((r) => setTimeout(r, 100));
    fs.writeFileSync(filePath, 'template "V2" {}');
    await new Promise((r) => setTimeout(r, 200));
    fs.writeFileSync(filePath, 'template "V3" {}');
    await new Promise((r) => setTimeout(r, 200));

    watcher.stop();

    // Should have detected at least 1 reload
    expect(watcher.getStats().reloadCount).toBeGreaterThanOrEqual(1);
  });

  it('emits started and stopped events with metadata', async () => {
    const dir = createTmpDir();
    fs.writeFileSync(path.join(dir, 'test.hs'), 'template "T" {}');

    const watcher = new HotReloadWatcher({
      watchPaths: [dir],
      debounceMs: 50,
    });

    const startedData: any[] = [];
    const stoppedData: any[] = [];
    watcher.on('started', (d: any) => startedData.push(d));
    watcher.on('stopped', (d: any) => stoppedData.push(d));

    watcher.start();
    watcher.stop();

    expect(startedData).toHaveLength(1);
    expect(startedData[0].paths).toBeDefined();
    expect(stoppedData).toHaveLength(1);
    expect(stoppedData[0].reloadCount).toBeDefined();
  });
});
