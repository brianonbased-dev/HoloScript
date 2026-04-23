/**
 * HoloCompositionParser — Characterization Tests (W4-T3 pre-split lock)
 *
 * **Purpose**: Lock current parse-output hashes for HoloCompositionParser
 * so the Wave-1 split (W1-T2: split 6,477 LOC by rule-family under
 * `parser/composition/`) can ship safely. Any behavior change during
 * the split breaks a hash here, not just a behavior assertion.
 *
 * **Discipline**: lock tests, not behavior tests. Failing hash =
 * either (a) regression to fix, or (b) intentional change to re-lock
 * in the same commit, explicitly called out in the commit message.
 *
 * **Scope**: covers the four rule-family split targets —
 * composition / expression / directive / import — plus representative
 * error-case output. Not exhaustive; broad enough that any structural
 * refactor of grammar dispatch touches at least one hash.
 *
 * **See**: ai-ecosystem research/2026-04-21_audit-mode-backlog.md §W4-T3 / W1-T2
 *         packages/core/src/parser/HoloCompositionParser.ts (6,477 LOC target)
 *         packages/core/src/parser/HoloCompositionParser.test.ts (existing behavior tests)
 *         packages/core/src/HoloScriptRuntime.characterization.test.ts (sister lock file)
 */

import { createHash } from 'crypto';
import { describe, it, expect } from 'vitest';
import { parseHolo } from './HoloCompositionParser';

// Fields stripped as non-deterministic before hashing. Parsers should
// produce deterministic AST but this set defends against future
// drift (e.g., if a parser revision adds timestamps to diagnostics).
const NONDET_KEYS = new Set<string>([
  'timestamp',
  'runId',
  'created',
  'createdAt',
  'modifiedAt',
  'updatedAt',
  '_generated_at',
  'parseTimeMs', // if parser ever reports self-timing
]);

function hashResult(result: unknown): string {
  const stripped = stripNondeterministic(result);
  return createHash('sha256').update(stableStringify(stripped)).digest('hex').slice(0, 16);
}

function stripNondeterministic(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(stripNondeterministic);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v as object)) {
    if (NONDET_KEYS.has(k)) continue;
    out[k] = stripNondeterministic((v as Record<string, unknown>)[k]);
  }
  return out;
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const keys = Object.keys(v as object).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + stableStringify((v as Record<string, unknown>)[k]))
      .join(',') +
    '}'
  );
}

describe('HoloCompositionParser characterization (W4-T3 pre-split lock for W1-T2)', () => {
  describe('composition rule-family', () => {
    it('[P1] minimal composition locks output', () => {
      const source = `composition "Minimal" {}`;
      expect(hashResult(parseHolo(source))).toMatchSnapshot('P1-compMinimal');
    });

    it('[P2] composition with environment block locks output', () => {
      const source = `composition "Env" {
        environment {
          theme: "dark"
          ambient_light: 0.3
        }
      }`;
      expect(hashResult(parseHolo(source))).toMatchSnapshot('P2-compEnv');
    });

    it('[P3] composition with nested particle system locks output', () => {
      const source = `composition "Particles" {
        environment {
          particle_system "dust" {
            count: 100
            spread: 25
            speed: 0.5
          }
        }
      }`;
      expect(hashResult(parseHolo(source))).toMatchSnapshot('P3-compParticles');
    });

    it('[P4] composition with objects + properties locks output', () => {
      const source = `composition "WithObjects" {
        object "Cube" {
          position: [0, 1, 2]
          scale: 1.5
          color: "red"
        }
      }`;
      expect(hashResult(parseHolo(source))).toMatchSnapshot('P4-compObjects');
    });
  });

  describe('expression rule-family', () => {
    it('[P5] numeric expressions in property values lock output', () => {
      const source = `composition "Exprs" {
        object "Box" {
          size: 42
          opacity: 0.75
          count: 1000
        }
      }`;
      expect(hashResult(parseHolo(source))).toMatchSnapshot('P5-exprNumeric');
    });

    it('[P6] string expressions lock output', () => {
      const source = `composition "Str" {
        object "Panel" {
          label: "Hello, World!"
          texture: "textures/metal.png"
        }
      }`;
      expect(hashResult(parseHolo(source))).toMatchSnapshot('P6-exprString');
    });

    it('[P7] boolean + array expressions lock output', () => {
      const source = `composition "Mixed" {
        object "Light" {
          enabled: true
          cast_shadows: false
          position: [3, 4, 5]
        }
      }`;
      expect(hashResult(parseHolo(source))).toMatchSnapshot('P7-exprMixed');
    });
  });

  describe('directive/trait rule-family', () => {
    it('[P8] composition with @trait directive locks output', () => {
      const source = `composition "Traits" {
        object "Agent" {
          @physics
          @networked
          mass: 10
        }
      }`;
      expect(hashResult(parseHolo(source))).toMatchSnapshot('P8-traits');
    });

    it('[P9] trait with config block locks output', () => {
      const source = `composition "TraitConfig" {
        object "Vehicle" {
          @physics {
            mass: 1500
            friction: 0.4
          }
          @digital_twin
        }
      }`;
      expect(hashResult(parseHolo(source))).toMatchSnapshot('P9-traitConfig');
    });
  });

  describe('import rule-family', () => {
    it('[P10] composition with import statement locks output', () => {
      const source = `import "shared/materials.holo"

composition "WithImport" {
  object "Thing" {
    material: "shared.metal"
  }
}`;
      expect(hashResult(parseHolo(source))).toMatchSnapshot('P10-import');
    });

    it('[P11] composition with multiple imports locks output', () => {
      const source = `import "lib/agents.holo"
import "lib/physics.holo"

composition "MultiImport" {}`;
      expect(hashResult(parseHolo(source))).toMatchSnapshot('P11-multiImport');
    });
  });

  describe('error + edge-case locks', () => {
    it('[P12] malformed input (unclosed brace) locks error shape', () => {
      const source = `composition "Broken" {
        object "Oops" {
          // missing closing braces
      `;
      expect(hashResult(parseHolo(source))).toMatchSnapshot('P12-errorUnclosed');
    });

    it('[P13] empty input locks output', () => {
      expect(hashResult(parseHolo(''))).toMatchSnapshot('P13-empty');
    });

    it('[P14] whitespace-only input locks output', () => {
      expect(hashResult(parseHolo('   \n\n\t   \n  '))).toMatchSnapshot('P14-whitespace');
    });

    it('[P15] comment-only input locks output', () => {
      const source = `// top-level comment
// nothing else
`;
      expect(hashResult(parseHolo(source))).toMatchSnapshot('P15-commentOnly');
    });
  });

  describe('cross-rule composite', () => {
    it('[P16] composition mixing all four rule-families locks composite output', () => {
      // Stress case: imports + composition + directives + expressions
      // in one source. The W1-T2 split must preserve this.
      const source = `import "lib/core.holo"

composition "Full" {
  environment {
    theme: "cyber"
    particle_system "ambient" {
      count: 50
    }
  }

  object "Player" {
    @physics {
      mass: 70
    }
    @networked
    position: [0, 1, 0]
    speed: 5.5
    active: true
  }

  object "Hud" {
    label: "SCORE: 0"
  }
}`;
      expect(hashResult(parseHolo(source))).toMatchSnapshot('P16-composite');
    });
  });
});
