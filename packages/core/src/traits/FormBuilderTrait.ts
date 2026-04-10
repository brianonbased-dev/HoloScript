/**
 * FormBuilderTrait — v5.1
 * Dynamic form schema and rendering.
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface FormBuilderConfig {
  max_fields: number;
}

export const formBuilderHandler: TraitHandler<FormBuilderConfig> = {
  name: 'form_builder',
  defaultConfig: { max_fields: 100 },
  onAttach(node: HSPlusNode): void {
    node.__formState = {
      forms: new Map<
        string,
        { fields: Array<{ name: string; type: string; required: boolean }>; submitted: boolean }
      >(),
    };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__formState;
  },
  onUpdate(): void {},
  onEvent(node: HSPlusNode, config: FormBuilderConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__formState as { forms: Map<string, any> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'form:create':
        state.forms.set(event.formId as string, { fields: [], submitted: false });
        context.emit?.('form:created', { formId: event.formId });
        break;
      case 'form:add_field': {
        const f = state.forms.get(event.formId as string);
        if (f && f.fields.length < config.max_fields) {
          f.fields.push({
            name: event.name,
            type: event.fieldType ?? 'text',
            required: event.required ?? false,
          });
          context.emit?.('form:field_added', { formId: event.formId, name: event.name });
        }
        break;
      }
      case 'form:submit': {
        const f = state.forms.get(event.formId as string);
        if (f) {
          f.submitted = true;
        }
        context.emit?.('form:submitted', { formId: event.formId, fields: f?.fields.length ?? 0 });
        break;
      }
    }
  },
};
export default formBuilderHandler;
