/**
 * PdfGenerateTrait — v5.1
 *
 * PDF document generation from templates.
 */

import type { TraitHandler } from './TraitTypes';

export interface PdfGenerateConfig {
  page_size: string;
}

export const pdfGenerateHandler: TraitHandler<PdfGenerateConfig> = {
  name: 'pdf_generate',
  defaultConfig: { page_size: 'A4' },

  onAttach(node: any): void {
    node.__pdfState = { generated: 0 };
  },
  onDetach(node: any): void {
    delete node.__pdfState;
  },
  onUpdate(): void {},

  onEvent(node: any, config: PdfGenerateConfig, context: any, event: any): void {
    const state = node.__pdfState as { generated: number } | undefined;
    if (!state) return;
    if ((typeof event === 'string' ? event : event.type) === 'pdf:generate') {
      state.generated++;
      context.emit?.('pdf:generated', {
        documentId: `pdf_${Date.now()}`,
        pageSize: config.page_size,
        template: event.template,
        pages: (event.pages as number) ?? 1,
      });
    }
  },
};

export default pdfGenerateHandler;
