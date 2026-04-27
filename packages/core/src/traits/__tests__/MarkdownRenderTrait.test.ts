/**
 * MarkdownRenderTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { markdownRenderHandler } from '../MarkdownRenderTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __mdState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { sanitize: true, gfm: true };

describe('MarkdownRenderTrait', () => {
  it('has name "markdown_render"', () => {
    expect(markdownRenderHandler.name).toBe('markdown_render');
  });

  it('defaultConfig sanitize=true, gfm=true', () => {
    expect(markdownRenderHandler.defaultConfig?.sanitize).toBe(true);
    expect(markdownRenderHandler.defaultConfig?.gfm).toBe(true);
  });

  it('onAttach sets rendered=0', () => {
    const node = makeNode();
    markdownRenderHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    expect((node.__mdState as { rendered: number }).rendered).toBe(0);
  });

  it('markdown:render converts h1 and bold and emits markdown:rendered', () => {
    const node = makeNode();
    markdownRenderHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    markdownRenderHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'markdown:render', markdown: '# Hello\n**bold**',
    } as never);
    const call = node.emit.mock.calls[0];
    expect(call[0]).toBe('markdown:rendered');
    expect((call[1] as { html: string }).html).toContain('<h1>Hello</h1>');
    expect((call[1] as { html: string }).html).toContain('<strong>bold</strong>');
  });

  it('markdown:render increments rendered counter', () => {
    const node = makeNode();
    markdownRenderHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    markdownRenderHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, { type: 'markdown:render', markdown: 'a' } as never);
    markdownRenderHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, { type: 'markdown:render', markdown: 'b' } as never);
    expect((node.__mdState as { rendered: number }).rendered).toBe(2);
  });
});
