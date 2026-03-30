/**
 * PromptTemplateTrait — v5.1
 *
 * Template management with variable substitution.
 *
 * Events:
 *  prompt:register  { templateId, template, variables }
 *  prompt:render    { templateId, values }
 *  prompt:result    { templateId, rendered }
 */

import type { TraitHandler } from './TraitTypes';

export interface PromptTemplateConfig {
  max_templates: number;
}

interface PromptEntry {
  template: string;
  variables: string[];
}

export const promptTemplateHandler: TraitHandler<PromptTemplateConfig> = {
  name: 'prompt_template',
  defaultConfig: { max_templates: 100 },

  onAttach(node: any): void {
    node.__promptState = { templates: new Map<string, PromptEntry>() };
  },
  onDetach(node: any): void {
    delete node.__promptState;
  },
  onUpdate(): void {},

  onEvent(node: any, config: PromptTemplateConfig, context: any, event: any): void {
    const state = node.__promptState as { templates: Map<string, PromptEntry> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;

    switch (t) {
      case 'prompt:register': {
        if (state.templates.size >= config.max_templates) break;
        state.templates.set(event.templateId as string, {
          template: event.template as string,
          variables: (event.variables as string[]) ?? [],
        });
        break;
      }
      case 'prompt:render': {
        const entry = state.templates.get(event.templateId as string);
        if (!entry) break;
        let rendered = entry.template;
        const values = (event.values as Record<string, string>) ?? {};
        for (const [k, v] of Object.entries(values)) {
          rendered = rendered.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
        }
        context.emit?.('prompt:result', { templateId: event.templateId, rendered });
        break;
      }
    }
  },
};

export default promptTemplateHandler;
