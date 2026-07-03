/**
 * GrammarModuleRegistry — proof-slice tests
 *
 * Proves the registry pattern (mirroring compiler/DialectRegistry.ts) works
 * end-to-end on its first real registrant, HSKnowledgeParser.
 */
import { describe, it, expect } from 'vitest';
import { GrammarModuleRegistry } from '../GrammarModuleRegistry';
// Importing HSKnowledgeParser triggers its self-registration side effect.
import { parseKnowledge } from '../HSKnowledgeParser';

describe('GrammarModuleRegistry', () => {
  it('has HSKnowledgeParser self-registered as "hs-knowledge"', () => {
    expect(GrammarModuleRegistry.has('hs-knowledge')).toBe(true);
  });

  it('get() returns a descriptor whose parse fn matches parseKnowledge behavior', () => {
    const desc = GrammarModuleRegistry.get('hs-knowledge');
    expect(desc).toBeDefined();
    expect(desc!.name).toBe('hs-knowledge');
    expect(typeof desc!.description).toBe('string');

    const source = 'meta {\n  id: "test"\n  name: "Test"\n  version: "1.0.0"\n}\n';
    const viaRegistry = desc!.parse(source);
    const viaDirect = parseKnowledge(source);
    expect(viaRegistry).toEqual(viaDirect);
  });

  it('parseWith() dispatches by name', () => {
    const source = 'meta {\n  id: "x"\n  name: "X"\n  version: "2.0.0"\n}\n';
    const result = GrammarModuleRegistry.parseWith('hs-knowledge', source);
    expect(result).toEqual(parseKnowledge(source));
  });

  it('parseWith() throws for an unknown module name', () => {
    expect(() => GrammarModuleRegistry.parseWith('nonexistent-module', '')).toThrow(
      /Unknown grammar module/
    );
  });

  it('register() rejects a duplicate name', () => {
    expect(() =>
      GrammarModuleRegistry.register({
        name: 'hs-knowledge',
        description: 'duplicate',
        parse: () => ({}),
      })
    ).toThrow(/already registered/);
  });

  it('list() includes hs-knowledge without exposing the parse function', () => {
    const list = GrammarModuleRegistry.list();
    const entry = list.find((m) => m.name === 'hs-knowledge');
    expect(entry).toBeDefined();
    expect(entry).not.toHaveProperty('parse');
  });

  it('names() includes hs-knowledge', () => {
    expect(GrammarModuleRegistry.names()).toContain('hs-knowledge');
  });
});
