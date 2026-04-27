/**
 * PromptTemplateTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { promptTemplateHandler } from '../PromptTemplateTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __promptState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { max_templates: 100 };

describe('PromptTemplateTrait', () => {
  it('has name "prompt_template"', () => {
    expect(promptTemplateHandler.name).toBe('prompt_template');
  });

  it('prompt:register stores template', () => {
    const node = makeNode();
    promptTemplateHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    promptTemplateHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'prompt:register', templateId: 't1', template: 'Hello {{name}}', variables: ['name'],
    } as never);
    const state = node.__promptState as { templates: Map<string, unknown> };
    expect(state.templates.has('t1')).toBe(true);
  });

  it('prompt:render substitutes variables and emits prompt:result', () => {
    const node = makeNode();
    promptTemplateHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    promptTemplateHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'prompt:register', templateId: 't1', template: 'Hello {{name}}', variables: ['name'],
    } as never);
    promptTemplateHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'prompt:render', templateId: 't1', values: { name: 'World' },
    } as never);
    expect(node.emit).toHaveBeenCalledWith('prompt:result', { templateId: 't1', rendered: 'Hello World' });
  });
});
