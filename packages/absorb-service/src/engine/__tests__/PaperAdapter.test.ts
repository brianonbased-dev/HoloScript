import { describe, expect, it } from 'vitest';
import { parseMarkdownStructure, githubSlug, classifyLinkTarget } from '../paper/markdownStructure';
import { parseTexStructure } from '../paper/texStructure';
import { PaperAdapter } from '../adapters/PaperAdapter';
import { PaperTexAdapter } from '../adapters/PaperTexAdapter';

const MD = [
  'Owner: docs',
  '# Title',
  '',
  'See [spec](./spec.md#part-a) and [site](https://x.io) and [m](mailto:a@b.c) and [abs](C:/etc/x).',
  '## Setup',
  '```bash',
  '# not a heading',
  '[not](a-link.md)',
  '```',
  '## Setup',
  '### Deep `code` Item!',
  'Use `[x](y.md)` inline.',
].join('\n');

describe('MD-ADAPTER', () => {
  it('sections: github slug with dedupe, level, line span, parent; skips fences', () => {
    const s = parseMarkdownStructure(MD);
    expect(s.sections.map((x) => x.slug)).toEqual(['title', 'setup', 'setup-1', 'deep-code-item']);
    expect(s.sections.map((x) => x.level)).toEqual([1, 2, 2, 3]);
    expect(s.sections[0]).toMatchObject({ lineStart: 2, lineEnd: 12, parentSlug: null });
    expect(s.sections[1]).toMatchObject({ lineStart: 5, lineEnd: 9, parentSlug: 'title' });
    expect(s.sections[3].parentSlug).toBe('setup-1');
  });

  it('links captured raw with anchor, line, kind; none from fences or inline code', () => {
    const s = parseMarkdownStructure(MD);
    expect(s.links.map((l) => [l.target, l.anchor, l.line, l.kind])).toEqual([
      ['./spec.md', 'part-a', 4, 'relative'],
      ['https://x.io', null, 4, 'http'],
      ['mailto:a@b.c', null, 4, 'mailto'],
      ['C:/etc/x', null, 4, 'local-absolute'],
    ]);
  });

  it('doc-contract header comes from the first 5 lines only', () => {
    expect(parseMarkdownStructure(MD).header).toMatchObject({ owner: 'docs' });
    expect(parseMarkdownStructure('a\nb\nc\nd\ne\nowner: late').header).toEqual({});
  });

  it('slug and link-kind helpers', () => {
    expect(githubSlug('Hello, World! v2.0')).toBe('hello-world-v20');
    expect(classifyLinkTarget('#x')).toBe('relative');
    expect(classifyLinkTarget('http://a')).toBe('http');
  });

  it('PaperAdapter is a native .md adapter emitting section symbols and relative-link imports', async () => {
    const a = new PaperAdapter();
    expect(a.isNativeAdapter).toBe(true);
    expect(a.extensions).toEqual(['.md']);
    const t = await a.parse(MD, 'docs/x.md');
    const syms = a.extractSymbols(t, 'docs/x.md');
    expect(syms.filter((x) => x.type === 'section')).toHaveLength(4);
    const imps = a.extractImports(t, 'docs/x.md');
    expect(imps.map((i) => i.toModule)).toEqual(['./spec.md']);
  });
});

describe('PaperTexAdapter', () => {
  const TEX = '\\section{Intro}\\label{sec:intro}\n% \\section{Commented}\nSee \\ref{sec:intro} \\cite{a,b}.\n\\begin{verbatim}\n\\section{No}\n\\end{verbatim}\n\\subsection{Method}\n\\input{parts/m}\n';
  it('sections, refs, labels; skips comments and verbatim', () => {
    const s = parseTexStructure(TEX);
    expect(s.sections.map((x) => x.title)).toEqual(['Intro', 'Method']);
    expect(s.labels.map((l) => l.label)).toContain('sec:intro');
    expect(s.refs.map((r) => r.kind)).toEqual(expect.arrayContaining(['ref', 'cite', 'input']));
  });
  it('is native for .tex with \\input imports', async () => {
    const a = new PaperTexAdapter();
    const t = await a.parse(TEX, 'p.tex');
    expect(a.extractImports(t, 'p.tex').length).toBe(1);
  });
});