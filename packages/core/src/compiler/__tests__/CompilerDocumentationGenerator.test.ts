/**
 * CompilerDocumentationGenerator Tests
 *
 * Tests triple-output documentation generation (llms.txt, .well-known/mcp, markdown)
 */

import { describe, it, expect } from 'vitest';
import { CompilerDocumentationGenerator } from '../CompilerDocumentationGenerator';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

describe('CompilerDocumentationGenerator', () => {
  const mockComposition: HoloComposition = {
    type: 'Composition',
    name: 'TestScene',
    templates: [],
    objects: [
      {
        type: 'Object',
        name: 'box1',
        shape: 'cube',
        traits: new Map([
          ['material', { color: '#ff0000' }],
          ['physics', { mass: 1.0 }],
        ]),
      },
      {
        type: 'Object',
        name: 'light1',
        shape: 'sphere',
        traits: new Map([
          ['emissive', { intensity: 2.0 }],
        ]),
      },
    ],
    spatialGroups: [],
    lights: [
      {
        type: 'Light',
        name: 'sun',
        lightType: 'directional',
        properties: [],
      },
    ],
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
    state: {
      type: 'State',
      properties: [
        {
          type: 'StateProperty',
          key: 'score',
          value: 0,
        },
        {
          type: 'StateProperty',
          key: 'playerName',
          value: 'Player1',
        },
      ],
    },
  } as any;

  describe('generate', () => {
    it('should generate all three documentation outputs', () => {
      const generator = new CompilerDocumentationGenerator({
        serviceUrl: 'https://test.example.com',
        serviceVersion: '1.0.0',
      });

      const compiledCode = 'const scene = new THREE.Scene();';
      const result = generator.generate(mockComposition, 'r3f', compiledCode);

      expect(result).toHaveProperty('llmsTxt');
      expect(result).toHaveProperty('wellKnownMcp');
      expect(result).toHaveProperty('markdownDocs');

      expect(typeof result.llmsTxt).toBe('string');
      expect(typeof result.wellKnownMcp).toBe('object');
      expect(typeof result.markdownDocs).toBe('string');
    });
  });

  describe('llms.txt generation', () => {
    it('should include scene description', () => {
      const generator = new CompilerDocumentationGenerator();
      const result = generator.generate(mockComposition, 'r3f', 'code');

      expect(result.llmsTxt).toContain('TestScene');
      expect(result.llmsTxt).toContain('Compiled for: r3f');
      expect(result.llmsTxt).toContain('Objects: 2');
      expect(result.llmsTxt).toContain('Lights: 1');
    });

    it('should include trait list grouped by category', () => {
      const generator = new CompilerDocumentationGenerator();
      const result = generator.generate(mockComposition, 'r3f', 'code');

      expect(result.llmsTxt).toContain('Traits Used');
      expect(result.llmsTxt).toContain('material');
      expect(result.llmsTxt).toContain('physics');
      expect(result.llmsTxt).toContain('emissive');
    });

    it('should include export capabilities', () => {
      const generator = new CompilerDocumentationGenerator();
      const result = generator.generate(mockComposition, 'r3f', 'code');

      expect(result.llmsTxt).toContain('Export Capabilities');
      expect(result.llmsTxt).toContain('Primary target: r3f');
      expect(result.llmsTxt).toContain('unity');
      expect(result.llmsTxt).toContain('unreal');
    });

    it('should include state management info', () => {
      const generator = new CompilerDocumentationGenerator();
      const result = generator.generate(mockComposition, 'r3f', 'code');

      expect(result.llmsTxt).toContain('State Management');
      expect(result.llmsTxt).toContain('score');
      expect(result.llmsTxt).toContain('playerName');
    });

    it('should respect max token limit', () => {
      const generator = new CompilerDocumentationGenerator({
        maxLlmsTxtTokens: 100, // Very small limit
      });
      const result = generator.generate(mockComposition, 'r3f', 'code');

      // Rough estimate: 1 token ≈ 4 characters
      const maxChars = 100 * 4;
      expect(result.llmsTxt.length).toBeLessThanOrEqual(maxChars + 50); // Small buffer for truncation message
    });

    it('should handle multi-file compilation output', () => {
      const generator = new CompilerDocumentationGenerator();
      const multiFileOutput = {
        'Scene.tsx': 'export const Scene = () => {};',
        'Materials.ts': 'export const materials = {};',
        'Physics.ts': 'export const physics = {};',
      };
      const result = generator.generate(mockComposition, 'r3f', multiFileOutput);

      expect(result.llmsTxt).toContain('API Surface');
      expect(result.llmsTxt).toContain('Generated files: 3');
      expect(result.llmsTxt).toContain('Scene.tsx');
    });
  });

  describe('.well-known/mcp generation', () => {
    it('should conform to MCP server card schema (SEP-1649)', () => {
      const generator = new CompilerDocumentationGenerator({
        serviceUrl: 'https://test.example.com',
        serviceVersion: '1.2.3',
      });
      const result = generator.generate(mockComposition, 'r3f', 'code');

      expect(result.wellKnownMcp).toMatchObject({
        mcpVersion: '2025-03-26',
        name: expect.stringMatching(/^[a-z0-9-]+$/), // Sanitized name
        version: '1.2.3',
        description: expect.any(String),
        transport: {
          type: 'streamable-http',
          url: 'https://test.example.com/mcp',
          authentication: null,
        },
        capabilities: {
          tools: {
            count: expect.any(Number),
          },
          resources: false,
          prompts: false,
        },
        tools: expect.any(Array),
        endpoints: {
          mcp: 'https://test.example.com/mcp',
          health: 'https://test.example.com/health',
          render: 'https://test.example.com/api/render',
        },
      });
    });

    it('should include MCP tool manifest (SEP-1960)', () => {
      const generator = new CompilerDocumentationGenerator();
      const result = generator.generate(mockComposition, 'r3f', 'code');

      expect(result.wellKnownMcp.tools).toBeInstanceOf(Array);
      expect(result.wellKnownMcp.tools.length).toBeGreaterThan(0);

      // Should at minimum have a compile_composition tool
      const compileTool = result.wellKnownMcp.tools.find(
        (t: any) => t.name === 'compile_composition'
      );
      expect(compileTool).toBeDefined();
      expect(compileTool).toMatchObject({
        name: 'compile_composition',
        description: expect.any(String),
        inputSchema: expect.any(Object),
      });
    });

    it('should include tools for templates', () => {
      const compositionWithTemplates: HoloComposition = {
        ...mockComposition,
        templates: [
          {
            type: 'Template',
            name: 'Button',
            properties: [],
            actions: [],
            traits: [],
          } as any,
        ],
      };

      const generator = new CompilerDocumentationGenerator();
      const result = generator.generate(compositionWithTemplates, 'r3f', 'code');

      const buttonTool = result.wellKnownMcp.tools.find(
        (t: any) => t.name === 'instantiate_button'
      );
      expect(buttonTool).toBeDefined();
    });

    it('should include state update tool when state is present', () => {
      const generator = new CompilerDocumentationGenerator();
      const result = generator.generate(mockComposition, 'r3f', 'code');

      const stateTool = result.wellKnownMcp.tools.find((t: any) => t.name === 'update_state');
      expect(stateTool).toBeDefined();
      expect(stateTool).toMatchObject({
        name: 'update_state',
        description: expect.any(String),
      });
    });

    it('should sanitize composition name for service name', () => {
      const invalidNameComposition = {
        ...mockComposition,
        name: 'My Test Scene!@#$%',
      };

      const generator = new CompilerDocumentationGenerator();
      const result = generator.generate(invalidNameComposition, 'r3f', 'code');

      expect(result.wellKnownMcp.name).toMatch(/^[a-z0-9-]+$/);
      expect(result.wellKnownMcp.name).not.toContain(' ');
      expect(result.wellKnownMcp.name).not.toContain('!');
    });
  });

  describe('markdown documentation generation', () => {
    it('should include comprehensive scene documentation', () => {
      const generator = new CompilerDocumentationGenerator();
      const result = generator.generate(mockComposition, 'r3f', 'code');

      expect(result.markdownDocs).toContain('# TestScene');
      expect(result.markdownDocs).toContain('## Overview');
      expect(result.markdownDocs).toContain('## Scene Graph');
      expect(result.markdownDocs).toContain('## Traits');
      expect(result.markdownDocs).toContain('## State Management');
      expect(result.markdownDocs).toContain('## Compilation Output');
    });

    it('should include table of contents', () => {
      const generator = new CompilerDocumentationGenerator();
      const result = generator.generate(mockComposition, 'r3f', 'code');

      expect(result.markdownDocs).toContain('## Table of Contents');
      expect(result.markdownDocs).toContain('[Overview](#overview)');
      expect(result.markdownDocs).toContain('[Scene Graph](#scene-graph)');
      expect(result.markdownDocs).toContain('[Traits](#traits)');
    });

    it('should render objects as markdown table', () => {
      const generator = new CompilerDocumentationGenerator();
      const result = generator.generate(mockComposition, 'r3f', 'code');

      expect(result.markdownDocs).toContain('| Name | Type | Position | Traits |');
      expect(result.markdownDocs).toContain('| box1 |');
      expect(result.markdownDocs).toContain('| light1 |');
    });

    it('should render state properties as markdown table', () => {
      const generator = new CompilerDocumentationGenerator();
      const result = generator.generate(mockComposition, 'r3f', 'code');

      expect(result.markdownDocs).toContain('| Property | Type | Default Value |');
      expect(result.markdownDocs).toContain('| score |');
      expect(result.markdownDocs).toContain('| playerName |');
    });

    it('should include generated timestamp', () => {
      const generator = new CompilerDocumentationGenerator();
      const result = generator.generate(mockComposition, 'r3f', 'code');

      expect(result.markdownDocs).toMatch(/\*\*Generated:\*\* \d{4}-\d{2}-\d{2}T/);
    });

    it('should group traits by category', () => {
      const generator = new CompilerDocumentationGenerator();
      const result = generator.generate(mockComposition, 'r3f', 'code');

      // Traits should be grouped into sections like ### Visual, ### Physics
      expect(result.markdownDocs).toMatch(/### (Visual|Physics|Animation|Interaction)/);
    });
  });

  describe('trait categorization', () => {
    it('should categorize visual traits correctly', () => {
      const visualComposition = {
        ...mockComposition,
        objects: [
          {
            type: 'Object',
            name: 'obj1',
            shape: 'cube',
            traits: new Map([
              ['material', {}],
              ['color', {}],
              ['texture', {}],
              ['glow', {}],
            ]),
          } as any,
        ],
      };

      const generator = new CompilerDocumentationGenerator();
      const result = generator.generate(visualComposition, 'r3f', 'code');

      expect(result.markdownDocs).toContain('### Visual');
      expect(result.markdownDocs).toContain('material');
      expect(result.markdownDocs).toContain('color');
    });

    it('should categorize physics traits correctly', () => {
      const physicsComposition = {
        ...mockComposition,
        objects: [
          {
            type: 'Object',
            name: 'obj1',
            shape: 'cube',
            traits: new Map([
              ['physics', {}],
              ['collider', {}],
              ['rigidbody', {}],
            ]),
          } as any,
        ],
      };

      const generator = new CompilerDocumentationGenerator();
      const result = generator.generate(physicsComposition, 'r3f', 'code');

      expect(result.markdownDocs).toContain('### Physics');
      expect(result.markdownDocs).toContain('physics');
      expect(result.markdownDocs).toContain('collider');
    });
  });

  describe('configuration options', () => {
    it('should use custom service URL and version', () => {
      const generator = new CompilerDocumentationGenerator({
        serviceUrl: 'https://custom.example.com',
        serviceVersion: '2.5.0',
      });
      const result = generator.generate(mockComposition, 'r3f', 'code');

      expect(result.wellKnownMcp.version).toBe('2.5.0');
      expect(result.wellKnownMcp.endpoints.mcp).toBe('https://custom.example.com/mcp');
    });

    it('should use custom MCP transport type', () => {
      const generator = new CompilerDocumentationGenerator({
        mcpTransportType: 'sse',
      });
      const result = generator.generate(mockComposition, 'r3f', 'code');

      expect(result.wellKnownMcp.transport.type).toBe('sse');
    });

    it('should include contact information when provided', () => {
      const generator = new CompilerDocumentationGenerator({
        contactRepository: 'https://github.com/test/repo',
        contactDocumentation: 'https://docs.test.com',
      });
      const result = generator.generate(mockComposition, 'r3f', 'code');

      expect(result.wellKnownMcp.contact).toMatchObject({
        repository: 'https://github.com/test/repo',
        documentation: 'https://docs.test.com',
      });
    });
  });

  describe('edge cases', () => {
    it('should handle compositions with no objects', () => {
      const emptyComposition = {
        ...mockComposition,
        objects: [],
      };

      const generator = new CompilerDocumentationGenerator();
      const result = generator.generate(emptyComposition, 'r3f', 'code');

      expect(result.llmsTxt).toContain('Objects: 0');
      expect(result.markdownDocs).toContain('0 objects');
    });

    it('should handle compositions with no state', () => {
      const noStateComposition = {
        ...mockComposition,
        state: undefined,
      };

      const generator = new CompilerDocumentationGenerator();
      const result = generator.generate(noStateComposition, 'r3f', 'code');

      expect(result.llmsTxt).not.toContain('State Management');
      expect(result.wellKnownMcp.tools.find((t: any) => t.name === 'update_state')).toBeUndefined();
    });

    it('should handle compositions with no traits', () => {
      const noTraitsComposition = {
        ...mockComposition,
        objects: [
          {
            type: 'Object',
            name: 'box',
            shape: 'cube',
            traits: new Map(),
          } as any,
        ],
      };

      const generator = new CompilerDocumentationGenerator();
      const result = generator.generate(noTraitsComposition, 'r3f', 'code');

      expect(result.llmsTxt).not.toContain('Traits Used');
    });

    it('should handle unnamed compositions', () => {
      const unnamedComposition = {
        ...mockComposition,
        name: '',
      };

      const generator = new CompilerDocumentationGenerator();
      const result = generator.generate(unnamedComposition, 'r3f', 'code');

      expect(result.llmsTxt).toContain('HoloScript Composition');
      expect(result.markdownDocs).toContain('# HoloScript Composition');
    });
  });
});
