/**
 * Unified Trait Definition Tests
 *
 * Gap 2: Validates the unified trait registry.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UnifiedTraitRegistry } from '../TraitDefinition';
import type { TraitDefinition } from '../TraitDefinition';

describe('UnifiedTraitRegistry', () => {
  let registry: UnifiedTraitRegistry;

  const grabbableTrait: TraitDefinition = {
    id: 'grabbable',
    namespace: '@holoscript',
    category: 'interaction',
    description: 'VR grab mechanics',
    properties: [
      { name: 'snap_to_hand', type: 'boolean', default: false },
    ],
    compileHints: [
      { target: 'r3f', supported: true },
      { target: 'unity', supported: true },
    ],
    composable: ['throwable', 'pointable'],
    conflicts: ['static'],
    source: 'holoscript',
    since: '2.0.0',
  };

  const llmAgentTrait: TraitDefinition = {
    id: 'llm_agent',
    namespace: '@holoscript',
    category: 'agent',
    description: 'LLM-powered NPC agent',
    properties: [
      { name: 'model', type: 'string', default: 'gpt-4' },
      { name: 'temperature', type: 'number', default: 0.7, range: [0, 2] },
    ],
    compileHints: [],
    composable: ['dialogue', 'memory'],
    conflicts: [],
    source: 'holoscript',
    training: {
      difficulty: 'advanced',
      categories: ['ai-agents'],
      exampleCount: 150,
      qualityScore: 88,
    },
  };

  beforeEach(() => {
    registry = new UnifiedTraitRegistry();
  });

  it('starts empty', () => {
    expect(registry.size).toBe(0);
  });

  it('registers and retrieves traits', () => {
    registry.register(grabbableTrait);
    expect(registry.has('grabbable')).toBe(true);
    expect(registry.get('grabbable')).toEqual(grabbableTrait);
  });

  it('registers bulk traits', () => {
    registry.registerBulk([grabbableTrait, llmAgentTrait]);
    expect(registry.size).toBe(2);
  });

  it('gets traits by category', () => {
    registry.registerBulk([grabbableTrait, llmAgentTrait]);
    const interactions = registry.getByCategory('interaction');
    expect(interactions).toHaveLength(1);
    expect(interactions[0].id).toBe('grabbable');
  });

  it('gets traits by source', () => {
    registry.registerBulk([grabbableTrait, llmAgentTrait]);
    const hsTraits = registry.getBySource('holoscript');
    expect(hsTraits).toHaveLength(2);
  });

  it('gets traits with training data', () => {
    registry.registerBulk([grabbableTrait, llmAgentTrait]);
    const withTraining = registry.getWithTrainingData();
    expect(withTraining).toHaveLength(1);
    expect(withTraining[0].id).toBe('llm_agent');
  });

  it('gets deprecated traits', () => {
    const deprecatedTrait: TraitDefinition = {
      ...grabbableTrait,
      id: 'old_trait',
      deprecated: { since: '2.0.0', replacement: 'new_trait' },
    };
    registry.register(deprecatedTrait);
    expect(registry.getDeprecated()).toHaveLength(1);
  });

  it('finds composable partners', () => {
    const throwable: TraitDefinition = {
      ...grabbableTrait,
      id: 'throwable',
      composable: ['grabbable'],
    };
    registry.registerBulk([grabbableTrait, throwable]);
    const partners = registry.getComposablePartners('grabbable');
    expect(partners.some(p => p.id === 'throwable')).toBe(true);
  });

  it('generates summary', () => {
    registry.registerBulk([grabbableTrait, llmAgentTrait]);
    const summary = registry.getSummary();
    expect(summary.totalTraits).toBe(2);
    expect(summary.byCategory['interaction']).toBe(1);
    expect(summary.byCategory['agent']).toBe(1);
    expect(summary.withTrainingData).toBe(1);
  });

  it('exports and imports JSON', () => {
    registry.registerBulk([grabbableTrait, llmAgentTrait]);
    const json = registry.toJSON();

    const newRegistry = new UnifiedTraitRegistry();
    newRegistry.fromJSON(json);
    expect(newRegistry.size).toBe(2);
    expect(newRegistry.has('grabbable')).toBe(true);
  });

  it('clears all entries', () => {
    registry.register(grabbableTrait);
    registry.clear();
    expect(registry.size).toBe(0);
  });
});
