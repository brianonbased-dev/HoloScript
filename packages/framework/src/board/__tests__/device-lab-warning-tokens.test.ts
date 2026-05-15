/**
 * Device Lab Warning Tokens — Unit Tests
 *
 * Validates warning token derivation from device-lab receipts.
 * Task: task_1778739828973_47f5
 */

import { describe, it, expect } from 'vitest';
import {
  deriveWarningTokens,
  getWarningColorClass,
  getWarningIcon,
  formatWarningForHoloShell,
  summarizeWarningTokens,
  type DeviceLabReceipt,
} from '../device-lab-warning-tokens';

function makeMinimalReceipt(
  overrides: Partial<DeviceLabReceipt> = {}
): DeviceLabReceipt {
  return {
    receiptId: 'hldev_test',
    schemaVersion: 'hololand-device-lab-receipt/v1',
    createdAt: '2026-05-14T06:00:00Z',
    generatedBy: '@holoscript/hololand-platform/device-lab',
    command: 'hololand-device-lab',
    host: {
      platform: 'win32',
      release: '10.0.26200',
      arch: 'x64',
      nodeVersion: 'v24.15.0',
      v8Version: '13.6.233.17-node.48',
      cpuModel: 'Test CPU',
      logicalCores: 8,
      totalMemoryGB: 16,
      freeMemoryGB: 8,
      gpuControllers: [],
      env: { ci: false },
    },
    checks: [],
    artifacts: [],
    gotchas: [],
    overallStatus: 'pass',
    ...overrides,
  };
}

describe('deriveWarningTokens', () => {
  it('returns empty array when no gotchas and no skipped checks', () => {
    const receipt = makeMinimalReceipt({
      checks: [
        { id: 'wasm-simd', label: 'WASM SIMD', status: 'pass', detail: 'Passed' },
        { id: 'webgpu', label: 'WebGPU', status: 'pass', detail: 'Adapter found' },
      ],
      gotchas: [],
      overallStatus: 'pass',
    });

    const tokens = deriveWarningTokens(receipt);
    expect(tokens).toHaveLength(0);
  });

  it('derives token from G.HW.HEADSET_REPORT gotcha', () => {
    const receipt = makeMinimalReceipt({
      checks: [
        {
          id: 'headset-report',
          label: 'Quest/headset probe report',
          status: 'skipped',
          detail: 'No headset report supplied. Export observations.md from Studio /quest-probe and pass --headset-report.',
        },
      ],
      gotchas: [
        {
          id: 'G.HW.HEADSET_REPORT',
          severity: 'medium',
          summary: 'Quest/headset probe report missing; headset-specific readiness is unproven.',
          evidenceCheckId: 'headset-report',
        },
      ],
      overallStatus: 'warn',
    });

    const tokens = deriveWarningTokens(receipt);
    expect(tokens).toHaveLength(1);

    const token = tokens[0];
    expect(token.id).toBe('warn_g_hw_headset_report');
    expect(token.title).toBe('Quest/headset probe report missing');
    expect(token.severity).toBe('medium');
    expect(token.gotchaId).toBe('G.HW.HEADSET_REPORT');
    expect(token.sourceCheckId).toBe('headset-report');
    expect(token.whyItMatters).toContain('Headset-specific readiness is unproven');
  });

  it('derives token from G.HW.REPLAY_RECEIPT gotcha', () => {
    const receipt = makeMinimalReceipt({
      checks: [
        {
          id: 'replay-receipt',
          label: 'Replay receipt capture',
          status: 'skipped',
          detail: 'No replay artifact supplied. Pass --replay with a scene replay, trace, or validation receipt.',
        },
      ],
      gotchas: [
        {
          id: 'G.HW.REPLAY_RECEIPT',
          severity: 'medium',
          summary: 'Replay receipt not attached; the run has no deterministic replay evidence.',
          evidenceCheckId: 'replay-receipt',
        },
      ],
      overallStatus: 'warn',
    });

    const tokens = deriveWarningTokens(receipt);
    expect(tokens).toHaveLength(1);

    const token = tokens[0];
    expect(token.id).toBe('warn_g_hw_replay_receipt');
    expect(token.title).toBe('Replay receipt not attached');
    expect(token.whyItMatters).toContain('Deterministic replay evidence is required');
  });

  it('derives tokens for both headset and replay gaps (real receipt scenario)', () => {
    const receipt = makeMinimalReceipt({
      checks: [
        { id: 'wasm-simd', label: 'WASM SIMD', status: 'pass', detail: 'WebAssembly SIMD validation passed.' },
        { id: 'runtime-inventory', label: 'Local GPU/runtime inventory', status: 'pass', detail: 'Detected 4 GPU controller(s).' },
        { id: 'webgpu-browser', label: 'WebGPU browser smoke', status: 'pass', detail: 'WebGPU adapter/device smoke shader completed.' },
        {
          id: 'headset-report',
          label: 'Quest/headset probe report',
          status: 'skipped',
          detail: 'No headset report supplied. Export observations.md from Studio /quest-probe and pass --headset-report.',
        },
        {
          id: 'replay-receipt',
          label: 'Replay receipt capture',
          status: 'skipped',
          detail: 'No replay artifact supplied. Pass --replay with a scene replay, trace, or validation receipt.',
        },
      ],
      gotchas: [
        {
          id: 'G.HW.HEADSET_REPORT',
          severity: 'medium',
          summary: 'Quest/headset probe report missing; headset-specific readiness is unproven.',
          evidenceCheckId: 'headset-report',
        },
        {
          id: 'G.HW.REPLAY_RECEIPT',
          severity: 'medium',
          summary: 'Replay receipt not attached; the run has no deterministic replay evidence.',
          evidenceCheckId: 'replay-receipt',
        },
      ],
      overallStatus: 'warn',
    });

    const tokens = deriveWarningTokens(receipt);
    expect(tokens).toHaveLength(2);

    const headsetToken = tokens.find((t) => t.gotchaId === 'G.HW.HEADSET_REPORT');
    const replayToken = tokens.find((t) => t.gotchaId === 'G.HW.REPLAY_RECEIPT');

    expect(headsetToken).toBeDefined();
    expect(replayToken).toBeDefined();
    expect(headsetToken?.actions.some((a) => a.type === 'attach')).toBe(true);
    expect(headsetToken?.actions.some((a) => a.type === 'skip')).toBe(true);
    expect(headsetToken?.actions.some((a) => a.type === 'why-it-matters')).toBe(true);
  });

  it('derives token from skipped check without corresponding gotcha', () => {
    const receipt = makeMinimalReceipt({
      checks: [
        {
          id: 'unknown-check',
          label: 'Unknown check',
          status: 'skipped',
          detail: 'No evidence supplied',
        },
      ],
      gotchas: [],
      overallStatus: 'warn',
    });

    const tokens = deriveWarningTokens(receipt);
    // Skipped checks with "No " in detail create tokens with default whyItMatters
    expect(tokens).toHaveLength(1);
    expect(tokens[0].whyItMatters).toBe('This evidence gap affects HoloLand readiness. Attach the required evidence or explicitly skip with a reason.');
  });

  it('includes all three action types on each token', () => {
    const receipt = makeMinimalReceipt({
      checks: [
        {
          id: 'headset-report',
          label: 'Quest/headset probe report',
          status: 'skipped',
          detail: 'No headset report supplied',
        },
      ],
      gotchas: [
        {
          id: 'G.HW.HEADSET_REPORT',
          severity: 'medium',
          summary: 'Headset report missing',
          evidenceCheckId: 'headset-report',
        },
      ],
      overallStatus: 'warn',
    });

    const tokens = deriveWarningTokens(receipt);
    expect(tokens).toHaveLength(1);

    const actions = tokens[0].actions;
    expect(actions.some((a) => a.type === 'attach')).toBe(true);
    expect(actions.some((a) => a.type === 'skip')).toBe(true);
    expect(actions.some((a) => a.type === 'why-it-matters')).toBe(true);
  });

  it('maps gotcha severity correctly', () => {
    const receipt = makeMinimalReceipt({
      gotchas: [
        { id: 'G.HW.WEBGPU_BROWSER', severity: 'high', summary: 'WebGPU failed', evidenceCheckId: 'webgpu' },
        { id: 'G.HW.HEADSET_REPORT', severity: 'medium', summary: 'Headset missing', evidenceCheckId: 'headset' },
        { id: 'G.HW.GPU_INVENTORY', severity: 'low', summary: 'No GPU', evidenceCheckId: 'gpu' },
      ],
      checks: [],
      overallStatus: 'warn',
    });

    const tokens = deriveWarningTokens(receipt);
    const highToken = tokens.find((t) => t.gotchaId === 'G.HW.WEBGPU_BROWSER');
    const medToken = tokens.find((t) => t.gotchaId === 'G.HW.HEADSET_REPORT');
    const lowToken = tokens.find((t) => t.gotchaId === 'G.HW.GPU_INVENTORY');

    expect(highToken?.severity).toBe('high');
    expect(medToken?.severity).toBe('medium');
    expect(lowToken?.severity).toBe('low');
  });
});

describe('getWarningColorClass', () => {
  it('returns correct color class for each severity', () => {
    expect(getWarningColorClass('low')).toBe('warning-low');
    expect(getWarningColorClass('medium')).toBe('warning-medium');
    expect(getWarningColorClass('high')).toBe('warning-high');
    expect(getWarningColorClass('critical')).toBe('warning-critical');
  });
});

describe('getWarningIcon', () => {
  it('returns correct icon for each severity', () => {
    expect(getWarningIcon('low')).toBe('info');
    expect(getWarningIcon('medium')).toBe('alert-triangle');
    expect(getWarningIcon('high')).toBe('alert-circle');
    expect(getWarningIcon('critical')).toBe('alert-octagon');
  });
});

describe('formatWarningForHoloShell', () => {
  it('formats token as HoloShell-readable string', () => {
    const token = {
      id: 'warn_test',
      title: 'Test warning',
      severity: 'medium' as const,
      detail: 'Test detail',
      whyItMatters: 'Test why',
      actions: [],
      sourceCheckId: 'test-check',
    };

    const formatted = formatWarningForHoloShell(token);
    expect(formatted).toBe('[MEDIUM] Test warning: Test detail');
  });
});

describe('summarizeWarningTokens', () => {
  it('returns "All evidence attached" for empty array', () => {
    expect(summarizeWarningTokens([])).toBe('All evidence attached');
  });

  it('summarizes mixed severity tokens', () => {
    const tokens = [
      { id: '1', title: 'High', severity: 'high' as const, detail: '', whyItMatters: '', actions: [], sourceCheckId: '' },
      { id: '2', title: 'Medium', severity: 'medium' as const, detail: '', whyItMatters: '', actions: [], sourceCheckId: '' },
      { id: '3', title: 'Low', severity: 'low' as const, detail: '', whyItMatters: '', actions: [], sourceCheckId: '' },
    ];

    const summary = summarizeWarningTokens(tokens);
    expect(summary).toBe('3 evidence gaps: 1 critical, 1 medium, 1 low');
  });

  it('handles single token', () => {
    const tokens = [
      { id: '1', title: 'Single', severity: 'medium' as const, detail: '', whyItMatters: '', actions: [], sourceCheckId: '' },
    ];

    const summary = summarizeWarningTokens(tokens);
    expect(summary).toBe('1 evidence gap: 1 medium');
  });
});
