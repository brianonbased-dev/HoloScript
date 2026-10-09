import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildKnownTraitSet, DERIVED_TRAIT_SCHEMAS, parseHolo } from '@holoscript/core';
import { tokenizeHoloSource } from '@holoscript/core/parser';
// The strict layer is not a workspace package; the test reads it in place to hold the
// mirrored HS1004 / HS1006 rules equal to it.
import { analyze } from '../../../../core/strict/holo_strict.mjs';
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

  it('comments, blank lines and leading import lines around the one program are fine', () => {
    expect(gradeHoloScriptCompletion(`// a lamp\n\n${PROGRAM}\n\n// done\n`).reward).toBe(1);
    expect(gradeHoloScriptCompletion(`/* a lamp */\n${PROGRAM}\n/* done */`).reward).toBe(1);
    expect(gradeHoloScriptCompletion(`import "./parts.holo"\n\n${PROGRAM}`).rung).not.toBe(
      'not-a-program'
    );
  });

  it('valid programs are one program however they are laid out', () => {
    // 603890a40 mapped lexer positions back to the text and scored these 0: single-symbol
    // columns are 0-based and lines drift after a multi-line string.
    for (const source of [
      'composition "A" { object "o" { geometry: "cube" } }',
      'composition "A" {\n  object "o" {\n    geometry: "cube"\n  }\n  }',
      'composition "A" {\n\tobject "o" {\n\t\tgeometry: "cube"\n\t}\n\t}\n',
      'composition "A" {\n  object "o" {\n    label: "two\nlines"\n    geometry: "cube"\n  }\n}',
    ]) {
      const receipt = gradeHoloScriptCompletion(source);
      expect(receipt.rung, `${JSON.stringify(source)}: ${receipt.detail}`).not.toBe(
        'not-a-program'
      );
    }
  });

  it('a well-formed import, even across lines, may lead; a malformed one may not', () => {
    const multiLine = `import {\n  Lamp,\n  Desk\n} from "./parts.holo"\n\n${PROGRAM}`;
    expect(gradeHoloScriptCompletion(multiLine).rung).not.toBe('not-a-program');
    expect(gradeHoloScriptCompletion(`import "a.holo" then words\n${PROGRAM}`).rung).toBe(
      'not-a-program'
    );
  });

  it('a registry-only trait and a digit-leading trait are known, as in the strict layer', () => {
    expect(buildKnownTraitSet().has('agent_badge')).toBe(false);
    for (const trait of ['@agent_badge', '@2d_canvas']) {
      const receipt = gradeHoloScriptCompletion(PROGRAM.replace('@grabbable', trait));
      expect(receipt.rung, `${trait}: ${receipt.detail}`).toBe('clean');
    }
  });

  it('a trait the source declares itself (`@trait { name: ... }`) is known', () => {
    const source =
      'composition "A" {\n  object "o" {\n    @trait { name: "glint" }\n    @glint\n    geometry: "cube"\n  }\n}';
    const receipt = gradeHoloScriptCompletion(source);
    expect(receipt.rung, receipt.detail).not.toBe('unknown-traits');
  });

  it('a bare root name is still one program (the parser takes it); the checker grades the rest', () => {
    // Measured 2026-10-09 on stored frontier answers: Gemini wrote `composition Portal {`.
    const receipt = gradeHoloScriptCompletion(PROGRAM.replace('"Lamp"', 'Lamp'));
    expect(receipt.rung).not.toBe('not-a-program');
  });

  const NOT_A_PROGRAM: Record<string, unknown> = {
    prose: 'Here is your scene: a red cube on a table.',
    'prose before the program': `Here is the scene:\n${PROGRAM}`,
    'prose after the program': `${PROGRAM}\nThat is the scene.`,
    'a markdown fence': '```holo\n' + PROGRAM + '\n```',
    'a tilde fence (the lexer drops tildes)': '~~~holo\n' + PROGRAM + '\n~~~',
    'symbols after the program (the lexer drops backticks)': `${PROGRAM}\n\`\`\``,
    'a stray backtick before the program': `\`${PROGRAM}`,
    JSON: '{"composition": "Lamp", "objects": [{"name": "lamp"}]}',
    'two roots': `${PROGRAM}\n${PROGRAM.replace('"Lamp"', '"Other"')}`,
    'a root-less object': 'object "lamp" {\n  geometry: "sphere"\n}',
    'a nameless composition': 'composition {\n  object "lamp" {}\n}',
    'an unclosed composition': 'composition "Lamp" {\n  object "lamp" {}\n',
    empty: '',
    'a number, not text': 42,
    null: null,
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
    const receipt = gradeHoloScriptCompletion('composition "Lamp" {\n}');
    expect(receipt.rung).toBe('empty');
    expect(receipt.reward).toBe(0.5);
  });

  it('content is anything beyond bookkeeping (HS1004): an environment, a scene', () => {
    for (const source of [
      'composition "Lamp" {\n  environment { skybox: "gradient" }\n}',
      'composition "Lamp" {\n  scene "Main" {\n    object "lamp" { geometry: "sphere" }\n  }\n}',
    ]) {
      expect(gradeHoloScriptCompletion(source).rung, source).not.toBe('empty');
    }
  });

  it('a trait the language does not know: 0.75, and the receipt names it', () => {
    const receipt = gradeHoloScriptCompletion(PROGRAM.replace('@grabbable', '@madeUpTrait'));
    expect(receipt.rung).toBe('unknown-traits');
    expect(receipt.reward).toBe(0.75);
    expect(receipt.detail).toContain('madeUpTrait');
  });

  // (kebab-case cannot be written in source: the lexer splits `@spatial-audio` at the
  // hyphen; it matters only for registry ids, which the vocabulary normalizes.)
  it('trait spellings compare like the strict layer: case and camelCase', () => {
    for (const trait of ['@Grabbable', '@GRABBABLE', '@spatialAudio']) {
      const receipt = gradeHoloScriptCompletion(PROGRAM.replace('@grabbable', trait));
      expect(receipt.rung, `${trait}: ${receipt.detail}`).toBe('clean');
    }
  });

  it('1 saturates on any trivial valid program (documented: pair this term with a prompt-reading one)', () => {
    expect(gradeHoloScriptCompletion('composition "A" {\n  object "o" {}\n}').reward).toBe(1);
  });

  it('the ladder is strictly increasing, so the group advantage always points one rung up', () => {
    const order = ['not-a-program', 'errors', 'empty', 'unknown-traits', 'clean'] as const;
    for (let i = 1; i < order.length; i++) {
      expect(HOLOSCRIPT_CHECK_REWARDS[order[i]]).toBeGreaterThan(
        HOLOSCRIPT_CHECK_REWARDS[order[i - 1]]
      );
    }
  });

  it('the term scores a batch index-aligned', async () => {
    expect(await holoScriptCheckReward(['nope', PROGRAM, 'composition "E" {\n}'])).toEqual([
      0, 1, 0.5,
    ]);
  });
});

describe('the mirrored rules equal the strict layer on its corpus (real/ included)', () => {
  const corpus = join(repoRoot, 'packages', 'core', 'strict', 'corpus');
  const files = ['valid', 'warns', 'invalid', 'real'].flatMap((kind) =>
    readdirSync(join(corpus, kind))
      .filter((f) => f.endsWith('.holo'))
      .map((f) => join(corpus, kind, f))
  );
  // Strict's vocabulary built the way packages/core/strict/index.mjs builds it, NOT the
  // term's own (which is what is under test): core's known set, the traits .holo files
  // declare, and the trait registry read from disk.
  const registry = JSON.parse(
    readFileSync(join(repoRoot, 'packages', 'core', 'src', 'traits', 'trait-registry.json'), 'utf8')
  ) as Record<string, unknown>;
  const traitIds = new Set<string>([
    ...buildKnownTraitSet(),
    ...DERIVED_TRAIT_SCHEMAS.map((schema) => String(schema.name)),
    ...Object.keys(registry),
  ]);
  const deps = { tokenizeHoloSource, parseHolo, traitIds };
  const compared: string[] = [];
  const MIN_COMPARED = 20;

  it.each(files.map((f) => [f.slice(corpus.length + 1), f]))(
    '%s: empty <=> HS1004, unknown trait <=> HS1006',
    (name, file) => {
      const source = readFileSync(file, 'utf8');
      const receipt = gradeHoloScriptCompletion(source);
      if (receipt.rung === 'not-a-program' || receipt.rung === 'errors') return;
      compared.push(name);
      const codes = new Set(
        (analyze(source, deps).diagnostics as Array<{ code: string }>).map((d) => d.code)
      );
      expect(receipt.rung === 'empty', `HS1004 ${codes.has('HS1004')}`).toBe(codes.has('HS1004'));
      if (receipt.rung !== 'empty') {
        expect(receipt.rung === 'unknown-traits', `HS1006 ${codes.has('HS1006')}`).toBe(
          codes.has('HS1006')
        );
      }
    }
  );

  it('compares enough of the corpus for "equal" to mean something', () => {
    expect(compared.length, compared.join(', ')).toBeGreaterThanOrEqual(MIN_COMPARED);
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
    // The TRL path gets the same list, with names in the same order.
    expect(orch.getRewardFuncsArray()).toEqual([holoScriptCheckReward]);
    expect(orch.getRewardFuncNames()).toEqual(['holoScriptCheckReward']);
  });

  it('with the flag OFF a TypeScript term weighted 0 still runs and reports', async () => {
    const runner = countingRunner();
    const orch = new GRPORewardOrchestrator(runner, {
      cacheEnabled: false,
      weights: {
        testPassReward: 0.5,
        typeCheckReward: 0,
        lintReward: 0.2,
        coverageReward: 0.2,
        circuitBreakerReward: 0.1,
      },
    });
    const result = await orch.evaluate(['const x = 1;']);
    expect(result.functionResults.map((f) => f.name)).toContain('typeCheckReward');
    expect(result.functionResults).toHaveLength(5);
    expect(orch.getRewardFuncsArray()).toHaveLength(5);
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
