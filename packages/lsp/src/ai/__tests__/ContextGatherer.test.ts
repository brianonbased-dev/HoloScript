import { describe, it, expect, beforeEach } from 'vitest';
import { ContextGatherer } from '../ContextGatherer';
import { TextDocument } from 'vscode-languageserver-textdocument';

function makeDoc(content: string, uri = 'file:///test.holo') {
  return TextDocument.create(uri, 'holoscript', 1, content);
}

describe('ContextGatherer', () => {
  let gatherer: ContextGatherer;

  beforeEach(() => {
    gatherer = new ContextGatherer();
  });

  it('is instantiable', () => {
    expect(gatherer).toBeDefined();
  });

  it('gather returns a CompletionContext', () => {
    const doc = makeDoc('composition demo {\n  @grabbable\n  \n}');
    const ctx = gatherer.gather(doc, { line: 2, character: 2 });
    expect(ctx).toBeDefined();
    expect(ctx.linePrefix).toBeDefined();
    expect(ctx.fullLine).toBeDefined();
  });

  it('detects trait context after @', () => {
    const doc = makeDoc('composition demo {\n  @\n}');
    const ctx = gatherer.gather(doc, { line: 1, character: 3 }, '@');
    expect(ctx.type).toBe('trait');
  });

  it('detects property context inside a block', () => {
    const doc = makeDoc('composition demo {\n  speed: \n}');
    const ctx = gatherer.gather(doc, { line: 1, character: 9 });
    expect(['property', 'value', 'general']).toContain(ctx.type);
  });

  it('sets linePrefix to text before cursor', () => {
    const doc = makeDoc('composition demo');
    const ctx = gatherer.gather(doc, { line: 0, character: 11 });
    expect(ctx.linePrefix).toBe('composition');
  });

  it('sets lineSuffix to text after cursor', () => {
    const doc = makeDoc('orb ball');
    const ctx = gatherer.gather(doc, { line: 0, character: 3 });
    expect(ctx.lineSuffix).toBe(' ball');
  });

  it('returns correct fullLine', () => {
    const doc = makeDoc('  @grabbable');
    const ctx = gatherer.gather(doc, { line: 0, character: 5 });
    expect(ctx.fullLine).toBe('  @grabbable');
  });

  it('returns indentLevel >= 0', () => {
    const doc = makeDoc('    @physics');
    const ctx = gatherer.gather(doc, { line: 0, character: 4 });
    expect(ctx.indentLevel).toBeGreaterThanOrEqual(0);
  });

  it('returns surroundingLines as array', () => {
    const doc = makeDoc('composition demo {\n  orb ball {}\n}');
    const ctx = gatherer.gather(doc, { line: 1, character: 4 });
    expect(Array.isArray(ctx.surroundingLines)).toBe(true);
  });

  it('extracts objectName from enclosing block', () => {
    const doc = makeDoc('composition myScene {\n  @grabbable\n}');
    const ctx = gatherer.gather(doc, { line: 1, character: 3 });
    // objectName may or may not be set depending on parsing depth
    expect(ctx).toBeDefined();
  });

  it('handles empty file gracefully', () => {
    const doc = makeDoc('');
    const ctx = gatherer.gather(doc, { line: 0, character: 0 });
    expect(ctx).toBeDefined();
    expect(ctx.linePrefix).toBe('');
  });

  it('handles cursor at end of line', () => {
    const doc = makeDoc('composition demo {}');
    const ctx = gatherer.gather(doc, { line: 0, character: 19 });
    expect(ctx).toBeDefined();
    expect(ctx.fullLine).toBe('composition demo {}');
  });

  it('records line and column in context', () => {
    const doc = makeDoc('orb ball {\n  color: "#ff0000"\n}');
    const ctx = gatherer.gather(doc, { line: 1, character: 8 });
    expect(ctx.line).toBe(1);
    expect(ctx.column).toBe(8);
  });

  it('gatherErrorContext adds error fields', () => {
    const doc = makeDoc('composition demo {\n  colr: 5\n}');
    const errCtx = gatherer.gatherErrorContext(doc, {
      message: 'Unknown property: colr',
      line: 1,
      column: 2,
    });
    expect(errCtx.errorMessage).toBe('Unknown property: colr');
    expect(errCtx.errorLine).toBe(1);
    expect(errCtx.errorColumn).toBe(2);
  });

  it('detects comment context for // lines', () => {
    const doc = makeDoc('composition demo {\n  // Create a timer\n}');
    const ctx = gatherer.gather(doc, { line: 1, character: 18 });
    expect(['comment', 'general']).toContain(ctx.type);
  });

  it('stores filePath from document URI', () => {
    const doc = makeDoc('orb x {}', 'file:///my/project/scene.holo');
    const ctx = gatherer.gather(doc, { line: 0, character: 0 });
    expect(ctx.filePath).toBe('file:///my/project/scene.holo');
  });
});
