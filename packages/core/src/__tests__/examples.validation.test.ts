/**
 * Examples Validation Tests
 *
 * Validates that all example .holo files exist, are readable,
 * and contain valid HoloScript syntax.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';

const EXAMPLES_ROOT = resolve(__dirname, '../../../../examples');

/**
 * Example metadata structure
 */
interface ExampleMetadata {
  name: string;
  category: 'general' | 'specialized';
  path: string;
  holoFile: string;
  expectedLines: number; // Approximate expected line count
  platforms: string[];
}

/**
 * Catalog of all examples to validate
 */
const EXAMPLES: ExampleMetadata[] = [
  // General Examples
  {
    name: 'VR Training Simulation',
    category: 'general',
    path: 'general/vr-training-simulation',
    holoFile: 'workplace-safety.holo',
    expectedLines: 600,
    platforms: ['unity', 'unreal', 'godot', 'webxr'],
  },
  {
    name: 'AR Furniture Preview',
    category: 'general',
    path: 'general/ar-furniture-preview',
    holoFile: 'furniture-catalog.holo',
    expectedLines: 870,
    platforms: ['arkit', 'arcore', 'webxr'],
  },
  {
    name: 'Virtual Art Gallery',
    category: 'general',
    path: 'general/virtual-art-gallery',
    holoFile: 'museum-exhibition.holo',
    expectedLines: 880,
    platforms: ['unity', 'unreal', 'babylonjs', 'webxr'],
  },
  {
    name: 'VR Game Demo',
    category: 'general',
    path: 'general/vr-game-demo',
    holoFile: 'target-practice.holo',
    expectedLines: 800,
    platforms: ['unity', 'unreal', 'godot'],
  },
  // Specialized Examples
  {
    name: 'Robotics Simulation',
    category: 'specialized',
    path: 'specialized/robotics',
    holoFile: 'robot-arm-simulation.holo',
    expectedLines: 780,
    platforms: ['urdf', 'sdf', 'gazebo', 'ros2'],
  },
  {
    name: 'IoT Digital Twin',
    category: 'specialized',
    path: 'specialized/iot',
    holoFile: 'smart-factory-twin.holo',
    expectedLines: 700,
    platforms: ['dtdl', 'azure'],
  },
  {
    name: 'Multiplayer VR',
    category: 'specialized',
    path: 'specialized/multiplayer',
    holoFile: 'vr-meeting-space.holo',
    expectedLines: 600,
    platforms: ['photon', 'mirror', 'webrtc'],
  },
  {
    name: 'Unity Quest',
    category: 'specialized',
    path: 'specialized/unity-quest',
    holoFile: 'quest-obstacle-course.holo',
    expectedLines: 800,
    platforms: ['unity-quest', 'unity-pcvr', 'photon'],
  },
  {
    name: 'VRChat World',
    category: 'specialized',
    path: 'specialized/vrchat',
    holoFile: 'social-hub-world.holo',
    expectedLines: 900,
    platforms: ['vrchat', 'udon'],
  },
];

describe('Examples Validation', () => {
  describe('Example Files Exist', () => {
    EXAMPLES.forEach((example) => {
      it(`should have ${example.name} .holo file`, () => {
        const holoPath = join(EXAMPLES_ROOT, example.path, example.holoFile);
        expect(existsSync(holoPath), `Missing: ${holoPath}`).toBe(true);
      });

      it(`should have ${example.name} README.md`, () => {
        const readmePath = join(EXAMPLES_ROOT, example.path, 'README.md');
        expect(existsSync(readmePath), `Missing: ${readmePath}`).toBe(true);
      });

      it(`should have ${example.name} TUTORIAL.md`, () => {
        const tutorialPath = join(EXAMPLES_ROOT, example.path, 'TUTORIAL.md');
        expect(existsSync(tutorialPath), `Missing: ${tutorialPath}`).toBe(true);
      });
    });
  });

  describe('HoloScript File Contents', () => {
    EXAMPLES.forEach((example) => {
      it(`${example.name} should have valid composition header`, () => {
        const holoPath = join(EXAMPLES_ROOT, example.path, example.holoFile);
        const content = readFileSync(holoPath, 'utf-8');

        // Should start with composition
        expect(content).toMatch(/composition\s+["'][\w\s]+["']\s*{/);
      });

      it(`${example.name} should have metadata block`, () => {
        const holoPath = join(EXAMPLES_ROOT, example.path, example.holoFile);
        const content = readFileSync(holoPath, 'utf-8');

        // Should have metadata
        expect(content).toContain('metadata');
        expect(content).toMatch(/name:\s*["']/);
        expect(content).toMatch(/description:\s*["']/);
      });

      it(`${example.name} should have reasonable file size`, () => {
        const holoPath = join(EXAMPLES_ROOT, example.path, example.holoFile);
        const content = readFileSync(holoPath, 'utf-8');
        const lines = content.split('\n').length;

        // Should be within ±30% of expected line count
        const minLines = Math.floor(example.expectedLines * 0.7);
        const maxLines = Math.ceil(example.expectedLines * 1.3);

        expect(lines).toBeGreaterThanOrEqual(minLines);
        expect(lines).toBeLessThanOrEqual(maxLines);
      });

      it(`${example.name} should have matching closing brace`, () => {
        const holoPath = join(EXAMPLES_ROOT, example.path, example.holoFile);
        const content = readFileSync(holoPath, 'utf-8');

        // Count opening and closing braces (simple check)
        const openBraces = (content.match(/{/g) || []).length;
        const closeBraces = (content.match(/}/g) || []).length;

        expect(closeBraces).toBe(openBraces);
      });
    });
  });

  describe('README Documentation', () => {
    EXAMPLES.forEach((example) => {
      it(`${example.name} README should have "Quick Start" section`, () => {
        const readmePath = join(EXAMPLES_ROOT, example.path, 'README.md');
        const content = readFileSync(readmePath, 'utf-8');

        expect(content).toMatch(/##\s+Quick\s+Start/i);
      });

      it(`${example.name} README should have "Features" section`, () => {
        const readmePath = join(EXAMPLES_ROOT, example.path, 'README.md');
        const content = readFileSync(readmePath, 'utf-8');

        expect(content).toMatch(/##\s+(Features|Overview)/i);
      });

      it(`${example.name} README should reference compilation targets`, () => {
        const readmePath = join(EXAMPLES_ROOT, example.path, 'README.md');
        const content = readFileSync(readmePath, 'utf-8');

        // Should mention at least one platform
        const hasPlatform = example.platforms.some(platform =>
          content.toLowerCase().includes(platform.toLowerCase())
        );

        expect(hasPlatform).toBe(true);
      });
    });
  });

  describe('TUTORIAL Documentation', () => {
    EXAMPLES.forEach((example) => {
      it(`${example.name} TUTORIAL should have "Key Concepts" section`, () => {
        const tutorialPath = join(EXAMPLES_ROOT, example.path, 'TUTORIAL.md');
        const content = readFileSync(tutorialPath, 'utf-8');

        expect(content).toMatch(/##\s+Key\s+Concepts/i);
      });

      it(`${example.name} TUTORIAL should have code examples`, () => {
        const tutorialPath = join(EXAMPLES_ROOT, example.path, 'TUTORIAL.md');
        const content = readFileSync(tutorialPath, 'utf-8');

        // Should have fenced code blocks
        expect(content).toMatch(/```holoscript/);
      });

      it(`${example.name} TUTORIAL should have "Best Practices" or "Workflow" section`, () => {
        const tutorialPath = join(EXAMPLES_ROOT, example.path, 'TUTORIAL.md');
        const content = readFileSync(tutorialPath, 'utf-8');

        expect(content).toMatch(/##\s+(Best\s+Practices|Workflow)/i);
      });
    });
  });

  describe('Examples Index', () => {
    it('should have examples/README.md', () => {
      const indexPath = join(EXAMPLES_ROOT, 'README.md');
      expect(existsSync(indexPath)).toBe(true);
    });

    it('should have examples/INDEX.md catalog', () => {
      const catalogPath = join(EXAMPLES_ROOT, 'INDEX.md');
      expect(existsSync(catalogPath)).toBe(true);
    });

    it('examples/README.md should list all examples', () => {
      const indexPath = join(EXAMPLES_ROOT, 'README.md');
      const content = readFileSync(indexPath, 'utf-8');

      // Should mention all examples
      EXAMPLES.forEach((example) => {
        expect(content).toContain(example.name);
      });
    });

    it('examples/INDEX.md should have quick reference table', () => {
      const catalogPath = join(EXAMPLES_ROOT, 'INDEX.md');
      const content = readFileSync(catalogPath, 'utf-8');

      expect(content).toMatch(/##\s+Quick\s+Reference/i);
      expect(content).toContain('| # | Example |'); // Table header
    });
  });

  describe('Example Categories', () => {
    it('should have 4 general examples', () => {
      const generalExamples = EXAMPLES.filter(e => e.category === 'general');
      expect(generalExamples.length).toBe(4);
    });

    it('should have 5 specialized examples', () => {
      const specializedExamples = EXAMPLES.filter(e => e.category === 'specialized');
      expect(specializedExamples.length).toBe(5);
    });

    it('general examples should target common platforms', () => {
      const generalExamples = EXAMPLES.filter(e => e.category === 'general');

      generalExamples.forEach((example) => {
        // General examples should target at least one mainstream platform
        const hasMainstream = example.platforms.some(p =>
          ['unity', 'unreal', 'godot', 'webxr', 'arkit', 'arcore'].includes(p)
        );

        expect(hasMainstream, `${example.name} should target mainstream platforms`).toBe(true);
      });
    });

    it('specialized examples should target niche platforms', () => {
      const specializedExamples = EXAMPLES.filter(e => e.category === 'specialized');

      specializedExamples.forEach((example) => {
        // Specialized examples should target specialized platforms
        const hasSpecialized = example.platforms.some(p =>
          ['urdf', 'sdf', 'dtdl', 'photon', 'vrchat', 'udon', 'ros2', 'gazebo'].includes(p)
        );

        expect(hasSpecialized, `${example.name} should target specialized platforms`).toBe(true);
      });
    });
  });

  describe('Syntax Validation (Basic)', () => {
    EXAMPLES.forEach((example) => {
      it(`${example.name} should not have obvious syntax errors`, () => {
        const holoPath = join(EXAMPLES_ROOT, example.path, example.holoFile);
        const content = readFileSync(holoPath, 'utf-8');

        // Basic syntax checks
        // 1. Should not have unmatched quotes
        const doubleQuotes = (content.match(/"/g) || []).length;
        expect(doubleQuotes % 2).toBe(0);

        // 2. Should not have unmatched parentheses
        const openParens = (content.match(/\(/g) || []).length;
        const closeParens = (content.match(/\)/g) || []).length;
        expect(closeParens).toBe(openParens);

        // 3. Should not have unmatched square brackets
        const openBrackets = (content.match(/\[/g) || []).length;
        const closeBrackets = (content.match(/\]/g) || []).length;
        expect(closeBrackets).toBe(openBrackets);
      });
    });
  });
});
