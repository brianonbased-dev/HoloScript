/**
 * End-to-End Scenario Tests
 *
 * Comprehensive workflow tests that validate complete user journeys:
 * - Building a game scene
 * - Creating interactive characters
 * - Designing UI systems
 * - Creating physics-based interactions
 * - Building networked multiplayer elements
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { AIAdapter } from './AIAdapter';
import { HoloScriptGenerator } from './HoloScriptGenerator';

// =============================================================================
// MOCK ADAPTER FOR E2E TESTS
// =============================================================================

class E2ETestAdapter implements AIAdapter {
  readonly id = 'e2e-test';
  readonly name = 'E2ETestAdapter';
  generatedCodes: Map<string, string> = new Map();

  isReady() {
    return true;
  }

  constructor() {
    this.setupScenarios();
  }

  private setupScenarios() {
    // Scenario 1: Basic game scene
    this.generatedCodes.set(
      'basic-scene',
      `
composition "SimpleScene" {
  environment { skybox: "default"; ambient_light: 0.5 }
  
  object "Player" {
    @grabbable
    geometry: "humanoid"
    position: [0, 1.6, 0]
    scale: 1.0
  }
  
  object "SpawnPoint" {
    @anchor
    geometry: "sphere"
    position: [0, 0, 5]
    scale: 0.5
  }
}
    `.trim()
    );

    // Scenario 2: Interactive UI
    this.generatedCodes.set(
      'interactive-ui',
      `
composition "MenuUI" {
  object "PlayButton" {
    @pointable
    geometry: "cube"
    position: [0, 1, 0]
    scale: [0.5, 0.2, 0.1]
    color: "#0077ff"
  }
  
  object "SettingsButton" {
    @pointable
    geometry: "cube"
    position: [1.5, 1, 0]
    scale: [0.5, 0.2, 0.1]
    color: "#ff7700"
  }
  
  object "ExitButton" {
    @pointable
    geometry: "cube"
    position: [3, 1, 0]
    scale: [0.5, 0.2, 0.1]
    color: "#ff0000"
  }
}
    `.trim()
    );

    // Scenario 3: Physics-based interactions
    this.generatedCodes.set(
      'physics-interactions',
      `
composition "PhysicsScene" {
  object "Ball" {
    @grabbable
    @throwable
    geometry: "sphere"
    position: [0, 2, 0]
    scale: 0.3
    physics: { mass: 1.0; restitution: 0.8 }
  }
  
  object "Ground" {
    geometry: "cube"
    position: [0, -1, 0]
    scale: [10, 1, 10]
    physics: { type: "static" }
  }
  
  object "Wall" {
    geometry: "cube"
    position: [5, 0, 0]
    scale: [0.5, 5, 10]
    physics: { type: "static" }
  }
}
    `.trim()
    );

    // Scenario 4: Networked multiplayer
    this.generatedCodes.set(
      'networked-multiplayer',
      `
composition "MultiplayerGame" {
  object "LocalPlayer" {
    @grabbable
    @networked
    geometry: "humanoid"
    position: [0, 1.6, 0]
    networked: { sync_rate: "20hz"; position: "synced" }
  }
  
  object "RemotePlayer" {
    @networked
    geometry: "humanoid"
    position: [2, 1.6, 0]
    networked: { sync_rate: "20hz"; position: "synced" }
  }
  
  object "SharedObject" {
    @grabbable
    @networked
    geometry: "cube"
    position: [0, 1, 2]
    networked: { position: "synced"; rotation: "synced" }
  }
}
    `.trim()
    );

    // Scenario 5: Complex character controller
    this.generatedCodes.set(
      'character-controller',
      `
composition "PlayerController" {
  object "Player" {
    @grabbable
    geometry: "humanoid"
    position: [0, 1.6, 0]
    scale: 1.0
  }
  
  object "DeadZone" {
    @trigger
    geometry: "cylinder"
    position: [0, -10, 0]
    scale: [20, 1, 20]
  }
  
  state {
    health: 100
    ammo: 30
    score: 0
  }
}
    `.trim()
    );

    // Scenario 6: Puzzle game mechanics
    this.generatedCodes.set(
      'puzzle-mechanics',
      `
composition "PuzzleGame" {
  object "Lever" {
    @pointable
    @clickable
    geometry: "cube"
    position: [0, 1, 0]
    scale: [0.2, 0.5, 0.2]
    color: "#ffaa00"
  }
  
  object "Door" {
    geometry: "cube"
    position: [5, 1.5, 0]
    scale: [0.5, 2, 0.1]
    color: "#888888"
  }
  
  object "LeverPuzzle" {
    @trigger
    geometry: "cylinder"
    position: [0, 1, 0]
    scale: 0.5
  }
}
    `.trim()
    );

    // Scenario 7: Animation and effects
    this.generatedCodes.set(
      'animation-effects',
      `
composition "AnimatedScene" {
  object "RotatingCube" {
    geometry: "cube"
    position: [0, 1, 0]
    scale: 0.5
    color: "#ff0000"
  }
  
  object "GlowingSphere" {
    @glowing
    geometry: "sphere"
    position: [2, 1, 0]
    scale: 0.5
    color: "#00ff00"
  }
  
  object "FloatingTorus" {
    geometry: "torus"
    position: [4, 2, 0]
    scale: 0.5
    color: "#0000ff"
  }
}
    `.trim()
    );

    // Scenario 8: Inventory system
    this.generatedCodes.set(
      'inventory-system',
      `
composition "InventoryUI" {
  object "InventorySlot1" {
    geometry: "cube"
    position: [0, 1, 0]
    scale: 0.3
  }
  
  object "InventorySlot2" {
    geometry: "cube"
    position: [0.5, 1, 0]
    scale: 0.3
  }
  
  object "InventorySlot3" {
    geometry: "cube"
    position: [1, 1, 0]
    scale: 0.3
  }
}
    `.trim()
    );

    // Scenario 9: Dialogue system
    this.generatedCodes.set(
      'dialogue-system',
      `
composition "DialogueScene" {
  object "NPC" {
    geometry: "humanoid"
    position: [2, 1.5, 0]
  }
  
  object "DialoguePanel" {
    geometry: "cube"
    position: [0, 0.5, 0]
    scale: [2, 1, 0.1]
    color: "#333333"
  }
  
  object "OptionA" {
    @pointable
    geometry: "cube"
    position: [-0.5, 0.2, 0.1]
    scale: [0.8, 0.2, 0.05]
  }
}
    `.trim()
    );

    // Scenario 10: Progression system
    this.generatedCodes.set(
      'progression-system',
      `
composition "ProgressionGame" {
  object "Level1" {
    geometry: "cube"
    position: [0, 0, 0]
    scale: 1.0
  }
  
  object "Level2" {
    geometry: "cube"
    position: [3, 0, 0]
    scale: 1.0
  }
  
  object "Boss" {
    geometry: "sphere"
    position: [6, 1, 0]
    scale: 2.0
  }
}
    `.trim()
    );
  }

  async generateHoloScript(prompt: string) {
    // Match prompt to scenario
    let code = '';

    if (prompt.includes('game') && prompt.includes('scene')) {
      code = this.generatedCodes.get('basic-scene')!;
    } else if (prompt.includes('button') || prompt.includes('menu')) {
      code = this.generatedCodes.get('interactive-ui')!;
    } else if (prompt.includes('physics') || prompt.includes('throw')) {
      code = this.generatedCodes.get('physics-interactions')!;
    } else if (prompt.includes('multiplayer') || prompt.includes('networked')) {
      code = this.generatedCodes.get('networked-multiplayer')!;
    } else if (prompt.includes('character') || prompt.includes('controller')) {
      code = this.generatedCodes.get('character-controller')!;
    } else if (prompt.includes('puzzle')) {
      code = this.generatedCodes.get('puzzle-mechanics')!;
    } else if (prompt.includes('animation') || prompt.includes('effect')) {
      code = this.generatedCodes.get('animation-effects')!;
    } else if (prompt.includes('inventory')) {
      code = this.generatedCodes.get('inventory-system')!;
    } else if (prompt.includes('dialogue')) {
      code = this.generatedCodes.get('dialogue-system')!;
    } else if (prompt.includes('progression') || prompt.includes('level')) {
      code = this.generatedCodes.get('progression-system')!;
    } else {
      code = this.generatedCodes.get('basic-scene')!;
    }

    return {
      holoScript: code,
      confidence: 0.92,
    };
  }

  async explainHoloScript(code: string) {
    return { explanation: 'Generated HoloScript composition' };
  }

  async optimizeHoloScript(code: string, platform: string) {
    return { holoScript: `// Optimized for ${platform}\n${code}`, improvements: [`Optimized for ${platform}`] };
  }

  async fixHoloScript(code: string, errors: string[]) {
    return { holoScript: code, fixes: [] as Array<{ line: number; issue: string; fix: string }> };
  }

  async chat(message: string) {
    return `Response to: ${message}`;
  }

  async getEmbeddings(texts: string[]) {
    return texts.map(() => [0.1, 0.2, 0.3]);
  }
}

// =============================================================================
// E2E TESTS
// =============================================================================

describe('End-to-End Scenarios', () => {
  let generator: HoloScriptGenerator;
  let adapter: E2ETestAdapter;

  beforeEach(() => {
    generator = new HoloScriptGenerator();
    adapter = new E2ETestAdapter();
  });

  // =========================================================================
  // SCENARIO 1: Build a Game Scene
  // =========================================================================

  describe('Scenario 1: Build a Game Scene', () => {
    it('should build complete game scene with multiple generations', async () => {
      const session = generator.createSession(adapter);

      // Step 1: Create basic scene
      const scene = await generator.generate(
        'Create a simple game scene with a player spawn point',
        session
      );
      expect(scene.parseResult).toBeDefined();
      expect(scene.holoScript).toContain('Player');

      // Step 2: Optimize for VR
      const vr = await generator.optimize(scene.holoScript, 'vr', session);
      expect(vr.holoScript).toBeDefined();

      // Step 3: Get explanation
      const explanation = await generator.explain(scene.holoScript, session);
      expect(explanation).toBeDefined();

      // Verify history
      const history = generator.getHistory(session);
      expect(history.length).toBeGreaterThan(0);
    });

    it('should track progress through scene building workflow', async () => {
      const session = generator.createSession(adapter);

      await generator.generate('building a game scene', session);

      const stats = generator.getStats(session);
      expect(stats).toBeDefined();
      expect(stats!.successRate).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // SCENARIO 2: Create Interactive UI
  // =========================================================================

  describe('Scenario 2: Create Interactive UI System', () => {
    it('should generate UI with multiple interactive elements', async () => {
      const session = generator.createSession(adapter);

      const ui = await generator.generate(
        'Create an interactive menu with buttons for play, settings, and exit',
        session
      );

      expect(ui.parseResult).toBeDefined();
      expect(ui.holoScript).toContain('Button');
    });

    it('should validate UI elements are pointable', async () => {
      const session = generator.createSession(adapter);

      const ui = await generator.generate('Create buttons', session);

      expect(ui.holoScript).toContain('@pointable');
    });
  });

  // =========================================================================
  // SCENARIO 3: Physics-Based Interactions
  // =========================================================================

  describe('Scenario 3: Physics-Based Interactions', () => {
    it('should generate physics-enabled objects', async () => {
      const session = generator.createSession(adapter);

      const physics = await generator.generate(
        'Create throwable balls and static walls with physics',
        session
      );

      expect(physics.parseResult).toBeDefined();
      expect(physics.holoScript).toContain('physics');
    });

    it('should validate throw and gravity mechanics', async () => {
      const session = generator.createSession(adapter);

      const objects = await generator.generate('physics interactions', session);

      // Should contain throwable and physics
      expect(objects.holoScript).toContain('@throwable');
      expect(objects.holoScript).toContain('physics');
      expect(objects.parseResult).toBeDefined();
    });
  });

  // =========================================================================
  // SCENARIO 4: Networked Multiplayer
  // =========================================================================

  describe('Scenario 4: Networked Multiplayer System', () => {
    it('should generate networked objects with sync', async () => {
      const session = generator.createSession(adapter);

      const multiplayer = await generator.generate(
        'Create multiplayer game with networked player controllers',
        session
      );

      expect(multiplayer.parseResult).toBeDefined();
      expect(multiplayer.holoScript).toContain('@networked');
    });

    it('should include sync configuration', async () => {
      const session = generator.createSession(adapter);

      const code = await generator.generate('networked multiplayer', session);

      expect(code.holoScript).toContain('sync_rate');
    });
  });

  // =========================================================================
  // SCENARIO 5: Character Controller
  // =========================================================================

  describe('Scenario 5: Complex Character Controller', () => {
    it('should generate full character controller', async () => {
      const session = generator.createSession(adapter);

      const controller = await generator.generate(
        'Create a player controller with health, ammo, and score tracking',
        session
      );

      expect(controller.parseResult).toBeDefined();
      expect(controller.holoScript).toContain('state');
    });

    it('should include state management', async () => {
      const session = generator.createSession(adapter);

      const code = await generator.generate('character controller', session);

      expect(code.holoScript).toContain('health');
    });
  });

  // =========================================================================
  // SCENARIO 6: Puzzle Game Mechanics
  // =========================================================================

  describe('Scenario 6: Puzzle Game Mechanics', () => {
    it('should generate puzzle mechanism with trigger zones', async () => {
      const session = generator.createSession(adapter);

      const puzzle = await generator.generate('Create a lever-operated door puzzle', session);

      expect(puzzle.parseResult.success).toBe(true);
      expect(puzzle.holoScript).toContain('@pointable');
    });

    it('should support puzzle interaction patterns', async () => {
      const session = generator.createSession(adapter);

      const code = await generator.generate('puzzle mechanics', session);

      // Puzzle should have trigger zone
      expect(code.holoScript).toContain('@trigger');
      expect(code.parseResult).toBeDefined();
    });
  });

  // =========================================================================
  // SCENARIO 7: Animation and Effects
  // =========================================================================

  describe('Scenario 7: Animation and Visual Effects', () => {
    it('should generate animated and glowing objects', async () => {
      const session = generator.createSession(adapter);

      const effects = await generator.generate(
        'Create animated objects with glowing effects',
        session
      );

      expect(effects.parseResult.success).toBe(true);
      expect(effects.holoScript).toContain('@glowing');
    });

    it('should support visual traits', async () => {
      const session = generator.createSession(adapter);

      const code = await generator.generate('animation effects', session);

      // Should have visual elements
      expect(code.holoScript).toContain('geometry');
      expect(code.parseResult).toBeDefined();
    });
  });

  // =========================================================================
  // SCENARIO 8: Inventory System
  // =========================================================================

  describe('Scenario 8: Inventory System', () => {
    it('should generate inventory UI layout', async () => {
      const session = generator.createSession(adapter);

      const inventory = await generator.generate(
        'Create an inventory UI with 3 item slots',
        session
      );

      expect(inventory.parseResult).toBeDefined();
      expect(inventory.holoScript).toContain('Slot');
    });
  });

  // =========================================================================
  // SCENARIO 9: Dialogue System
  // =========================================================================

  describe('Scenario 9: Dialogue System', () => {
    it('should generate dialogue UI with NPC', async () => {
      const session = generator.createSession(adapter);

      const dialogue = await generator.generate(
        'Create a dialogue system with NPC and conversation options',
        session
      );

      expect(dialogue.parseResult).toBeDefined();
      expect(dialogue.holoScript).toContain('NPC');
    });
  });

  // =========================================================================
  // SCENARIO 10: Progression System
  // =========================================================================

  describe('Scenario 10: Game Progression System', () => {
    it('should generate progression with levels and boss', async () => {
      const session = generator.createSession(adapter);

      const progression = await generator.generate(
        'Create a game progression system with levels and a final boss',
        session
      );

      expect(progression.parseResult).toBeDefined();
      expect(progression.holoScript).toContain('Level');
    });
  });

  // =========================================================================
  // MULTI-SCENARIO WORKFLOW
  // =========================================================================

  describe('Multi-Scenario Workflow', () => {
    it('should complete full game development workflow', async () => {
      const session = generator.createSession(adapter);

      // Build game scene
      const scene = await generator.generate('Create a game scene', session);
      expect(scene.parseResult).toBeDefined();

      // Add UI
      const ui = await generator.generate('Create UI buttons', session);
      expect(ui.parseResult).toBeDefined();

      // Add physics
      const physics = await generator.generate('Add physics interactions', session);
      expect(physics.parseResult).toBeDefined();

      // Add multiplayer
      const multiplayer = await generator.generate('Add networked players', session);
      expect(multiplayer.parseResult).toBeDefined();

      // Verify complete workflow
      const history = generator.getHistory(session);
      expect(history.length).toBe(4);

      const stats = generator.getStats(session);
      expect(stats!.totalGenerations).toBe(4);
      expect(stats!.successRate).toBeGreaterThan(0);
    });

    it('should handle scenario switching without errors', async () => {
      const session = generator.createSession(adapter);

      const scenarios = [
        'game scene',
        'interactive UI',
        'physics interactions',
        'multiplayer',
        'character controller',
        'puzzle mechanics',
        'animation effects',
        'inventory system',
        'dialogue system',
        'progression system',
      ];

      for (const scenario of scenarios) {
        const result = await generator.generate(`Create ${scenario}`, session);
        // Parser should not crash (lenient mode)
        expect(result.parseResult).toBeDefined();
        // Code should not be empty
        expect(result.holoScript.length).toBeGreaterThan(0);
      }

      const stats = generator.getStats(session);
      expect(stats!.totalGenerations).toBe(scenarios.length);
    });

    it('should generate meaningful session statistics', async () => {
      const session = generator.createSession(adapter);

      await generator.generate('scene', session);
      await generator.generate('ui', session);
      await generator.generate('physics', session);

      const stats = generator.getStats(session);

      expect(stats).toBeDefined();
      expect(stats!.totalGenerations).toBe(3);
      expect(stats!.successCount).toBeGreaterThan(0);
      expect(stats!.avgConfidence).toBeGreaterThan(0.5);
      expect(stats!.avgAttempts).toBeGreaterThan(0);
    });
  });
});
