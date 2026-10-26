/**
 * Regression: stray ; or , between environment settings used to hang
 * HoloScriptCodeParser forever (plan hs-parser-hangs-plan-20261026, cause C1).
 *
 * Each snippet is parsed in a fresh worker thread that is killed after 2 s,
 * so a regression fails this test instead of hanging the run.
 */
import { describe, it, expect } from 'vitest';
import { Worker } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const parserPath = resolve(here, '../HoloScriptCodeParser.ts');
const tsxApi = createRequire(import.meta.url).resolve('tsx/esm/api');

type Outcome =
  | { kind: 'done'; success: boolean; errors: { line: number; message: string; suggestion?: string }[] }
  | { kind: 'timeout' }
  | { kind: 'error'; message: string };

function parseInWorker(src: string, timeoutMs = 2000): Promise<Outcome> {
  const code = `
    const { parentPort, workerData } = require('node:worker_threads');
    import(require('node:url').pathToFileURL(workerData.tsxApi).href).then((api) => api.tsImport(require('node:url').pathToFileURL(workerData.parserPath).href, require('node:url').pathToFileURL(workerData.parserPath).href)).then((m) => {
      parentPort.postMessage({ ready: true });
      const r = new m.HoloScriptCodeParser().parse(workerData.src);
      parentPort.postMessage({ success: r.success, errors: (r.errors || []).map((e) => ({ line: e.line, message: e.message, suggestion: e.suggestion })) });
    }, (e) => parentPort.postMessage({ crash: String(e && e.stack || e) }));
  `;
  return new Promise((res) => {
    const w = new Worker(code, { eval: true, workerData: { src, parserPath, tsxApi } });
    // The 2 s budget covers the parse only, not loading the parser source,
    // so a busy machine does not turn module load time into a false timeout.
    let t: ReturnType<typeof setTimeout> | undefined;
    const loadGuard = setTimeout(() => {
      void w.terminate();
      res({ kind: 'error', message: 'parser did not load within 60 s' });
    }, 60000);
    w.on('message', (m) => {
      if (m.ready) {
        clearTimeout(loadGuard);
        t = setTimeout(() => {
          void w.terminate();
          res({ kind: 'timeout' });
        }, timeoutMs);
        return;
      }
      clearTimeout(loadGuard);
      clearTimeout(t);
      void w.terminate();
      res(m.crash ? { kind: 'error', message: m.crash } : { kind: 'done', ...m });
    });
    w.once('error', (e) => {
      clearTimeout(t);
      clearTimeout(loadGuard);
      res({ kind: 'error', message: String(e) });
    });
  });
}

const SNIPPETS = [
  'environment { skybox: "gradient";',
  'environment { skybox: "gradient"; }',
  'environment { a: 1, b: 2 }',
  'environment { skybox: { type: "gradient", top: "#000000" };',
];

describe('HoloScriptCodeParser: environment separators do not hang', () => {
  for (const src of SNIPPETS) {
    it(`returns within 2 s: ${src}`, { timeout: 90000 }, async () => {
      const out = await parseInWorker(src);
      expect(out.kind, JSON.stringify(out)).toBe('done');
      if (out.kind !== 'done') return;
      const sepErr = out.errors.find((e) => /remove the "[;,]" here/.test(e.message));
      expect(sepErr, JSON.stringify(out.errors)).toBeDefined();
      expect(sepErr!.message).toMatch(/^Line 1: /);
    });
  }

  it('keeps reading settings after the stray separator', { timeout: 90000 }, async () => {
    const out = await parseInWorker('environment {\n  a: 1;\n  b: 2\n}');
    expect(out.kind).toBe('done');
    if (out.kind !== 'done') return;
    expect(out.errors.map((e) => e.message)).toEqual([
      'Line 2: remove the ";" here. Settings inside environment { } do not need a ; or , between them. Put each setting on its own line.',
    ]);
    expect(out.errors[0].suggestion).toBe('Delete the ";" on line 2.');
  });

  it('still parses an environment with no separators cleanly', { timeout: 90000 }, async () => {
    const out = await parseInWorker('environment { skybox: "gradient" }');
    expect(out).toMatchObject({ kind: 'done', errors: [] });
  });
});
