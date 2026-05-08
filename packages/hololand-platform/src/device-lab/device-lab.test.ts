import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  detectWasmSimd,
  parseQuestProbeMarkdown,
  runDeviceLabProbe,
  writeDeviceLabReceipt,
  type CommandRunner,
} from './index';

const FIXED_NOW = '2026-05-07T22:30:00.000Z';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'hololand-device-lab-'));
}

function makePassingRunner(): CommandRunner {
  return (command) => {
    if (command === 'powershell.exe') {
      return {
        status: 0,
        stdout: JSON.stringify({
          Name: 'NVIDIA GeForce RTX Test',
          DriverVersion: '1.2.3',
          AdapterRAM: 8 * 1024 * 1024 * 1024,
        }),
        stderr: '',
      };
    }

    return {
      status: 0,
      stdout: JSON.stringify({
        ok: true,
        page: {
          hasNavigatorGpu: true,
          smoke: { expected: 42, actual: 42 },
        },
      }),
      stderr: '',
    };
  };
}

function makeQuestReport(dir: string, status: 'OK' | 'WARN' | 'FAIL' = 'OK'): string {
  const file = join(dir, 'observations.md');
  writeFileSync(
    file,
    [
      '# Quest 3 Probe — observations',
      '',
      '| # | Capability | Status | Notes |',
      '|---|---|---|---|',
      `| 1 | WebXR immersive-vr | ${status} | supported |`,
      '| 2 | WASM + SAB | OK | constructor=true |',
      '',
    ].join('\n'),
    'utf8'
  );
  return file;
}

describe('HoloLand device-lab', () => {
  it('probes WASM SIMD with a concrete validation module', () => {
    const check = detectWasmSimd();
    expect(check.id).toBe('wasm-simd');
    expect(['pass', 'fail']).toContain(check.status);
    expect(check.evidence).toHaveProperty('nodeVersion');
  });

  it('parses QuestProbe markdown rows exported by Studio', () => {
    const rows = parseQuestProbeMarkdown(
      [
        '| # | Capability | Status | Notes |',
        '|---|---|---|---|',
        '| 1 | WebXR immersive-vr | OK | supported |',
        '| 2 | Passthrough | WARN | not available |',
      ].join('\n')
    );

    expect(rows).toEqual([
      { capability: 'WebXR immersive-vr', status: 'OK', notes: 'supported' },
      { capability: 'Passthrough', status: 'WARN', notes: 'not available' },
    ]);
  });

  it('builds a passing receipt with WebGPU, headset, and replay evidence', () => {
    const dir = makeTempDir();
    const headsetReport = makeQuestReport(dir);
    const replay = join(dir, 'replay.json');
    writeFileSync(replay, JSON.stringify({ frame: 1 }), 'utf8');

    const receipt = runDeviceLabProbe({
      cwd: dir,
      now: FIXED_NOW,
      taskId: 'task_1778188462361_2597',
      headsetReportPath: headsetReport,
      replayPath: replay,
      webgpuProbeCommand: { command: 'node', args: ['probe-webgpu.mjs'] },
      commandRunner: makePassingRunner(),
    });

    expect(receipt.schemaVersion).toBe('hololand-device-lab-receipt/v1');
    expect(receipt.receiptId).toMatch(/^hldev_[a-f0-9]{16}$/);
    expect(receipt.overallStatus).toBe('pass');
    expect(receipt.artifacts.map((a) => a.kind)).toEqual(['headset-report', 'replay']);
    expect(receipt.gotchas).toEqual([]);
  });

  it('emits gotchas when WebGPU/headset/replay evidence is missing or failing', () => {
    const failingRunner: CommandRunner = (command) => {
      if (command === 'powershell.exe') {
        return { status: 1, stdout: '', stderr: 'gpu inventory unavailable' };
      }
      return {
        status: 1,
        stdout: JSON.stringify({ ok: false, reason: 'requestAdapter returned null' }),
        stderr: '',
      };
    };

    const receipt = runDeviceLabProbe({
      cwd: makeTempDir(),
      now: FIXED_NOW,
      webgpuProbeCommand: { command: 'node', args: ['probe-webgpu.mjs'] },
      commandRunner: failingRunner,
    });

    expect(receipt.overallStatus).toBe('fail');
    expect(receipt.gotchas.map((g) => g.id)).toContain('G.HW.WEBGPU_BROWSER');
    expect(receipt.gotchas.map((g) => g.id)).toContain('G.HW.HEADSET_REPORT');
    expect(receipt.gotchas.map((g) => g.id)).toContain('G.HW.REPLAY_RECEIPT');
  });

  it('writes the receipt JSON to an explicit output path', () => {
    const dir = makeTempDir();
    const receipt = runDeviceLabProbe({
      cwd: dir,
      now: FIXED_NOW,
      skipWebGpu: true,
      commandRunner: makePassingRunner(),
    });
    const out = join(dir, 'receipt.json');

    writeDeviceLabReceipt(receipt, out);

    const parsed = JSON.parse(readFileSync(out, 'utf8')) as { receiptId: string };
    expect(parsed.receiptId).toBe(receipt.receiptId);
  });
});
