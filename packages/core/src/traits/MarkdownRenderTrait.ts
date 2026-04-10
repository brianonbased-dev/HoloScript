/**
 * MarkdownRenderTrait — v5.1
 *
 * Markdown to HTML rendering with sanitization.
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface MarkdownRenderConfig {
  sanitize: boolean;
  gfm: boolean;
}

export const markdownRenderHandler: TraitHandler<MarkdownRenderConfig> = {
  name: 'markdown_render',
  defaultConfig: { sanitize: true, gfm: true },

  onAttach(node: HSPlusNode): void {
    node.__mdState = { rendered: 0 };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__mdState;
  },
  onUpdate(): void {},

  onEvent(
    node: HSPlusNode,
    config: MarkdownRenderConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__mdState as { rendered: number } | undefined;
    if (!state) return;
    if ((typeof event === 'string' ? event : event.type) === 'markdown:render') {
      state.rendered++;
      // Simplified render — real impl would use a markdown parser
      const md = (event.markdown as string) ?? '';
      const html = md
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      context.emit?.('markdown:rendered', { html, gfm: config.gfm, sanitized: config.sanitize });
    }
  },
};

export default markdownRenderHandler;
