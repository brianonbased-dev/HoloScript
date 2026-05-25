import { describe, expect, it } from 'vitest';
import { ProceduralCompiler } from './ProceduralCompiler';

describe('ProceduralCompiler', () => {
  it('emits an honest safety-wrapped scaffold for raw LLM-authored code', () => {
    const compiled = ProceduralCompiler.compile({
      id: 'brittney-combat-01',
      name: 'Basic Melee Engagement',
      description: 'Engages an entity within 50 units dynamically.',
      code: `
move(10, 0, 5)
scan_radius(50)
attack('Target')
wait(100)
      `,
    });

    expect(compiled).toContain('// Auto-generated safety-wrapped skill scaffold');
    expect(compiled).toContain('// Source: raw skill.code lines; no procedural grammar expansion');
    expect(compiled).toContain('agent brittney_combat_01');
    expect(compiled).toContain('ensure_safety()');
    expect(compiled).toContain('move(10, 0, 5)');
    expect(compiled).toContain("attack('Target')");
    expect(compiled).toContain('scan_radius(50)');
    expect(compiled).toContain('wait(100)');
  });

  it('does not synthesize grammar, rule, or parameter-driven output', () => {
    const compiled = ProceduralCompiler.compile({
      id: 'grammar-test',
      name: 'Grammar Test',
      code: 'rule: spawn -> move',
    });

    expect(compiled).toContain('rule: spawn -> move');
    expect(compiled).toContain('// Source: raw skill.code lines; no procedural grammar expansion');
    expect(compiled).not.toContain('l_system');
    expect(compiled).not.toContain('noise');
  });
});
