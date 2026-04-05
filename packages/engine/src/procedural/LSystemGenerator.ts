/**
 * LSystemGenerator.ts
 *
 * Lindenmayer system (L-system) for procedural vegetation.
 * Supports stochastic rules, branching, and 3D turtle graphics.
 *
 * @module procedural
 */

import { IVector3 } from '../physics/PhysicsTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface LSystemRule {
  symbol: string;
  replacement: string;
  probability?: number; // 0-1 for stochastic rules (default: 1)
}

export interface LSystemConfig {
  axiom: string;
  rules: LSystemRule[];
  angle: number; // Branch angle in degrees
  length: number; // Segment length
  lengthScale: number; // Length reduction per iteration (0.8 typical)
  iterations: number;
}

export interface TurtleState {
  position: IVector3;
  direction: IVector3;
  up: IVector3;
  length: number;
  depth: number;
}

export interface LSystemSegment {
  start: IVector3;
  end: IVector3;
  depth: number;
  radius: number;
}

export interface LSystemLeaf {
  position: IVector3;
  normal: IVector3;
  size: number;
}

export interface LSystemResult {
  segments: LSystemSegment[];
  leaves: LSystemLeaf[];
  boundingBox: { min: IVector3; max: IVector3 };
}

// =============================================================================
// PRESETS
// =============================================================================

export const TREE_SIMPLE: LSystemConfig = {
  axiom: 'F',
  rules: [{ symbol: 'F', replacement: 'FF+[+F-F-F]-[-F+F+F]' }],
  angle: 25,
  length: 1.0,
  lengthScale: 0.7,
  iterations: 3,
};

export const TREE_BINARY: LSystemConfig = {
  axiom: 'X',
  rules: [
    { symbol: 'X', replacement: 'F[+X][-X]FX' },
    { symbol: 'F', replacement: 'FF' },
  ],
  angle: 30,
  length: 0.8,
  lengthScale: 0.75,
  iterations: 4,
};

export const BUSH: LSystemConfig = {
  axiom: 'F',
  rules: [
    { symbol: 'F', replacement: 'F[+F]F[-F][F]', probability: 0.8 },
    { symbol: 'F', replacement: 'F[+F][-F]', probability: 0.2 },
  ],
  angle: 20,
  length: 0.5,
  lengthScale: 0.8,
  iterations: 4,
};

export const FERN: LSystemConfig = {
  axiom: 'X',
  rules: [
    { symbol: 'X', replacement: 'F+[[X]-X]-F[-FX]+X' },
    { symbol: 'F', replacement: 'FF' },
  ],
  angle: 25,
  length: 0.3,
  lengthScale: 0.85,
  iterations: 5,
};

// =============================================================================
// L-SYSTEM GENERATOR
// =============================================================================

export class LSystemGenerator {
  private seed: number;
  private rng: () => number;

  constructor(seed: number = 42) {
    this.seed = seed;
    this.rng = this.createRng(seed);
  }

  // ---------------------------------------------------------------------------
  // String Generation
  // ---------------------------------------------------------------------------

  /**
   * Apply production rules to expand the axiom.
   */
  expand(config: LSystemConfig): string {
    let current = config.axiom;

    for (let i = 0; i < config.iterations; i++) {
      let next = '';
      for (const char of current) {
        const matching = config.rules.filter((r) => r.symbol === char);

        if (matching.length === 0) {
          next += char;
          continue;
        }

        // Stochastic selection
        if (
          matching.length === 1 &&
          (matching[0].probability === undefined || matching[0].probability >= 1)
        ) {
          next += matching[0].replacement;
        } else {
          const roll = this.rng();
          let cumulative = 0;
          let chosen = matching[0].replacement;
          for (const rule of matching) {
            cumulative += rule.probability ?? 1;
            if (roll <= cumulative) {
              chosen = rule.replacement;
              break;
            }
          }
          next += chosen;
        }
      }
      current = next;
    }

    return current;
  }

  // ---------------------------------------------------------------------------
  // Turtle Interpretation
  // ---------------------------------------------------------------------------

  /**
   * Interpret the L-system string using 3D turtle graphics.
   */
  interpret(lString: string, config: LSystemConfig): LSystemResult {
    const segments: LSystemSegment[] = [];
    const leaves: LSystemLeaf[] = [];

    const stack: TurtleState[] = [];
    let state: TurtleState = {
      position: { x: 0, y: 0, z: 0 },
      direction: { x: 0, y: 1, z: 0 }, // Growing upward
      up: { x: 0, y: 0, z: 1 },
      length: config.length,
      depth: 0,
    };

    const angleRad = (config.angle * Math.PI) / 180;

    const minBound = { x: 0, y: 0, z: 0 };
    const maxBound = { x: 0, y: 0, z: 0 };

    for (const char of lString) {
      switch (char) {
        case 'F': {
          // Move forward and draw
          const start = { ...state.position };
          const end = {
            x: state.position.x + state.direction.x * state.length,
            y: state.position.y + state.direction.y * state.length,
            z: state.position.z + state.direction.z * state.length,
          };
          segments.push({
            start,
            end,
            depth: state.depth,
            radius: Math.max(0.02, 0.1 * Math.pow(config.lengthScale, state.depth)),
          });
          state.position = end;
          this.updateBounds(end, minBound, maxBound);
          break;
        }
        case '+':
          state.direction = this.rotateY(state.direction, angleRad);
          break;
        case '-':
          state.direction = this.rotateY(state.direction, -angleRad);
          break;
        case '&':
          state.direction = this.rotateX(state.direction, angleRad);
          break;
        case '^':
          state.direction = this.rotateX(state.direction, -angleRad);
          break;
        case '[':
          stack.push({
            position: { ...state.position },
            direction: { ...state.direction },
            up: { ...state.up },
            length: state.length * config.lengthScale,
            depth: state.depth + 1,
          });
          break;
        case ']':
          if (stack.length > 0) {
            // Add leaf at branch tip before popping
            leaves.push({
              position: { ...state.position },
              normal: { ...state.direction },
              size: 0.3 * Math.pow(config.lengthScale, state.depth),
            });
            state = stack.pop()!;
          }
          break;
        case 'X':
          // Placeholder — no turtle action
          break;
      }
    }

    return {
      segments,
      leaves,
      boundingBox: { min: minBound, max: maxBound },
    };
  }

  // ---------------------------------------------------------------------------
  // High-Level API
  // ---------------------------------------------------------------------------

  /**
   * Generate a complete L-system tree/plant.
   */
  generate(config: LSystemConfig): LSystemResult {
    const lString = this.expand(config);
    return this.interpret(lString, config);
  }

  // ---------------------------------------------------------------------------
  // Internal Utilities
  // ---------------------------------------------------------------------------

  private rotateY(dir: IVector3, angle: number): IVector3 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: dir.x * cos - dir.z * sin,
      y: dir.y,
      z: dir.x * sin + dir.z * cos,
    };
  }

  private rotateX(dir: IVector3, angle: number): IVector3 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: dir.x,
      y: dir.y * cos - dir.z * sin,
      z: dir.y * sin + dir.z * cos,
    };
  }

  private updateBounds(p: IVector3, min: IVector3, max: IVector3): void {
    min.x = Math.min(min.x, p.x);
    min.y = Math.min(min.y, p.y);
    min.z = Math.min(min.z, p.z);
    max.x = Math.max(max.x, p.x);
    max.y = Math.max(max.y, p.y);
    max.z = Math.max(max.z, p.z);
  }

  private createRng(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }
}

