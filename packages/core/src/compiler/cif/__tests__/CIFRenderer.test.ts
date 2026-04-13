/**
 * CIF Renderer Tests
 *
 * Tests model-specific renderers (Claude, GPT, Gemini, Generic) and
 * the renderer registry dispatch logic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ClaudeRenderer,
  GPTRenderer,
  GeminiRenderer,
  GenericRenderer,
  CIFRendererRegistry,
  getCIFRendererRegistry,
  resetCIFRendererRegistry,
  type RenderedPrompt,
  type ICIFRenderer,
} from '../CIFRenderer';
import { CIFBuilder, type CIFDocument, type CIFTargetModel } from '../CanonicalIntermediateFormat';
import type { CulturalProfileMetadata } from '@holoscript/platform';

// ---- Helpers ----

function coopProfile(): CulturalProfileMetadata {
  return {
    cooperation_index: 0.9,
    cultural_family: 'cooperative',
    prompt_dialect: 'directive',
  };
}

function competitiveProfile(): CulturalProfileMetadata {
  return {
    cooperation_index: 0.1,
    cultural_family: 'competitive',
    prompt_dialect: 'structured',
  };
}

function buildTestDoc(model?: CIFTargetModel, profile?: CulturalProfileMetadata): CIFDocument {
  const builder = new CIFBuilder('test-agent', 'code_generator')
    .addSystem('You are a spatial computing agent.')
    .addPersona('Navigator')
    .addContext('The world has forests and mountains.')
    .addInstructions('Generate a navigation mesh.')
    .addConstraints('Never modify existing geometry.')
    .addExamples([{ input: 'forest', output: 'mesh_forest' }])
    .addOutputFormat({ type: 'object', properties: { mesh: { type: 'string' } } })
    .addTools([{ name: 'scan', description: 'Scan terrain' }])
    .addCultural('Respect zone boundaries.');

  if (model) builder.forModel(model);
  if (profile) builder.withCulturalProfile(profile);

  return builder.build();
}

// ---- Tests ----

describe('ClaudeRenderer', () => {
  const renderer = new ClaudeRenderer();

  it('has correct target model', () => {
    expect(renderer.targetModel).toBe('claude');
  });

  it('renders all sections with XML tags', () => {
    const doc = buildTestDoc('claude');
    const result = renderer.render(doc);

    expect(result.targetModel).toBe('claude');
    expect(result.systemPrompt).toContain('<persona>');
    expect(result.systemPrompt).toContain('</persona>');
    expect(result.systemPrompt).toContain('<context>');
    expect(result.systemPrompt).toContain('</context>');
    expect(result.systemPrompt).toContain('<instructions>');
    expect(result.systemPrompt).toContain('</instructions>');
    expect(result.systemPrompt).toContain('<constraints>');
    expect(result.systemPrompt).toContain('</constraints>');
    expect(result.systemPrompt).toContain('<examples>');
    expect(result.systemPrompt).toContain('</examples>');
    expect(result.systemPrompt).toContain('<available-tools>');
    expect(result.systemPrompt).toContain('<cultural-norms>');
    expect(result.systemPrompt).toContain('<output-format>');
  });

  it('includes system content directly (not in XML)', () => {
    const doc = buildTestDoc('claude');
    const result = renderer.render(doc);
    expect(result.systemPrompt).toContain('You are a spatial computing agent.');
  });

  it('renders cultural profile with XML tags', () => {
    const doc = buildTestDoc('claude', coopProfile());
    const result = renderer.render(doc);

    expect(result.systemPrompt).toContain('<cultural-identity>');
    expect(result.systemPrompt).toContain('</cultural-identity>');
    expect(result.systemPrompt).toContain('highly cooperative');
    expect(result.systemPrompt).toContain('cooperative protocols');
    expect(result.systemPrompt).toContain('imperative directives');
  });

  it('renders competitive cultural profile differently', () => {
    const doc = buildTestDoc('claude', competitiveProfile());
    const result = renderer.render(doc);

    expect(result.systemPrompt).toContain('competitive agent');
    expect(result.systemPrompt).toContain('competitive protocols');
    expect(result.systemPrompt).toContain('structured data formats');
  });

  it('sets model hints for Claude', () => {
    const doc = buildTestDoc('claude');
    const result = renderer.render(doc);

    expect(result.modelHints?.supportsXMLTags).toBe(true);
    expect(result.modelHints?.supportsToolUse).toBe(true);
  });

  it('tracks rendered sections', () => {
    const doc = buildTestDoc('claude', coopProfile());
    const result = renderer.render(doc);

    expect(result.renderedSections).toContain('system');
    expect(result.renderedSections).toContain('persona');
    expect(result.renderedSections).toContain('context');
    expect(result.renderedSections).toContain('instructions');
    expect(result.renderedSections).toContain('cultural');
  });
});

describe('GPTRenderer', () => {
  const renderer = new GPTRenderer();

  it('has correct target model', () => {
    expect(renderer.targetModel).toBe('gpt');
  });

  it('renders sections with markdown headers', () => {
    const doc = buildTestDoc('gpt');
    const result = renderer.render(doc);

    expect(result.targetModel).toBe('gpt');
    expect(result.systemPrompt).toContain('## Persona');
    expect(result.systemPrompt).toContain('## Context');
    expect(result.systemPrompt).toContain('## Instructions');
    expect(result.systemPrompt).toContain('## Constraints');
    expect(result.systemPrompt).toContain('## Examples');
    expect(result.systemPrompt).toContain('## Cultural Norms');
    expect(result.systemPrompt).toContain('## Output Format');
  });

  it('renders cultural profile with markdown header', () => {
    const doc = buildTestDoc('gpt', coopProfile());
    const result = renderer.render(doc);

    expect(result.systemPrompt).toContain('## Cultural Identity');
    expect(result.systemPrompt).toContain('highly cooperative');
  });

  it('extracts tools into modelHints', () => {
    const doc = buildTestDoc('gpt');
    const result = renderer.render(doc);

    expect(result.modelHints?.supportsFunctionCalling).toBe(true);
    expect(result.modelHints?.toolDefinitions).toBeDefined();
    const tools = result.modelHints?.toolDefinitions as unknown[];
    expect(tools).toHaveLength(1);
  });

  it('sets model hints for GPT', () => {
    const doc = buildTestDoc('gpt');
    const result = renderer.render(doc);

    expect(result.modelHints?.supportsMarkdown).toBe(true);
  });
});

describe('GeminiRenderer', () => {
  const renderer = new GeminiRenderer();

  it('has correct target model', () => {
    expect(renderer.targetModel).toBe('gemini');
  });

  it('renders sections with labeled blocks', () => {
    const doc = buildTestDoc('gemini');
    const result = renderer.render(doc);

    expect(result.targetModel).toBe('gemini');
    expect(result.systemPrompt).toContain('[ROLE]');
    expect(result.systemPrompt).toContain('[END ROLE]');
    expect(result.systemPrompt).toContain('[CONTEXT]');
    expect(result.systemPrompt).toContain('[END CONTEXT]');
    expect(result.systemPrompt).toContain('[TASK]');
    expect(result.systemPrompt).toContain('[END TASK]');
    expect(result.systemPrompt).toContain('[CONSTRAINTS]');
    expect(result.systemPrompt).toContain('[END CONSTRAINTS]');
  });

  it('renders cultural profile with BEHAVIORAL GUIDELINES block', () => {
    const doc = buildTestDoc('gemini', coopProfile());
    const result = renderer.render(doc);

    expect(result.systemPrompt).toContain('[BEHAVIORAL GUIDELINES]');
    expect(result.systemPrompt).toContain('[END BEHAVIORAL GUIDELINES]');
    expect(result.systemPrompt).toContain('highly cooperative');
  });

  it('extracts tools into functionDeclarations', () => {
    const doc = buildTestDoc('gemini');
    const result = renderer.render(doc);

    expect(result.modelHints?.supportsFunctionDeclarations).toBe(true);
    expect(result.modelHints?.functionDeclarations).toBeDefined();
  });
});

describe('GenericRenderer', () => {
  const renderer = new GenericRenderer();

  it('has correct target model', () => {
    expect(renderer.targetModel).toBe('generic');
  });

  it('renders sections with simple delimiters', () => {
    const doc = buildTestDoc('generic');
    const result = renderer.render(doc);

    expect(result.targetModel).toBe('generic');
    expect(result.systemPrompt).toContain('--- System ---');
    expect(result.systemPrompt).toContain('--- Persona ---');
    expect(result.systemPrompt).toContain('--- Context ---');
    expect(result.systemPrompt).toContain('--- Instructions ---');
  });

  it('renders cultural preamble with simple delimiter', () => {
    const doc = buildTestDoc('generic', coopProfile());
    const result = renderer.render(doc);

    expect(result.systemPrompt).toContain('--- Cultural Identity ---');
    expect(result.systemPrompt).toContain('highly cooperative');
  });
});

// =============================================================================
// RENDERER REGISTRY
// =============================================================================

describe('CIFRendererRegistry', () => {
  let registry: CIFRendererRegistry;

  beforeEach(() => {
    registry = new CIFRendererRegistry();
  });

  it('has built-in renderers for all models', () => {
    const models = registry.getRegisteredModels();
    expect(models).toContain('claude');
    expect(models).toContain('gpt');
    expect(models).toContain('gemini');
    expect(models).toContain('generic');
  });

  it('dispatches to correct renderer by target model', () => {
    const doc = buildTestDoc('claude', coopProfile());
    const result = registry.renderDocument(doc);
    expect(result.targetModel).toBe('claude');
    expect(result.systemPrompt).toContain('<cultural-identity>');
  });

  it('falls back to generic renderer for unknown model', () => {
    const doc = buildTestDoc(undefined);
    const result = registry.renderDocument(doc);
    expect(result.targetModel).toBe('generic');
  });

  it('allows registering custom renderers', () => {
    const customRenderer: ICIFRenderer = {
      targetModel: 'claude' as CIFTargetModel,
      render: (doc: CIFDocument) => ({
        systemPrompt: 'CUSTOM',
        targetModel: 'claude' as CIFTargetModel,
        renderedSections: [],
      }),
    };

    registry.register(customRenderer);
    const doc = buildTestDoc('claude');
    const result = registry.renderDocument(doc);
    expect(result.systemPrompt).toBe('CUSTOM');
  });
});

// =============================================================================
// GLOBAL REGISTRY
// =============================================================================

describe('getCIFRendererRegistry', () => {
  beforeEach(() => {
    resetCIFRendererRegistry();
  });

  it('returns singleton instance', () => {
    const a = getCIFRendererRegistry();
    const b = getCIFRendererRegistry();
    expect(a).toBe(b);
  });

  it('reset creates new instance', () => {
    const a = getCIFRendererRegistry();
    resetCIFRendererRegistry();
    const b = getCIFRendererRegistry();
    expect(a).not.toBe(b);
  });
});

// =============================================================================
// CULTURAL PREAMBLE VARIATIONS
// =============================================================================

describe('cultural preamble rendering', () => {
  const renderer = new ClaudeRenderer();

  it('renders neutral cooperation (0.5)', () => {
    const doc = buildTestDoc('claude', {
      cooperation_index: 0.5,
      cultural_family: 'mercantile',
      prompt_dialect: 'consensus',
    });
    const result = renderer.render(doc);
    expect(result.systemPrompt).toContain('balance cooperation with independent judgment');
    expect(result.systemPrompt).toContain('mercantile protocols');
    expect(result.systemPrompt).toContain('proposal-based dialogue');
  });

  it('renders low cooperation (0.15)', () => {
    const doc = buildTestDoc('claude', {
      cooperation_index: 0.15,
      cultural_family: 'isolationist',
      prompt_dialect: 'reactive',
    });
    const result = renderer.render(doc);
    expect(result.systemPrompt).toContain('competitive agent');
    expect(result.systemPrompt).toContain('isolationist protocols');
    expect(result.systemPrompt).toContain('event-response patterns');
  });

  it('renders exploratory family', () => {
    const doc = buildTestDoc('claude', {
      cooperation_index: 0.7,
      cultural_family: 'exploratory',
      prompt_dialect: 'socratic',
    });
    const result = renderer.render(doc);
    expect(result.systemPrompt).toContain('exploratory protocols');
    expect(result.systemPrompt).toContain('questions and guided reasoning');
  });

  it('renders hierarchical + directive', () => {
    const doc = buildTestDoc('claude', {
      cooperation_index: 0.6,
      cultural_family: 'hierarchical',
      prompt_dialect: 'directive',
    });
    const result = renderer.render(doc);
    expect(result.systemPrompt).toContain('hierarchical protocols');
    expect(result.systemPrompt).toContain('imperative directives');
  });

  it('renders narrative dialect', () => {
    const doc = buildTestDoc('claude', {
      cooperation_index: 0.8,
      cultural_family: 'ritualistic',
      prompt_dialect: 'narrative',
    });
    const result = renderer.render(doc);
    expect(result.systemPrompt).toContain('ritualistic protocols');
    expect(result.systemPrompt).toContain('narrative framing');
  });

  it('all renderers produce different output for same document', () => {
    const doc = buildTestDoc(undefined, coopProfile());

    const claude = new ClaudeRenderer().render({ ...doc, targetModel: 'claude' });
    const gpt = new GPTRenderer().render({ ...doc, targetModel: 'gpt' });
    const gemini = new GeminiRenderer().render({ ...doc, targetModel: 'gemini' });
    const generic = new GenericRenderer().render({ ...doc, targetModel: 'generic' });

    // All should contain the same core content
    const coreContent = 'highly cooperative';
    expect(claude.systemPrompt).toContain(coreContent);
    expect(gpt.systemPrompt).toContain(coreContent);
    expect(gemini.systemPrompt).toContain(coreContent);
    expect(generic.systemPrompt).toContain(coreContent);

    // But formatting should differ
    expect(claude.systemPrompt).toContain('<cultural-identity>');
    expect(gpt.systemPrompt).toContain('## Cultural Identity');
    expect(gemini.systemPrompt).toContain('[BEHAVIORAL GUIDELINES]');
    expect(generic.systemPrompt).toContain('--- Cultural Identity ---');
  });
});

// =============================================================================
// SECTION PRIORITY SORTING
// =============================================================================

describe('priority sorting', () => {
  it('renders critical sections before optional ones', () => {
    const doc = new CIFBuilder('a', 'r')
      .addInstructions('optional task', 'optional')
      .addSystem('critical system', 'critical')
      .build();

    const renderer = new GenericRenderer();
    const result = renderer.render(doc);

    // System (critical) should appear before Instructions (optional)
    const systemIdx = result.systemPrompt.indexOf('critical system');
    const instrIdx = result.systemPrompt.indexOf('optional task');
    expect(systemIdx).toBeLessThan(instrIdx);
  });
});
