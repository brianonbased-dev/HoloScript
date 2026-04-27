/**
 * FormBuilderTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { formBuilderHandler } from '../FormBuilderTrait';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __formState: undefined as unknown,
});

const defaultConfig = { max_fields: 100 };
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('FormBuilderTrait — metadata', () => {
  it('has name "form_builder"', () => {
    expect(formBuilderHandler.name).toBe('form_builder');
  });

  it('defaultConfig max_fields is 100', () => {
    expect(formBuilderHandler.defaultConfig?.max_fields).toBe(100);
  });
});

describe('FormBuilderTrait — lifecycle', () => {
  it('onAttach initializes empty forms map', () => {
    const node = makeNode();
    formBuilderHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__formState as { forms: Map<string, unknown> };
    expect(state.forms).toBeInstanceOf(Map);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    formBuilderHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    formBuilderHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__formState).toBeUndefined();
  });
});

describe('FormBuilderTrait — onEvent', () => {
  it('form:create creates a form and emits form:created', () => {
    const node = makeNode();
    formBuilderHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    formBuilderHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'form:create', formId: 'contact-form',
    } as never);
    const state = node.__formState as { forms: Map<string, { fields: unknown[]; submitted: boolean }> };
    expect(state.forms.has('contact-form')).toBe(true);
    expect(node.emit).toHaveBeenCalledWith('form:created', { formId: 'contact-form' });
  });

  it('form:add_field adds a field and emits form:field_added', () => {
    const node = makeNode();
    formBuilderHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    formBuilderHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'form:create', formId: 'signup',
    } as never);
    node.emit.mockClear();
    formBuilderHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'form:add_field', formId: 'signup', name: 'email', fieldType: 'email', required: true,
    } as never);
    expect(node.emit).toHaveBeenCalledWith('form:field_added', { formId: 'signup', name: 'email' });
    const state = node.__formState as { forms: Map<string, { fields: { name: string; type: string; required: boolean }[] }> };
    const field = state.forms.get('signup')?.fields[0];
    expect(field?.type).toBe('email');
    expect(field?.required).toBe(true);
  });

  it('form:submit marks form as submitted and emits form:submitted', () => {
    const node = makeNode();
    formBuilderHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    formBuilderHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'form:create', formId: 'order',
    } as never);
    formBuilderHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'form:add_field', formId: 'order', name: 'qty',
    } as never);
    node.emit.mockClear();
    formBuilderHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'form:submit', formId: 'order',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('form:submitted', expect.objectContaining({
      formId: 'order', fields: 1,
    }));
    const state = node.__formState as { forms: Map<string, { submitted: boolean }> };
    expect(state.forms.get('order')?.submitted).toBe(true);
  });
});
