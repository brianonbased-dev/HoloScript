import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { TitleCard } from '../components/TitleCard';
import { CodeStep } from '../components/CodeStep';

const STEPS = [
  {
    title: 'Trait Structure',
    description:
      'Every HoloScript trait implements the TraitDefinition interface with a name, param schema, and compile method.',
    lines: [
      {
        content: 'import type { TraitDefinition, TraitCompileContext } from "@holoscript/core"',
        highlight: true,
      },
      { content: '' },
      {
        content: 'interface TraitDefinition<TParams = Record<string, unknown>> {',
        highlight: true,
      },
      { content: '  name: string', annotation: 'e.g. HealthBar' },
      { content: '  paramsSchema: JSONSchema7', type: 'added' as const },
      { content: '  compile(', type: 'added' as const },
      { content: '    params: TParams,', type: 'added' as const },
      {
        content: '    ctx: TraitCompileContext,',
        type: 'added' as const,
        annotation: 'target + helpers',
      },
      { content: '  ): string | TraitOutput', type: 'added' as const },
      { content: '}' },
    ],
  },
  {
    title: 'Writing a Custom Trait',
    description: 'Implement a HealthBar trait that compiles to a UI overlay in Unity and Godot.',
    lines: [
      { content: 'import type { TraitDefinition } from "@holoscript/core"', highlight: true },
      { content: '' },
      { content: 'interface HealthBarParams {', highlight: true },
      { content: '  hp: number' },
      { content: '  maxHp: number' },
      { content: '  color?: string' },
      { content: '}' },
      { content: '' },
      {
        content: 'export const HealthBarTrait: TraitDefinition<HealthBarParams> = {',
        highlight: true,
      },
      { content: "  name: 'HealthBar',", annotation: 'used in .holo' },
      { content: "  paramsSchema: { type: 'object', required: ['hp', 'maxHp'] }," },
      { content: '  compile(params, ctx) {', type: 'added' as const },
      { content: '    const pct = (params.hp / params.maxHp) * 100', type: 'added' as const },
      { content: "    if (ctx.target === 'unity') {", type: 'added' as const },
      {
        content: '`AddComponent<HealthBarUI>().SetHP(${pct}f);`',
        type: 'added' as const,
        annotation: 'C#',
      },
      { content: '    }', type: 'added' as const },
      { content: '`$health_bar.value = ${pct}`', type: 'added' as const, annotation: 'GDScript' },
      { content: '  },' },
      { content: '}' },
    ],
  },
  {
    title: 'Registering the Trait',
    description:
      'Register your trait with the global TraitRegistry so it can be referenced in any .holo scene file.',
    lines: [
      { content: 'import { TraitRegistry } from "@holoscript/core"', highlight: true },
      { content: 'import { HealthBarTrait } from "./traits/HealthBar"' },
      { content: '' },
      {
        content: 'TraitRegistry.register(HealthBarTrait)',
        highlight: true,
        annotation: 'global registration',
      },
      { content: '' },
      { content: '// Now usable in .holo files:', dim: true },
      { content: 'scene GameHUD {', type: 'added' as const, highlight: true },
      { content: '  object PlayerBar {', type: 'added' as const },
      { content: '    position: [0, 0.9, 0]', type: 'added' as const },
      { content: '    traits: [', type: 'added' as const },
      {
        content: "      HealthBar { hp: 75, maxHp: 100, color: '#ff3322' }",
        type: 'added' as const,
        annotation: 'custom trait',
      },
      { content: '    ]', type: 'added' as const },
      { content: '  }', type: 'added' as const },
      { content: '}', type: 'added' as const },
    ],
  },
  {
    title: 'Testing Custom Traits',
    description:
      'Write vitest tests using createComposition() to verify your trait compiles correctly for each target.',
    lines: [
      { content: 'import { describe, it, expect, beforeAll } from "vitest"', highlight: true },
      { content: 'import { createComposition } from "@holoscript/core/test-helpers"' },
      { content: 'import { UnityCompiler } from "@holoscript/core/compilers"' },
      { content: 'import { TraitRegistry } from "@holoscript/core"' },
      { content: 'import { HealthBarTrait } from "../traits/HealthBar"' },
      { content: '' },
      {
        content: 'beforeAll(() => TraitRegistry.register(HealthBarTrait))',
        type: 'added' as const,
      },
      { content: '' },
      { content: "describe('HealthBarTrait', () => {", highlight: true },
      { content: "  it('compiles to Unity C#', () => {", highlight: true },
      { content: '    const comp = createComposition({', type: 'added' as const },
      {
        content: "      traits: [{ name: 'HealthBar', params: { hp: 50, maxHp: 100 } }],",
        type: 'added' as const,
      },
      { content: '    })', type: 'added' as const },
      { content: '    const out = new UnityCompiler().compile(comp)', type: 'added' as const },
      {
        content: "    expect(out).toContain('SetHP(50f)')",
        type: 'added' as const,
        annotation: 'assert output',
      },
      { content: '  })' },
      { content: '})' },
    ],
  },
  {
    title: 'Publishing to npm',
    description:
      'Structure your trait package with the correct peer dependencies and holoscript-trait keyword for discoverability.',
    lines: [
      { content: '// package.json', dim: true },
      { content: '{', highlight: true },
      { content: '  "name": "holoscript-trait-health-bar",' },
      { content: '  "version": "1.0.0",' },
      { content: '  "description": "HoloScript trait: HealthBar UI overlay",' },
      { content: '  "keywords": [', highlight: true },
      { content: '    "holoscript-trait",', annotation: 'enables npm search' },
      { content: '    "holoscript",' },
      { content: '    "xr",' },
      { content: '    "health-bar"' },
      { content: '  ],' },
      { content: '  "peerDependencies": {', type: 'added' as const, highlight: true },
      {
        content: '    "@holoscript/core": ">=3.0.0"',
        type: 'added' as const,
        annotation: 'not a direct dep',
      },
      { content: '  },' },
      { content: '  "exports": {', type: 'added' as const },
      { content: '    ".": "./dist/index.js"', type: 'added' as const },
      { content: '  }' },
      { content: '}' },
    ],
  },
];

export const CustomTraitCreation: React.FC = () => {
  const { fps } = useVideoConfig();
  const titleDuration = 3 * fps;
  const stepDuration = 5 * fps;

  return (
    <AbsoluteFill style={{ background: '#0f1117' }}>
      <Sequence from={0} durationInFrames={titleDuration}>
        <TitleCard
          title="Custom Trait Creation"
          subtitle="Extend HoloScript with your own traits — define, test, and publish to npm"
          tag="Advanced"
        />
      </Sequence>

      {STEPS.map((step, i) => (
        <Sequence key={i} from={titleDuration + i * stepDuration} durationInFrames={stepDuration}>
          <CodeStep
            stepNumber={i + 1}
            title={step.title}
            description={step.description}
            lines={step.lines}
            language="typescript"
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
