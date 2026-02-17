import { describe, it, expect, beforeEach } from 'vitest';
import { PromptBuilder } from '../PromptBuilder';
import type { CompletionContext, ErrorContext } from '../ContextGatherer';

function makeContext(overrides: Partial<CompletionContext> = {}): CompletionContext {
  return {
    type: 'trait',
    linePrefix: '  @',
    lineSuffix: '',
    fullLine: '  @',
    triggerCharacter: '@',
    objectName: 'demo',
    objectType: 'composition',
    existingTraits: ['@grabbable'],
    existingProperties: [],
    surroundingLines: ['composition demo {', '  @grabbable', '  @'],
    surroundingCode: 'composition demo {\n  @grabbable\n  @',
    filePath: 'file:///test.holo',
    indentLevel: 1,
    line: 2,
    column: 3,
    ...overrides,
  };
}

function makeErrorContext(overrides: Partial<ErrorContext> = {}): ErrorContext {
  return {
    ...makeContext(),
    errorMessage: 'Unknown property: colr',
    errorLine: 1,
    errorColumn: 5,
    ...overrides,
  };
}

describe('PromptBuilder', () => {
  let builder: PromptBuilder;

  beforeEach(() => {
    builder = new PromptBuilder();
  });

  it('is instantiable', () => {
    expect(builder).toBeDefined();
  });

  it('buildTraitPrompt returns a non-empty string', () => {
    const prompt = builder.buildTraitPrompt(makeContext());
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('buildTraitPrompt contains HoloScript context', () => {
    const prompt = builder.buildTraitPrompt(makeContext());
    expect(prompt.toLowerCase()).toContain('holoscript');
  });

  it('buildTraitPrompt mentions existing traits', () => {
    const ctx = makeContext({ existingTraits: ['@physics', '@collidable'] });
    const prompt = builder.buildTraitPrompt(ctx);
    expect(prompt).toMatch(/physics|collidable/);
  });

  it('buildTraitPrompt includes objectType', () => {
    const ctx = makeContext({ objectType: 'orb' });
    const prompt = builder.buildTraitPrompt(ctx);
    expect(prompt).toContain('orb');
  });

  it('buildCodeGenPrompt returns a string', () => {
    const ctx = makeContext({ type: 'comment', comment: 'Create a countdown timer' });
    const prompt = builder.buildCodeGenPrompt(ctx);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('buildCodeGenPrompt includes comment text', () => {
    const ctx = makeContext({ type: 'comment', comment: 'Play a sound on click' });
    const prompt = builder.buildCodeGenPrompt(ctx);
    expect(prompt).toContain('Play a sound on click');
  });

  it('buildPropertyPrompt returns a string', () => {
    const ctx = makeContext({ type: 'property' });
    const prompt = builder.buildPropertyPrompt(ctx);
    expect(typeof prompt).toBe('string');
  });

  it('buildEventPrompt returns a string', () => {
    const ctx = makeContext({ type: 'event' });
    const prompt = builder.buildEventPrompt(ctx);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('buildErrorFixPrompt returns a string', () => {
    const errCtx = makeErrorContext();
    const prompt = builder.buildErrorFixPrompt(errCtx, { message: 'Unknown property', line: 1, column: 5 });
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('buildErrorFixPrompt includes error message', () => {
    const errCtx = makeErrorContext();
    const prompt = builder.buildErrorFixPrompt(errCtx, { message: 'Property colr not found', line: 1, column: 5 });
    expect(prompt).toMatch(/colr|color/);
  });

  it('buildGeneralPrompt returns a string', () => {
    const ctx = makeContext({ type: 'general' });
    const prompt = builder.buildGeneralPrompt(ctx);
    expect(typeof prompt).toBe('string');
  });

  it('buildTraitRecommendationPrompt returns a string', () => {
    const ctx = makeContext({ objectType: 'orb', objectName: 'door' });
    const prompt = builder.buildTraitRecommendationPrompt(ctx);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('buildTraitRecommendationPrompt mentions object name', () => {
    const ctx = makeContext({ objectName: 'interactiveDoor' });
    const prompt = builder.buildTraitRecommendationPrompt(ctx);
    expect(prompt).toContain('interactiveDoor');
  });

  it('prompts stay within reasonable length', () => {
    const ctx = makeContext({
      surroundingLines: Array.from({ length: 20 }, (_, i) => `  line${i}: ${i}`),
    });
    const prompt = builder.buildTraitPrompt(ctx);
    expect(prompt.length).toBeLessThan(5000);
  });

  it('all prompt methods work with minimal context', () => {
    const minimal: CompletionContext = {
      type: 'general',
      linePrefix: '',
      lineSuffix: '',
      fullLine: '',
      surroundingLines: [],
      indentLevel: 0,
      line: 0,
      column: 0,
    };
    expect(() => builder.buildTraitPrompt(minimal)).not.toThrow();
    expect(() => builder.buildPropertyPrompt(minimal)).not.toThrow();
    expect(() => builder.buildEventPrompt(minimal)).not.toThrow();
    expect(() => builder.buildGeneralPrompt(minimal)).not.toThrow();
  });
});
