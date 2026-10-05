import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ENDPOINTS } from '@holoscript/config';
import { countCompilerFiles, countTraitCategoryFiles, handleAuditNumbers } from '../audit-tools';

describe('audit-tools native metric collectors', () => {
  let root: string | undefined;

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
      root = undefined;
    }
  });

  function workspace(): string {
    root = mkdtempSync(join(tmpdir(), 'hs-audit-tools-'));
    return root;
  }

  it('counts compiler implementation files without shell commands', () => {
    const repo = workspace();
    const compilerDir = join(repo, 'packages', 'core', 'src', 'compiler');
    mkdirSync(compilerDir, { recursive: true });
    writeFileSync(join(compilerDir, 'UnityCompiler.ts'), 'export {};\n');
    writeFileSync(join(compilerDir, 'VisionOSCompiler.ts'), 'export {};\n');
    writeFileSync(join(compilerDir, 'CompilerBase.ts'), 'export {};\n');
    writeFileSync(join(compilerDir, 'UnityCompiler.test.ts'), 'export {};\n');
    writeFileSync(join(compilerDir, 'NotACompiler.tsx'), 'export {};\n');

    expect(countCompilerFiles(repo)).toBe('2');
  });

  it('counts trait category files without shell commands', () => {
    const repo = workspace();
    const constantsDir = join(repo, 'packages', 'core', 'src', 'traits', 'constants');
    mkdirSync(constantsDir, { recursive: true });
    writeFileSync(join(constantsDir, 'rendering.ts'), 'export {};\n');
    writeFileSync(join(constantsDir, 'physics.ts'), 'export {};\n');
    writeFileSync(join(constantsDir, 'index.d.ts'), 'export {};\n');
    mkdirSync(join(constantsDir, 'nested'), { recursive: true });
    writeFileSync(join(constantsDir, 'nested', 'ignored.ts'), 'export {};\n');

    expect(countTraitCategoryFiles(repo)).toBe('2');
  });
});

describe('audit-tools knowledge entry count', () => {
  const saved = process.env.MCP_ORCHESTRATOR_URL;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (saved === undefined) delete process.env.MCP_ORCHESTRATOR_URL;
    else process.env.MCP_ORCHESTRATOR_URL = saved;
  });

  // Answers every request with a health body carrying the count; nothing leaves the process.
  function stubHealth(count: number) {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: 'ok', knowledge_entries: count }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  async function knowledgeLive(): Promise<unknown> {
    const report = (await handleAuditNumbers({})) as {
      metrics: Array<{ metric: string; live: string }>;
    };
    return report.metrics.find((m) => m.metric === 'Knowledge entries')?.live;
  }

  it('asks the orchestrator named by MCP_ORCHESTRATOR_URL, not production', async () => {
    process.env.MCP_ORCHESTRATOR_URL = 'https://orchestrator.audit-test.example';
    const fetchMock = stubHealth(4242);

    expect(await knowledgeLive()).toBe('4242');
    const asked = fetchMock.mock.calls.map((call) => String((call as unknown[])[0]));
    expect(asked).toEqual(['https://orchestrator.audit-test.example/health']);
  });

  it('falls back to the shared @holoscript/config address when MCP_ORCHESTRATOR_URL is unset', async () => {
    delete process.env.MCP_ORCHESTRATOR_URL;
    const fetchMock = stubHealth(17);

    expect(await knowledgeLive()).toBe('17');
    const asked = fetchMock.mock.calls.map((call) => String((call as unknown[])[0]));
    expect(asked).toEqual([`${ENDPOINTS.MCP_ORCHESTRATOR}/health`]);
    expect(asked[0]).not.toContain('audit-test.example');
  });
});
