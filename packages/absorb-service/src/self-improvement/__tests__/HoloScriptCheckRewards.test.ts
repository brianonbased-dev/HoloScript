import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RewardToolRunner } from '../GRPORewardFunctions';
import { GRPORewardOrchestrator } from '../GRPORewardOrchestrator';
import {
  gradeHoloScriptCompletion,
  holoScriptCheckReward,
  HOLOSCRIPT_CHECK_REWARDS,
} from '../HoloScriptCheckRewards';

/**
 * HoloScript-for-machines step 5: the checker as a GRPO reward term. The reward checks
 * program validity only (one bare composition, the canonical validator, content, known
 * traits), never what a task asked for: the author_holo detail checks are the exam.
 */

// packages/absorb-service/src/self-improvement/__tests__ -> repo root (5 levels up)
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const quickstart = (file: string) =>
  readFileSync(join(repoRoot, 'examples', 'quickstart', file), 'utf8');

const PROGRAM =
  'composition "Lamp" {\n  object "lamp" {\n    @grabbable\n    geometry: "sphere"\n  }\n}';

describe('gradeHoloScriptCompletion — the reward ladder', () => {
  it('a real quickstart scene is clean: 1', () => {
    for (const file of ['1-floating-cyan-orb.holo', '2-red-cube-teal-button.holo']) {
      const receipt = gradeHoloScriptCompletion(quickstart(file));
      expect(receipt.rung, `${file}: ${receipt.detail}`).toBe('clean');
      expect(receipt.reward).toBe(1);
    }
  });

  it('comments and blank lines around the one program are fine', () => {
    expect(gradeHoloScriptCompletion(`// a lamp\n\n${PROGRAM}\n\n// done\n`).reward).toBe(1);
  });

  it('a bare root name is still one program (the parser takes it); the checker grades the rest', () => {
    // Measured 2026-10-09 on stored frontier answers: Gemini wrote `composition Portal {`.
    const receipt = gradeHoloScriptCompletion(PROGRAM.replace('"Lamp"', 'Lamp'));
    expect(receipt.rung).not.toBe('not-a-program');
  });

  const NOT_A_PROGRAM: Record<string, string> = {
    prose: 'Here is your scene: a red cube on a table.',
    'prose before the program': `Here is the scene:\n${PROGRAM}`,
    'prose after the program': `${PROGRAM}\nThat is the scene.`,
    'a markdown fence': '```holo\n' + PROGRAM + '\n```',
    JSON: '{"composition": "Lamp", "objects": [{"name": "lamp"}]}',
    'two roots': `${PROGRAM}\n${PROGRAM.replace('"Lamp"', '"Other"')}`,
    'a root-less object': 'object "lamp" {\n  geometry: "sphere"\n}',
    'a nameless composition': 'composition {\n  object "lamp" {}\n}',
    'an unclosed composition': 'composition "Lamp" {\n  object "lamp" {}\n',
    empty: '',
  };
  it.each(Object.entries(NOT_A_PROGRAM))('%s is not a program: 0', (_label, source) => {
    const receipt = gradeHoloScriptCompletion(source);
    expect(receipt.rung).toBe('not-a-program');
    expect(receipt.reward).toBe(0);
  });

  it('one program the checker refuses: 0.25', () => {
    const receipt = gradeHoloScriptCompletion(
      'composition "Lamp" {\n  object "lamp" {\n    x:\n  }\n}'
    );
    expect(receipt.rung).toBe('errors');
    expect(receipt.reward).toBe(0.25);
  });

  it('a valid program that holds nothing: 0.5', () => {
    for (const source of [
      'composition "Lamp" {\n}',
      'composition "Lamp" {\n  environment { skybox: "gradient" }\n}',
    ]) {
      const receipt = gradeHoloScriptCompletion(source);
      expect(receipt.rung).toBe('empty');
      expect(receipt.reward).toBe(0.5);
    }
  });

  it('a trait the language does not know: 0.75, and the receipt names it', () => {
    const receipt = gradeHoloScriptCompletion(PROGRAM.replace('@grabbable', '@madeUpTrait'));
    expect(receipt.rung).toBe('unknown-traits');
    expect(receipt.reward).toBe(0.75);
    expect(receipt.detail).toContain('madeUpTrait');
  });

  it('the ladder is strictly increasing, so the group advantage always points one rung up', () => {
    const order = ['not-a-program', 'errors', 'empty', 'unknown-traits', 'clean'] as const;
    for (let i = 1; i < order.length; i++) {
      expect(HOLOSCRIPT_CHECK_REWARDS[order[i]]).toBeGreaterThan(
        HOLOSCRIPT_CHECK_REWARDS[order[i - 1]]
      );
    }
    expect(HOLOSCRIPT_CHECK_REWARDS.warnings).toBe(HOLOSCRIPT_CHECK_REWARDS['unknown-traits']);
  });

  it('the term scores a batch index-aligned', async () => {
    expect(await holoScriptCheckReward(['nope', PROGRAM, 'composition "E" {\n}'])).toEqual([
      0, 1, 0.5,
    ]);
  });
});

/** A runner that counts every TypeScript tool call. */
function countingRunner(): RewardToolRunner & { calls: number } {
  const runner = {
    calls: 0,
    writeTempFile: async () => {
      runner.calls++;
      return '/tmp/test-file.ts';
    },
    deleteTempFile: async () => {},
    runVitest: async () => {
      runner.calls++;
      return { passed: 10, total: 10, coveragePercent: 80, output: 'ok' };
    },
    runTypeCheck: async () => {
      runner.calls++;
      return { passed: true, output: '' };
    },
    runLint: async () => {
      runner.calls++;
      return { issueCount: 0, output: '' };
    },
    getCircuitBreakerHealth: async () => {
      runner.calls++;
      return 100;
    },
  };
  return runner;
}

const HOLO_ONLY = {
  testPassReward: 0,
  typeCheckReward: 0,
  lintReward: 0,
  coverageReward: 0,
  circuitBreakerReward: 0,
  holoScriptCheckReward: 1,
};

describe('GRPORewardOrchestrator HoloScript-check registration (flag-gated, default OFF)', () => {
  it('is off by default', () => {
    const orch = new GRPORewardOrchestrator(countingRunner());
    expect(orch.getRewardFuncsArray()).toHaveLength(5);
    expect(orch.getWeights().holoScriptCheckReward).toBeUndefined();
  });

  it('throws when enabled without a weight, or weighted without being enabled', () => {
    expect(
      () => new GRPORewardOrchestrator(countingRunner(), { enableHoloScriptCheck: true })
    ).toThrow('enableHoloScriptCheck requires weights.holoScriptCheckReward');
    expect(
      () =>
        new GRPORewardOrchestrator(countingRunner(), { weights: { holoScriptCheckReward: 0.2 } })
    ).toThrow('weights.holoScriptCheckReward requires enableHoloScriptCheck: true');
  });

  it('a HoloScript-only run scores with the checker and never runs a TypeScript tool', async () => {
    const runner = countingRunner();
    const orch = new GRPORewardOrchestrator(runner, {
      enableHoloScriptCheck: true,
      weights: HOLO_ONLY,
    });
    const result = await orch.evaluate(['Sure! Here you go.', PROGRAM, 'composition "E" {\n}']);
    expect(result.compositeRewards).toEqual([0, 1, 0.5]);
    expect(result.functionResults.map((f) => f.name)).toEqual(['holoScriptCheckReward']);
    expect(runner.calls).toBe(0);
    expect(orch.getWeights().holoScriptCheckReward).toBe(1);
  });

  it('mixed weights add the HoloScript term to the TypeScript terms', async () => {
    const orch = new GRPORewardOrchestrator(countingRunner(), {
      enableHoloScriptCheck: true,
      cacheEnabled: false,
      weights: {
        testPassReward: 0.3,
        typeCheckReward: 0.15,
        lintReward: 0.1,
        coverageReward: 0.1,
        circuitBreakerReward: 0.05,
        holoScriptCheckReward: 0.3,
      },
    });
    const result = await orch.evaluate([PROGRAM]);
    expect(result.functionResults.map((f) => f.name)).toContain('holoScriptCheckReward');
    expect(result.functionResults).toHaveLength(6);
  });

  it('the default weight set still runs all five TypeScript terms', async () => {
    const runner = countingRunner();
    const orch = new GRPORewardOrchestrator(runner, { cacheEnabled: false });
    const result = await orch.evaluate(['const x = 1;']);
    expect(result.functionResults).toHaveLength(5);
    expect(runner.calls).toBeGreaterThan(0);
  });
});
