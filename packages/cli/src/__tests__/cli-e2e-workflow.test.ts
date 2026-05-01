import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseArgs } from '../args';
import { HoloScriptCLI } from '../HoloScriptCLI';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

vi.mock('@holoscript/llm-provider', () => ({
  createProviderManager: vi.fn(() => ({
    getRegisteredProviders: () => ['mock'],
    getProvider: () => ({
      generateHoloScript: vi.fn(async () => ({
        code: 'composition "Test" { object "Cube" { geometry: "cube" } }',
        provider: 'mock',
        detectedTraits: [],
      })),
    }),
  })),
}));

afterEach(() => {
  vi.clearAllMocks();
});

async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-e2e-'));
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const SAMPLE_HOLO = `composition "Demo" {
  object "Cube" {
    geometry: "cube"
    color: "#ff0000"
  }
}`;

describe('CLI E2E Workflow', () => {
  it('version command returns 0', async () => {
    const opts = parseArgs(['version']);
    const cli = new HoloScriptCLI(opts);
    const exitCode = await cli.run();
    expect(exitCode).toBe(0);
  });

  it('help command returns 0', async () => {
    const opts = parseArgs(['help']);
    const cli = new HoloScriptCLI(opts);
    const exitCode = await cli.run();
    expect(exitCode).toBe(0);
  });

  it('parse command succeeds for valid .holo file', async () => {
    await withTempDir(async (dir) => {
      const file = path.join(dir, 'scene.holo');
      await fs.writeFile(file, SAMPLE_HOLO);
      const opts = parseArgs(['parse', file]);
      const cli = new HoloScriptCLI(opts);
      const exitCode = await cli.run();
      expect(exitCode).toBe(0);
    });
  });

  it('ast command returns structured output for valid file', async () => {
    await withTempDir(async (dir) => {
      const file = path.join(dir, 'scene.holo');
      await fs.writeFile(file, SAMPLE_HOLO);
      const opts = parseArgs(['ast', file, '--json']);
      const cli = new HoloScriptCLI(opts);
      const exitCode = await cli.run();
      expect(exitCode).toBe(0);
    });
  });

  it('validate command succeeds for valid code', async () => {
    await withTempDir(async (dir) => {
      const file = path.join(dir, 'scene.holo');
      await fs.writeFile(file, SAMPLE_HOLO);
      const opts = parseArgs(['validate', file]);
      const cli = new HoloScriptCLI(opts);
      const exitCode = await cli.run();
      expect(exitCode).toBe(0);
    });
  });

  it('templates command lists available templates', async () => {
    const opts = parseArgs(['templates']);
    const cli = new HoloScriptCLI(opts);
    const exitCode = await cli.run();
    expect(exitCode).toBe(0);
  });

  it('traits command lists traits', async () => {
    const opts = parseArgs(['traits']);
    const cli = new HoloScriptCLI(opts);
    const exitCode = await cli.run();
    expect(exitCode).toBe(0);
  });

  it('suggest command suggests traits for description', async () => {
    const opts = parseArgs([
      'suggest',
      'a multiplayer game with physics',
    ]);
    const cli = new HoloScriptCLI(opts);
    const exitCode = await cli.run();
    expect(exitCode).toBe(0);
  });

  it('full pipeline: write → parse → validate', async () => {
    await withTempDir(async (dir) => {
      const file = path.join(dir, 'pipeline.holo');
      await fs.writeFile(file, SAMPLE_HOLO);

      // 1. Parse
      const parseOpts = parseArgs(['parse', file]);
      const parseCli = new HoloScriptCLI(parseOpts);
      const parseExit = await parseCli.run();
      expect(parseExit).toBe(0);

      // 2. Validate
      const valOpts = parseArgs(['validate', file]);
      const valCli = new HoloScriptCLI(valOpts);
      const valExit = await valCli.run();
      expect(valExit).toBe(0);

      // 3. AST export
      const astOpts = parseArgs(['ast', file, '--json']);
      const astCli = new HoloScriptCLI(astOpts);
      const astExit = await astCli.run();
      expect(astExit).toBe(0);
    });
  });
});
