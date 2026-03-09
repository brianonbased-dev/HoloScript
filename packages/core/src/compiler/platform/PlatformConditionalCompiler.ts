/**
 * @platform() Conditional Compilation Compiler
 *
 * Resolves @platform() annotated blocks for a target platform,
 * performing dead-code elimination for non-matching platforms.
 *
 * Syntax:
 *   @platform(vr)               — category match
 *   @platform(quest3)           — specific target
 *   @platform(vr, ar)           — multi-target
 *   @platform(!automotive)      — negation
 *   @platform(*)                — all platforms (default)
 *
 * @module @holoscript/core/compiler/platform/PlatformConditionalCompiler
 */

import type { PlatformTarget, PlatformCategory } from './PlatformConditional';
import { PLATFORM_CATEGORIES, ALL_PLATFORMS, platformCategory } from './PlatformConditional';

// =============================================================================
// TYPES
// =============================================================================

export interface PlatformBlock {
  /** The platforms this block targets */
  platforms: (PlatformTarget | PlatformCategory | '*')[];
  /** The trait/property content inside the block */
  content: Record<string, unknown>;
  /** Whether this is a negation (@platform(!vr)) */
  negated: boolean;
}

export interface PlatformConditionalResult {
  /** Resolved traits after platform filtering */
  resolvedTraits: Record<string, unknown>;
  /** Blocks that were included */
  includedBlocks: PlatformBlock[];
  /** Blocks that were eliminated (dead code) */
  eliminatedBlocks: PlatformBlock[];
  /** Warnings */
  warnings: string[];
  /** Stats */
  stats: {
    totalBlocks: number;
    included: number;
    eliminated: number;
    deadCodeRatio: number;
  };
}

// =============================================================================
// COMPILER
// =============================================================================

export class PlatformConditionalCompiler {
  private readonly targetPlatform: PlatformTarget;
  private readonly targetCategory: PlatformCategory;

  constructor(target: PlatformTarget) {
    this.targetPlatform = target;
    this.targetCategory = platformCategory(target);
  }

  /**
   * Resolve @platform() blocks for the current target.
   * Later blocks override earlier blocks (cascade order).
   */
  resolve(
    blocks: PlatformBlock[],
    baseTraits: Record<string, unknown> = {}
  ): PlatformConditionalResult {
    const resolvedTraits = { ...baseTraits };
    const includedBlocks: PlatformBlock[] = [];
    const eliminatedBlocks: PlatformBlock[] = [];
    const warnings: string[] = [];

    for (const block of blocks) {
      if (this.matchesPlatform(block)) {
        Object.assign(resolvedTraits, block.content);
        includedBlocks.push(block);
      } else {
        eliminatedBlocks.push(block);
      }
    }

    if (includedBlocks.length === 0 && blocks.length > 0) {
      warnings.push(
        `No @platform() blocks match target '${this.targetPlatform}' (category: ${this.targetCategory})`
      );
    }

    const total = blocks.length;
    return {
      resolvedTraits,
      includedBlocks,
      eliminatedBlocks,
      warnings,
      stats: {
        totalBlocks: total,
        included: includedBlocks.length,
        eliminated: eliminatedBlocks.length,
        deadCodeRatio: total > 0 ? eliminatedBlocks.length / total : 0,
      },
    };
  }

  private matchesPlatform(block: PlatformBlock): boolean {
    const matchesAny = block.platforms.some((p) => {
      if (p === '*') return true;
      if (p === this.targetPlatform) return true;
      if (p === this.targetCategory) return true;
      const cat = p as PlatformCategory;
      if (PLATFORM_CATEGORIES[cat]?.includes(this.targetPlatform)) return true;
      return false;
    });
    return block.negated ? !matchesAny : matchesAny;
  }

  /**
   * Parse a @platform() annotation string.
   * "@platform(vr)" → { platforms: ['vr'], negated: false }
   * "@platform(!automotive)" → { platforms: ['automotive'], negated: true }
   */
  static parseAnnotation(annotation: string): {
    platforms: (PlatformTarget | PlatformCategory | '*')[];
    negated: boolean;
  } {
    const match = annotation.match(/@platform\((!?)([^)]+)\)/);
    if (!match) throw new Error(`Invalid @platform() annotation: ${annotation}`);
    const negated = match[1] === '!';
    const platforms = match[2].split(',').map((p) => p.trim()) as (
      | PlatformTarget
      | PlatformCategory
      | '*'
    )[];
    return { platforms, negated };
  }

  /** Validate all platform names in blocks are recognized. */
  static validatePlatforms(blocks: PlatformBlock[]): string[] {
    const errors: string[] = [];
    const allValid = new Set<string>([...ALL_PLATFORMS, ...Object.keys(PLATFORM_CATEGORIES), '*']);
    for (const block of blocks) {
      for (const p of block.platforms) {
        if (!allValid.has(p as string)) {
          errors.push(`Unknown platform '${p}' in @platform() block`);
        }
      }
    }
    return errors;
  }

  getTarget(): PlatformTarget {
    return this.targetPlatform;
  }
  getCategory(): PlatformCategory {
    return this.targetCategory;
  }
}

export function createPlatformConditionalCompiler(
  target: PlatformTarget
): PlatformConditionalCompiler {
  return new PlatformConditionalCompiler(target);
}
