/**
 * BuildOptimizer Production Tests
 *
 * Target management, optimization passes, compression ratios, config.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BuildOptimizer } from '../BuildOptimizer';

describe('BuildOptimizer — Production', () => {
  let optimizer: BuildOptimizer;

  beforeEach(() => {
    optimizer = new BuildOptimizer();
  });

  describe('construction', () => {
    it('creates with default passes', () => {
      const config = optimizer.getConfig();
      expect(config.enabledPasses).toContain('minify');
      expect(config.enabledPasses).toContain('compress');
    });
  });

  describe('addTarget', () => {
    it('registers a target', () => {
      optimizer.addTarget('app.js', 'js', 100000);
      expect(optimizer.getTargetCount()).toBe(1);
      expect(optimizer.getTarget('app.js')?.originalSize).toBe(100000);
    });
  });

  describe('applyPass', () => {
    it('reduces JS size with minify', () => {
      optimizer.addTarget('app.js', 'js', 100000);
      optimizer.applyPass('app.js', 'minify');
      expect(optimizer.getTarget('app.js')!.optimizedSize).toBeLessThan(100000);
    });

    it('returns 0 for inapplicable pass', () => {
      optimizer.addTarget('bg.texture', 'texture', 50000);
      const saved = optimizer.applyPass('bg.texture', 'minify'); // minify doesn't apply to textures
      expect(saved).toBe(0);
    });

    it('texture_compress applies to texture', () => {
      optimizer.addTarget('bg.texture', 'texture', 50000);
      optimizer.applyPass('bg.texture', 'texture_compress');
      expect(optimizer.getTarget('bg.texture')!.optimizedSize).toBeLessThan(50000);
    });
  });

  describe('optimize', () => {
    it('runs all enabled passes on all targets', () => {
      optimizer.addTarget('app.js', 'js', 100000);
      optimizer.addTarget('style.css', 'css', 20000);
      const result = optimizer.optimize();
      expect(result.totalSavings).toBeGreaterThan(0);
      expect(result.savingsPercent).toBeGreaterThan(0);
      expect(result.targets).toHaveLength(2);
    });

    it('reports passes applied', () => {
      optimizer.addTarget('app.js', 'js', 100000);
      const result = optimizer.optimize();
      expect(result.passesRun.length).toBeGreaterThan(0);
    });
  });

  describe('enablePass / disablePass', () => {
    it('enablePass adds new pass', () => {
      optimizer.enablePass('tree_shake');
      expect(optimizer.getConfig().enabledPasses).toContain('tree_shake');
    });

    it('disablePass removes pass', () => {
      optimizer.disablePass('minify');
      expect(optimizer.getConfig().enabledPasses).not.toContain('minify');
    });

    it('enablePass is idempotent', () => {
      const before = optimizer.getConfig().enabledPasses.length;
      optimizer.enablePass('minify'); // already enabled
      expect(optimizer.getConfig().enabledPasses.length).toBe(before);
    });
  });
});
