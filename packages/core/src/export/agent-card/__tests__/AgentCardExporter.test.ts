/**
 * Agent Card Exporter Tests
 *
 * Validates A2A Agent Card generation from HoloScript compositions.
 */

import { describe, it, expect } from 'vitest';
import { readJson } from '../../../errors/safeJsonParse';
import { AgentCardExporter } from '../AgentCardExporter';
import type { HoloComposition, HoloObjectTrait } from '../../../parser/HoloCompositionTypes';

function trait(name: string, config: Record<string, any> = {}): HoloObjectTrait {
  return { type: 'ObjectTrait', name, config };
}

function createTestComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    type: 'Composition',
    name: 'TestScene',
    templates: [],
    objects: [
      {
        type: 'ObjectDeclaration',
        name: 'cube_1',
        properties: [],
        traits: [
          trait('grabbable'),
          trait('throwable'),
          trait('physics', { mass: 2 }),
          trait('collidable'),
        ],
      } as any,
      {
        type: 'ObjectDeclaration',
        name: 'speaker_1',
        properties: [],
        traits: [trait('audio'), trait('spatial_audio')],
      } as any,
    ],
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

describe('AgentCardExporter', () => {
  it('should export a valid Agent Card from composition', () => {
    const exporter = new AgentCardExporter();
    const composition = createTestComposition();
    const result = exporter.export(composition);

    expect(result.card).toBeDefined();
    expect(result.card.id).toBe('holoscript-agent-testscene');
    expect(result.card.name).toBe('HoloScript: TestScene');
    expect(result.card.version).toBe('1.0.0');
    expect(result.card.skills.length).toBeGreaterThan(0);
  });

  it('should detect traits from composition objects', () => {
    const exporter = new AgentCardExporter();
    const composition = createTestComposition();
    const result = exporter.export(composition);

    expect(result.stats.totalTraitsDetected).toBe(6); // grabbable, throwable, physics, collidable, audio, spatial_audio
  });

  it('should map known traits to A2A skills', () => {
    const exporter = new AgentCardExporter();
    const composition = createTestComposition();
    const result = exporter.export(composition);

    const skillIds = result.card.skills.map((s) => s.id);
    expect(skillIds).toContain('vr-grab');
    expect(skillIds).toContain('vr-throw');
    expect(skillIds).toContain('physics-sim');
    expect(skillIds).toContain('collision-detect');
    expect(skillIds).toContain('audio-playback');
    expect(skillIds).toContain('spatial-audio');
  });

  it('should include input/output schemas on skills', () => {
    const exporter = new AgentCardExporter();
    const composition = createTestComposition();
    const result = exporter.export(composition);

    const grabSkill = result.card.skills.find((s) => s.id === 'vr-grab');
    expect(grabSkill).toBeDefined();
    expect(grabSkill!.inputSchema).toBeDefined();
    expect(grabSkill!.inputSchema!.type).toBe('object');
    expect(grabSkill!.inputSchema!.properties).toBeDefined();
    expect(grabSkill!.inputSchema!.required).toContain('objectId');
    expect(grabSkill!.outputSchema).toBeDefined();
  });

  it('should include examples on skills', () => {
    const exporter = new AgentCardExporter();
    const composition = createTestComposition();
    const result = exporter.export(composition);

    const grabSkill = result.card.skills.find((s) => s.id === 'vr-grab');
    expect(grabSkill!.examples).toBeDefined();
    expect(grabSkill!.examples!.length).toBeGreaterThan(0);
    expect(grabSkill!.examples![0].name).toBe('Grab a cube');
  });

  it('should apply trait filter', () => {
    const exporter = new AgentCardExporter({ traitFilter: ['grabbable', 'physics'] });
    const composition = createTestComposition();
    const result = exporter.export(composition);

    expect(result.card.skills.length).toBe(2);
    const ids = result.card.skills.map((s) => s.id);
    expect(ids).toContain('vr-grab');
    expect(ids).toContain('physics-sim');
  });

  it('should handle empty composition', () => {
    const exporter = new AgentCardExporter();
    const composition = createTestComposition({ objects: [], templates: [] });
    const result = exporter.export(composition);

    expect(result.card.skills.length).toBe(0);
    expect(result.stats.totalTraitsDetected).toBe(0);
  });

  it('should include HoloScript extension metadata', () => {
    const exporter = new AgentCardExporter({ holoscriptVersion: '4.1.0' });
    const composition = createTestComposition();
    const result = exporter.export(composition);

    const ext = result.card['x-holoscript'];
    expect(ext.compositionName).toBe('TestScene');
    expect(ext.holoscriptVersion).toBe('4.1.0');
    expect(ext.mappedTraits.length).toBe(6);
    expect(ext.objectCount).toBe(2);
    expect(ext.exportedAt).toBeDefined();
  });

  it('should generate valid JSON output', () => {
    const exporter = new AgentCardExporter();
    const composition = createTestComposition();
    const result = exporter.export(composition);

    expect(() => readJson(result.json)).not.toThrow();
    const parsed = readJson(result.json);
    expect(parsed.id).toBe(result.card.id);
  });

  it('should report supported traits', () => {
    const exporter = new AgentCardExporter();
    const supported = exporter.getSupportedTraits();

    expect(supported.length).toBe(20);
    expect(supported).toContain('grabbable');
    expect(supported).toContain('teleportable');
  });

  it('should generate generic skills for unmapped traits', () => {
    const exporter = new AgentCardExporter();
    const composition = createTestComposition({
      objects: [
        {
          type: 'ObjectDeclaration',
          name: 'custom_obj',
          properties: [],
          traits: [trait('custom_unknown_trait')],
        } as any,
      ],
    });
    const result = exporter.export(composition);

    expect(result.stats.unmappedTraits).toContain('custom_unknown_trait');
    const genericSkill = result.card.skills.find((s) => s.id === 'holoscript-custom-unknown-trait');
    expect(genericSkill).toBeDefined();
    expect(genericSkill!.tags).toContain('holoscript');
  });

  it('should include capabilities configuration', () => {
    const exporter = new AgentCardExporter({
      streaming: true,
      pushNotifications: true,
    });
    const composition = createTestComposition();
    const result = exporter.export(composition);

    expect(result.card.capabilities.streaming).toBe(true);
    expect(result.card.capabilities.pushNotifications).toBe(true);
    expect(result.card.capabilities.stateTransitionHistory).toBe(true);
  });

  it('should include authentication scheme', () => {
    const exporter = new AgentCardExporter();
    const composition = createTestComposition();
    const result = exporter.export(composition);

    expect(result.card.authentication).toBeDefined();
    expect(result.card.authentication!.schemes[0].scheme).toBe('holoscript-rbac');
  });

  it('should track export time in stats', () => {
    const exporter = new AgentCardExporter();
    const composition = createTestComposition();
    const result = exporter.export(composition);

    expect(result.stats.exportTime).toBeGreaterThanOrEqual(0);
    expect(typeof result.stats.exportTime).toBe('number');
  });
});
