import { describe, expect, it } from 'vitest';
import { compilerTools, handleCompilerTool } from '../compiler-tools';

/**
 * Every target `compile_holoscript` advertises must actually be routable.
 *
 * Measured against the live anchor on 2026-08-16: 31 of the 32 advertised targets
 * compiled, and the one that did not was `r3f` — the React Three Fiber target,
 * the one a web caller reaches for first. R3FCompiler had been retired
 * (apex-poison, 2026-06-17) and the work moved to SceneIRTsxEmitter behind the
 * separate `compile_to_r3f` tool; the enum in this tool's schema was never
 * updated to match, so the obvious call failed while the same work succeeded
 * under a different name.
 *
 * The specific bug is one line. The general one — a menu that outlives the
 * kitchen — is what this test is for.
 */
describe('compile_holoscript routes every target it advertises', () => {
  const schema = compilerTools.find((t) => t.name === 'compile_holoscript')?.inputSchema as
    | { properties?: { target?: { enum?: string[] } } }
    | undefined;
  const advertised = schema?.properties?.target?.enum ?? [];

  const SOURCE = 'orb Crystal {\n  geometry: "sphere"\n  color: "#00ffff"\n}';

  it('advertises a non-trivial list of targets', () => {
    expect(advertised.length).toBeGreaterThan(20);
    expect(advertised).toContain('r3f');
  });

  it('accepts r3f, the target that regressed when its compiler was retired', async () => {
    const result = (await handleCompilerTool('compile_holoscript', {
      code: SOURCE,
      target: 'r3f',
    })) as { output?: string; success?: boolean };

    expect(result.success).not.toBe(false);
    // Not merely "did not throw" — real React Three Fiber output.
    expect(String(result.output)).toContain('@react-three/fiber');
  });

  it('no advertised target answers "unknown export target"', async () => {
    const unroutable: string[] = [];

    for (const target of advertised) {
      try {
        await handleCompilerTool('compile_holoscript', { code: SOURCE, target });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Only routing failures count here. A compiler that runs and rejects this
        // particular source is a different question from one that does not exist.
        if (/unknown export target/i.test(message)) unroutable.push(target);
      }
    }

    expect(unroutable).toEqual([]);
  }, 240_000);
});
