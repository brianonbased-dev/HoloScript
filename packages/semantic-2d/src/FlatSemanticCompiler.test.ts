/**
 * FlatSemanticCompiler — Unit Tests
 *
 * Tests the V6 flat-semantic compiler that generates React Three Fiber
 * components from HoloScript compositions with semantic 2D traits.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FlatSemanticCompiler } from './FlatSemanticCompiler';
import type { HoloComposition, HoloObjectDecl } from '@holoscript/core-types/composition';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    type: 'Composition',
    name: 'TestScene',
    objects: [],
    templates: [],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
    ...overrides,
  };
}

function createObject(overrides: Partial<HoloObjectDecl> = {}): HoloObjectDecl {
  return {
    name: 'TestObj',
    properties: [],
    traits: [],
    ...overrides,
  } as HoloObjectDecl;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FlatSemanticCompiler', () => {
  let compiler: FlatSemanticCompiler;

  beforeEach(() => {
    compiler = new FlatSemanticCompiler();
  });

  describe('Basic compilation', () => {
    it('should produce a React component with the composition name', () => {
      const composition = createComposition({ name: 'Dashboard' });
      const output = compiler.compile(composition, '');
      expect(output).toContain('export function DashboardComponent()');
      expect(output).toContain('export default DashboardComponent');
    });

    it('should sanitize non-alphanumeric characters from component name', () => {
      const composition = createComposition({ name: 'My-Cool_Scene!' });
      const output = compiler.compile(composition, '');
      expect(output).toContain('export function MyCoolSceneComponent()');
    });

    it('should include React and R3F imports', () => {
      const composition = createComposition();
      const output = compiler.compile(composition, '');
      expect(output).toContain("import React");
      expect(output).toContain("from '@react-three/fiber'");
      expect(output).toContain("from '@react-three/drei'");
    });

    it('should include Canvas with orthographic camera', () => {
      const composition = createComposition();
      const output = compiler.compile(composition, '');
      expect(output).toContain('<Canvas orthographic');
      expect(output).toContain('camera=');
    });

    it('should include ProceduralField background component', () => {
      const composition = createComposition();
      const output = compiler.compile(composition, '');
      expect(output).toContain('function ProceduralField');
      expect(output).toContain('<ProceduralField');
    });

    it('should return string output by default (no docs option)', () => {
      const composition = createComposition();
      const output = compiler.compile(composition, '');
      expect(typeof output).toBe('string');
    });
  });

  describe('Semantic node generation', () => {
    it('should render a section for semantic_entity type "section"', () => {
      const composition = createComposition({
        objects: [
          createObject({
            name: 'Header',
            traits: [{ name: 'semantic_entity', config: { type: 'section' } }],
          }),
        ],
      });
      const output = compiler.compile(composition, '') as string;
      expect(output).toContain('<section');
    });

    it('should render a data-cluster as a section element', () => {
      const composition = createComposition({
        objects: [
          createObject({
            name: 'Metrics',
            traits: [{ name: 'semantic_entity', config: { type: 'data-cluster' } }],
          }),
        ],
      });
      const output = compiler.compile(composition, '') as string;
      expect(output).toContain('<section');
    });

    it('should render a metric-card with lift-card styling', () => {
      const composition = createComposition({
        objects: [
          createObject({
            name: 'RevenueCard',
            traits: [{ name: 'semantic_entity', config: { type: 'metric-card' } }],
          }),
        ],
      });
      const output = compiler.compile(composition, '') as string;
      expect(output).toContain('lift-card');
      expect(output).toContain('bg-white/5');
    });

    it('should render a link element when link trait is present', () => {
      const composition = createComposition({
        objects: [
          createObject({
            name: 'NavLink',
            traits: [
              { name: 'semantic_entity', config: { type: 'generic' } },
              { name: 'link', config: { href: 'https://holoscript.net' } },
            ],
          }),
        ],
      });
      const output = compiler.compile(composition, '') as string;
      expect(output).toContain('<a href="https://holoscript.net"');
    });

    it('should render an img element when image trait is present', () => {
      const composition = createComposition({
        objects: [
          createObject({
            name: 'Logo',
            traits: [
              { name: 'image', config: { src: '/logo.png', alt: 'HoloScript Logo' } },
            ],
          }),
        ],
      });
      const output = compiler.compile(composition, '') as string;
      expect(output).toContain('<img src="/logo.png"');
      expect(output).toContain('alt="HoloScript Logo"');
    });
  });

  describe('Layout flow mapping', () => {
    it('should apply cluster flow classes', () => {
      const composition = createComposition({
        objects: [
          createObject({
            traits: [
              { name: 'semantic_entity', config: { type: 'generic' } },
              { name: 'semantic_layout', config: { flow: 'cluster' } },
            ],
          }),
        ],
      });
      const output = compiler.compile(composition, '') as string;
      expect(output).toContain('flex flex-wrap gap-4 justify-center');
    });

    it('should apply priority flow classes', () => {
      const composition = createComposition({
        objects: [
          createObject({
            traits: [
              { name: 'semantic_entity', config: { type: 'generic' } },
              { name: 'semantic_layout', config: { flow: 'priority' } },
            ],
          }),
        ],
      });
      const output = compiler.compile(composition, '') as string;
      expect(output).toContain('flex flex-col gap-3');
    });

    it('should apply radial flow classes with rounded border', () => {
      const composition = createComposition({
        objects: [
          createObject({
            traits: [
              { name: 'semantic_entity', config: { type: 'generic' } },
              { name: 'semantic_layout', config: { flow: 'radial' } },
            ],
          }),
        ],
      });
      const output = compiler.compile(composition, '') as string;
      expect(output).toContain('grid place-items-center');
      expect(output).toContain('rounded-full');
    });

    it('should default to flex-row for semantic flow', () => {
      const composition = createComposition({
        objects: [
          createObject({
            traits: [
              { name: 'semantic_entity', config: { type: 'generic' } },
              { name: 'semantic_layout', config: { flow: 'semantic' } },
            ],
          }),
        ],
      });
      const output = compiler.compile(composition, '') as string;
      expect(output).toContain('flex flex-row gap-4');
    });

    it('should apply custom spacing from layout config', () => {
      const composition = createComposition({
        objects: [
          createObject({
            traits: [
              { name: 'semantic_entity', config: { type: 'generic' } },
              { name: 'semantic_layout', config: { flow: 'cluster', spacing: 24 } },
            ],
          }),
        ],
      });
      const output = compiler.compile(composition, '') as string;
      expect(output).toContain('p-[24px]');
    });
  });

  describe('Agent attention and intent traits', () => {
    it('should show agent swarm indicator for agent_attention trait', () => {
      const composition = createComposition({
        objects: [
          createObject({
            traits: [
              { name: 'semantic_entity', config: { type: 'generic' } },
              { name: 'agent_attention', config: { swarm_size: 5 } },
            ],
          }),
        ],
      });
      const output = compiler.compile(composition, '') as string;
      expect(output).toContain('Agent Swarm Active');
      expect(output).toContain('animate-pulse');
    });

    it('should add bounty onClick when bounty_threshold is set', () => {
      const composition = createComposition({
        objects: [
          createObject({
            traits: [
              { name: 'semantic_entity', config: { type: 'generic' } },
              { name: 'agent_attention', config: { bounty_threshold: 100 } },
            ],
          }),
        ],
      });
      const output = compiler.compile(composition, '') as string;
      expect(output).toContain('Bounty Negotiated: 100 credits');
    });

    it('should add intent onClick when intent_driven trait is present', () => {
      const composition = createComposition({
        objects: [
          createObject({
            traits: [
              { name: 'semantic_entity', config: { type: 'generic' } },
              { name: 'intent_driven', config: { intents: ['navigate'] } },
            ],
          }),
        ],
      });
      const output = compiler.compile(composition, '') as string;
      expect(output).toContain("Intent Emitted: navigate");
    });
  });

  describe('Tailwind and text traits', () => {
    it('should include tailwind classes in output', () => {
      const composition = createComposition({
        objects: [
          createObject({
            traits: [
              { name: 'semantic_entity', config: { type: 'generic' } },
              { name: 'tailwind', config: { classes: 'p-4 bg-blue-500 text-white' } },
            ],
          }),
        ],
      });
      const output = compiler.compile(composition, '') as string;
      expect(output).toContain('p-4 bg-blue-500 text-white');
    });

    it('should render text content from text trait', () => {
      const composition = createComposition({
        objects: [
          createObject({
            traits: [
              { name: 'semantic_entity', config: { type: 'generic' } },
              { name: 'text', config: { content: 'Hello World' } },
            ],
          }),
        ],
      });
      const output = compiler.compile(composition, '') as string;
      expect(output).toContain('Hello World');
    });
  });

  describe('Nested children', () => {
    it('should recursively compile child objects', () => {
      const composition = createComposition({
        objects: [
          createObject({
            name: 'Parent',
            traits: [{ name: 'semantic_entity', config: { type: 'section' } }],
            children: [
              createObject({
                name: 'Child',
                traits: [{ name: 'semantic_entity', config: { type: 'metric-card' } }],
              }),
            ],
          }),
        ],
      });
      const output = compiler.compile(composition, '') as string;
      expect(output).toContain('<section');
      expect(output).toContain('lift-card');
    });
  });

  describe('UI elements fallback', () => {
    it('should use composition.ui.elements when objects is empty', () => {
      const composition = createComposition({
        objects: [],
        ui: {
          elements: [
            createObject({
              name: 'UiElement',
              traits: [{ name: 'semantic_entity', config: { type: 'metric-card' } }],
            }),
          ],
        },
      });
      const output = compiler.compile(composition, '') as string;
      expect(output).toContain('lift-card');
    });
  });

  describe('No token (backwards compatible)', () => {
    it('should compile without an agent token', () => {
      const composition = createComposition({ name: 'NoAuth' });
      const output = compiler.compile(composition, '');
      expect(output).toContain('NoAuthComponent');
    });
  });
});
