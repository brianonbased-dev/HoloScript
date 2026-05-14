import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildStudioOperatorPrompt,
  parseHoloShellOperatorReceipt,
  resolveHoloShellOperatorConfig,
} from '../HoloShellOperatorBridge';

describe('resolveHoloShellOperatorConfig', () => {
  it('keeps the HoloShell transport disabled unless explicitly requested', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'studio-operator-disabled-'));
    const config = resolveHoloShellOperatorConfig({}, root);
    expect(config.requested).toBe(false);
    expect(config.enabled).toBe(false);
    expect(config.reason).toContain('not set to holoshell');
  });

  it('fails closed when holoshell transport is requested but the runner is missing', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'studio-operator-missing-'));
    const hololand = path.join(root, 'Hololand');
    const holoscript = path.join(root, 'HoloScript');
    mkdirSync(hololand);
    mkdirSync(holoscript);

    const config = resolveHoloShellOperatorConfig(
      {
        BRITTNEY_OPERATOR_TRANSPORT: 'holoshell',
        HOLOLAND_REPO: hololand,
        HOLOSCRIPT_REPO: holoscript,
      },
      root
    );

    expect(config.requested).toBe(true);
    expect(config.enabled).toBe(false);
    expect(config.reason).toContain('runner not found');
  });

  it('enables the bridge only when the HoloShell runner exists', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'studio-operator-enabled-'));
    const hololand = path.join(root, 'Hololand');
    const holoscript = path.join(root, 'HoloScript');
    const scripts = path.join(hololand, 'scripts');
    mkdirSync(scripts, { recursive: true });
    mkdirSync(holoscript);
    writeFileSync(path.join(scripts, 'holoshell-brittney-turn.mjs'), 'console.log("{}")');

    const config = resolveHoloShellOperatorConfig(
      {
        BRITTNEY_USE_HOLOSHELL_OPERATOR: '1',
        HOLOLAND_REPO: hololand,
        HOLOSCRIPT_REPO: holoscript,
        BRITTNEY_OPERATOR_TIMEOUT_MS: '1234',
        BRITTNEY_OPERATOR_MAX_ITERATIONS: '2',
      },
      root
    );

    expect(config.enabled).toBe(true);
    expect(config.scriptPath).toBe(path.join(scripts, 'holoshell-brittney-turn.mjs'));
    expect(config.timeoutMs).toBe(1234);
    expect(config.maxIterations).toBe(2);
  });
});

describe('buildStudioOperatorPrompt', () => {
  it('names HoloShell as the operator and redacts local user paths', () => {
    const prompt = buildStudioOperatorPrompt(
      'Open this project safely',
      'Full scene code lives at C:\\Users\\josep\\Documents\\GitHub\\HoloScript'
    );

    expect(prompt).toContain('HoloShell Brittney operator');
    expect(prompt).toContain('Do not invent a Studio-only operator');
    expect(prompt).toContain('Open this project safely');
    expect(prompt).toContain('[user-home]');
    expect(prompt).not.toContain('C:\\Users\\josep');
  });
});

describe('parseHoloShellOperatorReceipt', () => {
  it('accepts the HoloShell turn receipt shape', () => {
    const receipt = parseHoloShellOperatorReceipt(
      JSON.stringify({
        schemaVersion: 'hololand.holoshell.brittney-turn.v0.1.0',
        turnId: 'brittney_turn_abc',
        generatedAt: '2026-05-14T00:00:00.000Z',
        prompt: 'test',
        sourceAnchors: {
          source: 'apps/holoshell/source/holoshell-brittney-runtime-bridge.hsplus',
          bridgeScript: 'scripts/holoshell-brittney-turn.mjs',
          holoscriptRoot: 'C:/repo/HoloScript',
        },
        proposals: [],
        result: { ok: true, finalText: 'ready' },
        receipt: {
          id: 'receipt_abc',
          receiptType: 'hololand.holoshell.brittney-turn.v0.1.0',
          actor: 'brittney',
          route: 'local',
          source: 'apps/holoshell/source/holoshell-brittney-runtime-bridge.hsplus',
          worldEffect: 'preview',
        },
        summary: {
          status: 'completed',
          runtimeStatus: 'self-test',
          eventCount: 4,
          actionProposalCount: 0,
        },
      })
    );

    expect(receipt.summary.status).toBe('completed');
    expect(receipt.result.finalText).toBe('ready');
  });

  it('rejects receipts that are not from the HoloShell operator runner', () => {
    expect(() =>
      parseHoloShellOperatorReceipt(
        JSON.stringify({
          schemaVersion: 'studio.brittney.parallel.v1',
          turnId: 'parallel',
          result: { finalText: 'nope' },
          summary: { status: 'completed' },
        })
      )
    ).toThrow(/invalid turn receipt/);
  });
});
