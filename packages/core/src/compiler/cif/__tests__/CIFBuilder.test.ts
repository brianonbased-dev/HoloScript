/**
 * CIF Builder and Document Tests
 *
 * Tests the Canonical Intermediate Format document construction,
 * section ordering, cultural profile integration, and builder API.
 */

import { describe, it, expect } from 'vitest';
import {
  CIFBuilder,
  type CIFDocument,
  type CIFSection,
  type CIFSectionKind,
  type CIFPriority,
} from '../CanonicalIntermediateFormat';
import type { CulturalProfileMetadata } from '../../identity/AgentIdentity';

// ---- Helpers ----

function defaultProfile(): CulturalProfileMetadata {
  return {
    cooperation_index: 0.8,
    cultural_family: 'cooperative',
    prompt_dialect: 'directive',
  };
}

// ---- Tests ----

describe('CIFBuilder', () => {
  // ===========================================================================
  // BASIC CONSTRUCTION
  // ===========================================================================

  describe('basic construction', () => {
    it('builds a minimal CIF document', () => {
      const doc = new CIFBuilder('agent-1', 'code_generator').build();

      expect(doc.version).toBe('1.0.0');
      expect(doc.agentId).toBe('agent-1');
      expect(doc.agentRole).toBe('code_generator');
      expect(doc.sections).toHaveLength(0);
      expect(doc.culturalProfile).toBeUndefined();
      expect(doc.targetModel).toBeUndefined();
    });

    it('sets target model', () => {
      const doc = new CIFBuilder('a', 'r').forModel('claude').build();

      expect(doc.targetModel).toBe('claude');
    });

    it('sets cultural profile', () => {
      const profile = defaultProfile();
      const doc = new CIFBuilder('a', 'r').withCulturalProfile(profile).build();

      expect(doc.culturalProfile).toEqual(profile);
    });

    it('sets metadata', () => {
      const doc = new CIFBuilder('a', 'r').withMetadata({ compiledAt: '2026-03-06' }).build();

      expect(doc.metadata).toEqual({ compiledAt: '2026-03-06' });
    });
  });

  // ===========================================================================
  // SECTION HELPERS
  // ===========================================================================

  describe('section helpers', () => {
    it('addSystem creates a system section', () => {
      const doc = new CIFBuilder('a', 'r').addSystem('You are a helpful agent.').build();

      expect(doc.sections).toHaveLength(1);
      expect(doc.sections[0].kind).toBe('system');
      expect(doc.sections[0].content).toBe('You are a helpful agent.');
      expect(doc.sections[0].priority).toBe('critical');
    });

    it('addPersona creates a persona section', () => {
      const doc = new CIFBuilder('a', 'r').addPersona('Navigator agent').build();

      expect(doc.sections[0].kind).toBe('persona');
      expect(doc.sections[0].priority).toBe('high');
    });

    it('addContext creates a context section', () => {
      const doc = new CIFBuilder('a', 'r').addContext('The world has 3 zones.').build();

      expect(doc.sections[0].kind).toBe('context');
      expect(doc.sections[0].priority).toBe('normal');
    });

    it('addInstructions creates an instructions section', () => {
      const doc = new CIFBuilder('a', 'r').addInstructions('Generate navigation mesh.').build();

      expect(doc.sections[0].kind).toBe('instructions');
    });

    it('addConstraints creates a constraints section', () => {
      const doc = new CIFBuilder('a', 'r').addConstraints('Never modify geometry.').build();

      expect(doc.sections[0].kind).toBe('constraints');
    });

    it('addExamples creates an examples section', () => {
      const doc = new CIFBuilder('a', 'r')
        .addExamples([{ input: 'scene', output: 'mesh' }])
        .build();

      expect(doc.sections[0].kind).toBe('examples');
      expect(doc.sections[0].content).toEqual([{ input: 'scene', output: 'mesh' }]);
    });

    it('addOutputFormat creates an output_format section', () => {
      const schema = { type: 'object', properties: { mesh: { type: 'string' } } };
      const doc = new CIFBuilder('a', 'r').addOutputFormat(schema).build();

      expect(doc.sections[0].kind).toBe('output_format');
      expect(doc.sections[0].content).toEqual(schema);
    });

    it('addTools creates a tools section', () => {
      const tools = [{ name: 'search', description: 'Search the web' }];
      const doc = new CIFBuilder('a', 'r').addTools(tools).build();

      expect(doc.sections[0].kind).toBe('tools');
    });

    it('addDelegation creates a delegation section', () => {
      const doc = new CIFBuilder('a', 'r').addDelegation('Hand off to agent-2 when done.').build();

      expect(doc.sections[0].kind).toBe('delegation');
    });

    it('addCultural creates a cultural section', () => {
      const doc = new CIFBuilder('a', 'r').addCultural('Respect zone boundaries.').build();

      expect(doc.sections[0].kind).toBe('cultural');
    });
  });

  // ===========================================================================
  // PRIORITY OVERRIDES
  // ===========================================================================

  describe('priority overrides', () => {
    it('allows custom priority for system section', () => {
      const doc = new CIFBuilder('a', 'r').addSystem('Low priority system', 'low').build();

      expect(doc.sections[0].priority).toBe('low');
    });

    it('allows custom priority for instructions', () => {
      const doc = new CIFBuilder('a', 'r')
        .addInstructions('Optional instructions', 'optional')
        .build();

      expect(doc.sections[0].priority).toBe('optional');
    });
  });

  // ===========================================================================
  // FLUENT CHAINING
  // ===========================================================================

  describe('fluent chaining', () => {
    it('chains all section helpers', () => {
      const doc = new CIFBuilder('nav', 'code_generator')
        .withCulturalProfile(defaultProfile())
        .forModel('claude')
        .addSystem('System prompt')
        .addPersona('Navigator')
        .addContext('3 zones')
        .addInstructions('Generate mesh')
        .addConstraints('No geometry mods')
        .addExamples([{ in: 'x', out: 'y' }])
        .addOutputFormat({ type: 'object' })
        .addTools([{ name: 'scan' }])
        .addDelegation('Delegate to mapper')
        .addCultural('Respect norms')
        .build();

      expect(doc.sections).toHaveLength(10);
      expect(doc.targetModel).toBe('claude');
      expect(doc.culturalProfile?.cooperation_index).toBe(0.8);
    });

    it('preserves section insertion order', () => {
      const doc = new CIFBuilder('a', 'r')
        .addInstructions('first')
        .addSystem('second')
        .addContext('third')
        .build();

      expect(doc.sections[0].kind).toBe('instructions');
      expect(doc.sections[1].kind).toBe('system');
      expect(doc.sections[2].kind).toBe('context');
    });
  });

  // ===========================================================================
  // CUSTOM SECTIONS
  // ===========================================================================

  describe('addSection', () => {
    it('accepts a fully custom section', () => {
      const custom: CIFSection = {
        kind: 'cultural',
        label: 'Custom Cultural',
        content: 'Cooperate always',
        priority: 'critical',
        metadata: { source: 'manual' },
      };

      const doc = new CIFBuilder('a', 'r').addSection(custom).build();

      expect(doc.sections[0]).toEqual(custom);
    });
  });

  // ===========================================================================
  // IMMUTABILITY
  // ===========================================================================

  describe('immutability', () => {
    it('build returns a new sections array (not the internal one)', () => {
      const builder = new CIFBuilder('a', 'r').addSystem('test');
      const doc1 = builder.build();
      const doc2 = builder.build();

      expect(doc1.sections).not.toBe(doc2.sections);
      expect(doc1.sections).toEqual(doc2.sections);
    });
  });
});
