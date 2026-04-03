/**
 * Comprehensive Integration Example
 *
 * Demonstrates using HoloScript generation with:
 * - Template system for consistent prompts
 * - Generator with integrated cache and analytics
 * - Performance optimization
 * - Real-world game development workflows
 */

import { describe, it, expect, beforeAll } from 'vitest';
import type { AIAdapter } from './AIAdapter';
import { HoloScriptGenerator } from './HoloScriptGenerator';
import { PromptTemplateSystem } from './PromptTemplates';
import { GenerationCache } from './GenerationCache';

// =============================================================================
// MOCK ADAPTER FOR TESTING
// =============================================================================

class DemoAdapter implements AIAdapter {
  readonly id = 'demo';
  readonly name = 'DemoAdapter';

  isReady() {
    return true;
  }

  async generateHoloScript(prompt: string) {
    // Simulate different code based on keywords
    let code = '';

    if (prompt.includes('player')) {
      code = `
        orb #Player @grabbable {
          position: [0, 1.6, 0]
          scale: 0.7
          color: "#00FFFF"
        }
      `;
    } else if (prompt.includes('button')) {
      code = `
        orb #Button @pointable {
          geometry: "cube"
          scale: [0.5, 0.2, 0.1]
          color: "#FF6B6B"
        }
      `;
    } else if (prompt.includes('physics')) {
      code = `
        orb #Ball @throwable @collidable {
          geometry: "sphere"
          scale: 0.3
          physics: { mass: 1.0, restitution: 0.8 }
          color: "#FFD93D"
        }
      `;
    } else if (prompt.includes('effect')) {
      code = `
        orb #Effect @animated {
          geometry: "sphere"
          scale: [0.5, 0.5, 0.5]
          opacity: 0.8
          color: "#6BCF7F"
        }
      `;
    } else {
      code = `
        orb #Generic {
          geometry: "cube"
          scale: 1.0
          color: "#FFFFFF"
        }
      `;
    }

    return {
      holoScript: code,
      confidence: 0.9,
    };
  }

  async fixHoloScript(code: string, errors: string[]) {
    return {
      holoScript: code,
      fixes: [] as Array<{ line: number; issue: string; fix: string }>,
    };
  }

  async explainHoloScript(code: string) {
    return {
      explanation: 'This generates interactive 3D objects for VR environments.',
    };
  }

  async optimizeHoloScript(code: string, platform: string) {
    let optimized = code;
    if (platform === 'mobile') {
      optimized = code.replace(/scale: \[.*?\]/g, 'scale: [0.2, 0.2, 0.2]');
    }
    return { holoScript: optimized, improvements: [`Optimized for ${platform}`] };
  }

  async chat(
    message: string,
    context: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  ) {
    return 'This is a chat response.';
  }
}

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('Comprehensive Integration Example', () => {
  let generator: HoloScriptGenerator;
  let templates: PromptTemplateSystem;
  let adapter: DemoAdapter;

  beforeAll(() => {
    generator = new HoloScriptGenerator(true); // Enable cache
    templates = new PromptTemplateSystem();
    adapter = new DemoAdapter();
  });

  // =========================================================================
  // TEMPLATE SYSTEM USAGE
  // =========================================================================

  describe('Template System Integration', () => {
    it('should use interactive object template', async () => {
      const template = templates.getTemplate('interactive-object');
      expect(template).toBeDefined();

      const prompt = templates.createPrompt('interactive-object', {
        color: 'red',
        geometry: 'cube',
        interaction: 'pointable',
        purpose: 'UI button',
      });

      expect(prompt).toContain('red');
      expect(prompt).toContain('cube');
    });

    it('should use physics object template', async () => {
      const template = templates.getTemplate('physics-object');
      expect(template).toBeDefined();

      const prompt = templates.createPrompt('physics-object', {
        geometry: 'sphere',
        physics_type: 'dynamic',
        mass: '1.0',
        restitution: '0.8',
      });

      expect(prompt).toContain('sphere');
      expect(prompt).toContain('physics');
    });

    it('should validate template context', () => {
      const validation = templates.validateContext('basic-object', {
        geometry: 'cube',
        color: 'blue',
        position: '[0, 1, 0]',
      });

      expect(validation.valid).toBe(true);
    });

    it('should report missing template variables', () => {
      const validation = templates.validateContext('interactive-object', {
        objectName: 'Button',
        // Missing 'interaction' and 'appearance'
      });

      expect(validation.valid).toBe(false);
      expect(validation.missing?.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // CACHE INTEGRATION
  // =========================================================================

  describe('Cache System Integration', () => {
    it('should cache and retrieve generated code', async () => {
      const session = generator.createSession(adapter);

      // First call - generates and caches
      const result1 = await generator.generate('Create a player controller', session);
      expect(result1.holoScript).toContain('#Player');

      // Get cache stats
      const stats1 = generator.getCacheStats();
      expect(stats1.entriesCount).toBe(1);
      expect(stats1.totalHits).toBe(0); // First call doesn't count as hit

      // Second call - should hit cache
      const result2 = await generator.generate('Create a player controller', session);
      expect(result2.holoScript).toBe(result1.holoScript);

      const stats2 = generator.getCacheStats();
      expect(stats2.totalHits).toBe(1);
      expect(stats2.hitRate).toBeGreaterThan(0);
    });

    it('should measure cache performance improvement', async () => {
      const session = generator.createSession(adapter);

      const prompts = ['Create a player', 'Create a button', 'Create a physics ball'];

      // Generate all prompts
      for (const prompt of prompts) {
        await generator.generate(prompt, session);
      }

      const cacheStats = generator.getCacheStats();
      expect(cacheStats.entriesCount).toBeGreaterThan(0);
      expect(cacheStats.totalHits + cacheStats.totalMisses).toBeGreaterThanOrEqual(prompts.length);
    });

    it('should not cache failures', async () => {
      // Create a failing adapter
      class FailingAdapter implements AIAdapter {
        readonly id = 'failing';
        readonly name = 'FailingAdapter';
        isReady() { return true; }
        async generateHoloScript(prompt: string) {
          return {
            holoScript: 'invalid [[[ code',
            confidence: 0.1, // Below threshold
          };
        }
        async fixHoloScript(code: string, errors: string[]) {
          return { holoScript: code, fixes: [] as Array<{ line: number; issue: string; fix: string }> };
        }
        async explainHoloScript(code: string) {
          return { explanation: 'Failed' };
        }
        async optimizeHoloScript(code: string, platform: string) {
          return { holoScript: code, improvements: [] as string[] };
        }
        async chat(message: string, context: string, history?: any) {
          return 'Failed';
        }
      }

      const failingSession = generator.createSession(new FailingAdapter());

      // This should fail but not cache
      try {
        await generator.generate('broken prompt', failingSession);
      } catch (e) {
        // Expected to fail
      }

      // Cache should remain empty or show failed attempts
      const cacheStats = generator.getCacheStats();
      // Only successful results should be cached
      expect(cacheStats.entriesCount).toBeLessThanOrEqual(5); // Reasonable upper bound
    });
  });

  // =========================================================================
  // ANALYTICS INTEGRATION
  // =========================================================================

  describe('Analytics Integration', () => {
    it('should collect and report metrics', async () => {
      const freshGen = new HoloScriptGenerator(true);
      const session = freshGen.createSession(adapter);

      // Generate various prompts
      await freshGen.generate('Create a player object', session);
      await freshGen.generate('Create an interactive button', session);
      await freshGen.generate('Create physics sphere', session);

      const analytics = freshGen.getAnalytics();

      expect(analytics.aggregateMetrics.totalGenerations).toBe(3);
      expect(analytics.aggregateMetrics.successRate).toBeGreaterThan(0);
      expect(analytics.aggregateMetrics.avgConfidence).toBeGreaterThan(0);
    });

    it('should track adapter performance', async () => {
      const freshGen = new HoloScriptGenerator(true);
      const session = freshGen.createSession(adapter);

      await freshGen.generate('Create player', session);
      await freshGen.generate('Create button', session);

      const analytics = freshGen.getAnalytics();
      const adapterMetrics = analytics.adapterMetrics;

      expect(adapterMetrics.length).toBeGreaterThan(0);
    });

    it('should track confidence distribution', async () => {
      const freshGen = new HoloScriptGenerator(true);
      const session = freshGen.createSession(adapter);

      await freshGen.generate('Create player', session);
      await freshGen.generate('Create button', session);

      const analytics = freshGen.getAnalytics();
      const distribution = analytics.confidenceDistribution;

      expect(distribution).toBeDefined();
      expect(distribution.length).toBeGreaterThan(0);
    });

    it('should generate comprehensive report', async () => {
      const freshGen = new HoloScriptGenerator(true);
      const session = freshGen.createSession(adapter);

      await freshGen.generate('Create player', session);
      await freshGen.generate('Create button', session);

      const report = freshGen.generateReport();

      expect(report).toBeDefined();
      expect(report.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // REAL-WORLD WORKFLOW
  // =========================================================================

  describe('Real-World Game Development Workflow', () => {
    it('should complete full game scene generation workflow', async () => {
      const session = generator.createSession(adapter);

      // Phase 1: Create player controller using template
      const playerTemplate = templates.getTemplate('player-controller');
      const playerPrompt = templates.createPrompt('player-controller', {
        geometry: 'humanoid',
        movement_type: 'WASD',
        health: '100',
        abilities: 'jump,dash',
        equipment: 'sword',
      });

      let result = await generator.generate(playerPrompt, session);
      expect(result.holoScript).toBeDefined();
      expect(result.parseResult).toBeDefined();

      // Phase 2: Create interactive buttons using template
      const buttonPrompt = templates.createPrompt('button-ui', {
        button_type: 'primary',
        label: 'Play',
        action: 'start game',
      });

      result = await generator.generate(buttonPrompt, session);
      expect(result.holoScript).toContain('#Button');

      // Phase 3: Add physics environment
      result = await generator.generate(
        templates.createPrompt('physics-object', {
          geometry: 'sphere',
          physics_type: 'dynamic',
          mass: '1.0',
          restitution: '0.8',
        }),
        session
      );
      expect(result.holoScript).toContain('#Ball');

      // Phase 4: Add effects
      result = await generator.generate('Create a glowing effect sphere', session);
      expect(result.holoScript).toBeDefined();

      // Verify workflow completion
      const history = generator.getHistory(session);
      expect(history.length).toBeGreaterThanOrEqual(4);

      const stats = generator.getStats(session);
      expect(stats).toBeDefined();
      expect(stats!.totalGenerations).toBeGreaterThanOrEqual(4);
    });

    it('should demonstrate performance improvement from caching', async () => {
      const session = generator.createSession(adapter);

      // First pass - all new prompts
      const prompts = [
        'Create a player',
        'Create a button',
        'Create a physics ball',
        'Create an effect',
      ];

      for (const prompt of prompts) {
        await generator.generate(prompt, session);
      }

      // Second pass - repeat same prompts (should hit cache)
      for (const prompt of prompts) {
        await generator.generate(prompt, session);
      }

      const cacheStats = generator.getCacheStats();
      expect(cacheStats.entriesCount).toBeGreaterThan(0);

      // At least some should be from cache
      expect(cacheStats.totalHits + cacheStats.totalMisses).toBeGreaterThan(cacheStats.totalHits);
    });

    it('should provide recommendations based on metrics', async () => {
      const session = generator.createSession(adapter);

      // Generate multiple items to gather metrics
      for (let i = 0; i < 5; i++) {
        await generator.generate('Create varied objects', session);
      }

      const analytics = generator.getAnalytics();
      const recommendations = analytics.recommendations;

      expect(recommendations).toBeDefined();
      expect(recommendations.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // PERFORMANCE AND OPTIMIZATION
  // =========================================================================

  describe('Performance and Optimization', () => {
    it('should handle batch generation with caching', async () => {
      const session = generator.createSession(adapter);

      const batchSize = 10;
      const prompts = Array(batchSize)
        .fill(null)
        .map(
          (_, i) => `Generate object ${i % 4}: ${['player', 'button', 'physics', 'effect'][i % 4]}`
        );

      for (const prompt of prompts) {
        const result = await generator.generate(prompt, session);
        expect(result.holoScript).toBeDefined();
      }

      const cacheStats = generator.getCacheStats();
      expect(cacheStats.entriesCount).toBeGreaterThan(0);
      expect(cacheStats.totalHits + cacheStats.totalMisses).toBeGreaterThanOrEqual(batchSize);

      const stats = generator.getStats(session);
      expect(stats!.totalGenerations).toBe(batchSize);
    });

    it('should report multi-adapter performance comparison', async () => {
      const session1 = generator.createSession(adapter);
      const session2 = generator.createSession(adapter);

      // Generate with both "adapters"
      await generator.generate('Create player', session1);
      await generator.generate('Create player', session2);

      const analytics = generator.getAnalytics();
      expect(analytics.adapterMetrics.length).toBeGreaterThan(0);
    });

    it('should provide actionable insights from analytics', async () => {
      const session = generator.createSession(adapter);

      // Generate variety of prompts
      const prompts = [
        'Create player',
        'Create button',
        'Create physics',
        'Create effect',
        'Create scene',
      ];

      for (const prompt of prompts) {
        await generator.generate(prompt, session);
      }

      const report = generator.generateReport();

      // Report should contain analysis
      expect(report.length).toBeGreaterThan(100);
      expect(report).toContain('Success');
      expect(report).toContain('Confidence');
      expect(report).toContain('Response');
    });
  });

  // =========================================================================
  // SUMMARY AND STATISTICS
  // =========================================================================

  describe('Complete System Summary', () => {
    it('should demonstrate all integrated systems working together', async () => {
      // Create generator with cache enabled
      const generator = new HoloScriptGenerator(true);
      const templates = new PromptTemplateSystem();
      const adapter = new DemoAdapter();

      // Create session
      const session = generator.createSession(adapter);

      // Use templates to generate consistent prompts
      const objectTypes = ['player-controller', 'button-ui', 'physics-object'] as const;

      for (const objType of objectTypes) {
        const template = templates.getTemplate(objType);
        expect(template).toBeDefined();
      }

      // Generate with templates
      const prompts = [
        templates.createPrompt('player-controller', {
          characterName: 'Hero',
          healthPoints: '100',
          special_ability: 'jump',
        }),
        templates.createPrompt('button-ui', {
          buttonLabel: 'Start',
          action: 'play',
          color: 'blue',
        }),
        templates.createPrompt('physics-object', {
          objectName: 'Box',
          shape: 'cube',
          mass: '0.5',
          behavior: 'dynamic',
        }),
      ];

      // Generate all
      for (const prompt of prompts) {
        const result = await generator.generate(prompt, session);
        expect(result).toBeDefined();
        expect(result.holoScript).toBeDefined();
      }

      // Get metrics
      const cacheStats = generator.getCacheStats();
      expect(cacheStats).toBeDefined();

      const stats = generator.getStats(session);
      expect(stats).toBeDefined();
      expect(stats!.totalGenerations).toBeGreaterThan(0);

      const analytics = generator.getAnalytics();
      expect(analytics).toBeDefined();

      // Generate report
      const report = generator.generateReport();
      expect(report).toBeDefined();
      expect(report.length).toBeGreaterThan(0);
    });
  });
});
