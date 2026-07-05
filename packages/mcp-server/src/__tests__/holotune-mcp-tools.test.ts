import { describe, expect, it } from 'vitest';
import { tools } from '../tools';
import {
  handleHoloTuneTool,
  holotuneToolDefinitions,
  isHoloTuneToolName,
} from '../holotune-mcp-tools';

const TOOL_NAMES = [
  'holotune_status',
  'holotune_curate',
  'holotune_launch',
  'holotune_eval',
  'holotune_promote',
  'holotune_serve',
  'holotune_download',
];

describe('holotune MCP tools', () => {
  it('exports the seven Phase 3 tool definitions and registers them in tools.ts', () => {
    expect(holotuneToolDefinitions.map((tool) => tool.name)).toEqual(TOOL_NAMES);
    for (const name of TOOL_NAMES) {
      expect(isHoloTuneToolName(name)).toBe(true);
      expect(tools.some((tool) => tool.name === name)).toBe(true);
    }
  });

  it('reports the safe operation surface', async () => {
    const result = (await handleHoloTuneTool('holotune_status', {
      identity: 'agent-a',
    })) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(result.mcpTools).toEqual(TOOL_NAMES);
    expect((result.governance as Record<string, unknown>).gpuSpendRequiresFounderGate).toBe(true);
  });

  it('curates inline traces into SFT rows and hashes the corpus', async () => {
    const result = (await handleHoloTuneTool('holotune_curate', {
      identity: 'agent-a',
      includeJsonl: true,
      traceRows: [
        { system: 'S', user: 'u1', target: 't1' },
        { user: 'missing target' },
      ],
    })) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(result.curatedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(result.corpusHash).toMatch(/^sha256:/);
    expect(result.jsonl).toContain('"target":"t1"');
  });

  it('keeps GPU launch dry-run by default and blocks non-dry launch without founder gate', async () => {
    const preview = (await handleHoloTuneTool('holotune_launch', {
      identity: 'agent-a',
      corpusHash: 'sha256:abc',
    })) as Record<string, unknown>;
    expect(preview.ok).toBe(true);
    expect(preview.dryRun).toBe(true);
    expect(preview.spendIntent).toBe(false);

    const blocked = (await handleHoloTuneTool('holotune_launch', {
      identity: 'agent-a',
      corpusHash: 'sha256:abc',
      apply: true,
    })) as Record<string, unknown>;
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toBe('founder-gate-required');
  });

  it('allows non-dry launch with a valid founder-gate receipt summary', async () => {
    const result = (await handleHoloTuneTool('holotune_launch', {
      identity: 'agent-a',
      corpusHash: 'sha256:abc',
      dryRun: false,
      founderGate: { manifestHash: 'sha256:gate', approved: true, reviewer: 'grok1' },
    })) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(result.spendIntent).toBe(true);
    expect((result.receipt as Record<string, unknown>).receiptHash).toMatch(/^sha256:/);
  });

  it('evaluates tuned metrics against a baseline', async () => {
    const result = (await handleHoloTuneTool('holotune_eval', {
      identity: 'agent-a',
      baselineMetrics: { pass_rate: 0.5, latency: 1 },
      tunedMetrics: { pass_rate: 0.6, latency: 1.1 },
      requiredBenchmarks: ['pass_rate'],
      minImproved: 1,
      improvementThreshold: 0.05,
    })) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.improvedCount).toBe(1);
  });

  it('blocks non-dry promote without founder gate and returns rollback metadata when gated', async () => {
    const blocked = (await handleHoloTuneTool('holotune_promote', {
      identity: 'agent-a',
      adapterUri: 'file:///adapter',
      apply: true,
    })) as Record<string, unknown>;
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toBe('founder-gate-required');

    const promoted = (await handleHoloTuneTool('holotune_promote', {
      identity: 'agent-a',
      version: 'v2',
      previousVersion: 'v1',
      adapterUri: 'file:///adapter',
      ggufUri: 'file:///model.gguf',
      dryRun: false,
      founderGate: { manifestHash: 'sha256:gate', approved: true },
    })) as Record<string, unknown>;
    expect(promoted.ok).toBe(true);
    expect(promoted.version).toBe('v2');
    expect(promoted.rollbackPointer).toBe('v1');
    expect(promoted.downloadable).toBe(true);
  });

  it('builds serve and download plans without claiming missing GGUF files exist', async () => {
    const serve = (await handleHoloTuneTool('holotune_serve', {
      identity: 'agent-a',
      adapterUri: 'file:///adapter',
    })) as Record<string, unknown>;
    expect(serve.ok).toBe(true);
    expect(serve.serveReady).toBe(true);

    const missing = (await handleHoloTuneTool('holotune_download', {
      identity: 'agent-a',
    })) as Record<string, unknown>;
    expect(missing.ok).toBe(false);
    expect(missing.error).toBe('gguf-artifact-required');

    const download = (await handleHoloTuneTool('holotune_download', {
      identity: 'agent-a',
      version: 'v2',
      ggufUri: 'file:///model.gguf',
    })) as Record<string, unknown>;
    expect(download.ok).toBe(true);
    expect((download.manifest as Record<string, unknown>).manifestHash).toMatch(/^sha256:/);
  });

  it('emits a native @llama_serve spec + authorable block when a GGUF is present', async () => {
    const serve = (await handleHoloTuneTool('holotune_serve', {
      identity: 'brittney-edge',
      version: 'v0-8',
      ggufUri: 'file:///models/brittney-edge-v0-8.gguf',
      loraGgufUri: 'file:///adapters/brittney-edge_v0-8/adapter.gguf',
    })) as Record<string, unknown>;
    expect(serve.ok).toBe(true);

    const spec = serve.llamaServe as Record<string, unknown>;
    expect(spec.schema).toBe('holotune.llama-serve.v1');
    expect(spec.gguf).toBe('file:///models/brittney-edge-v0-8.gguf');
    expect(spec.lora).toBe('file:///adapters/brittney-edge_v0-8/adapter.gguf');
    expect(spec.handle).toBe('brittney-edge-v0-8');

    const snippet = serve.llamaServeHsplus as string;
    expect(snippet).toContain('@llama_serve {');
    expect(snippet).toContain('grammar: "holoscript"'); // wires the GBNF constrained-decode preset
    expect(snippet).toContain('lora: "file:///adapters/brittney-edge_v0-8/adapter.gguf"');
  });

  it('keeps a PEFT adapter directory OUT of the @llama_serve.lora slot (back-compat)', async () => {
    const serve = (await handleHoloTuneTool('holotune_serve', {
      identity: 'agent-a',
      adapterUri: 'file:///adapter', // a PEFT dir, not a .gguf
    })) as Record<string, unknown>;
    expect(serve.serveReady).toBe(true); // unchanged legacy behavior
    expect(serve.llamaServe).toBeNull(); // no real gguf/lora → no native spec fabricated
  });

  it('escapes quotes in @llama_serve snippet values so the block stays parseable', async () => {
    const serve = (await handleHoloTuneTool('holotune_serve', {
      identity: 'agent-a',
      version: 'v1',
      ggufUri: 'file:///m"odel.gguf', // stray quote in the URI
    })) as Record<string, unknown>;
    const snippet = serve.llamaServeHsplus as string;
    expect(snippet).toContain('gguf: "file:///m\\"odel.gguf"'); // quote escaped, string not terminated early
    expect(snippet).not.toContain('gguf: "file:///m"odel.gguf"');
  });
});
