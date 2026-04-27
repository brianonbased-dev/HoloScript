/**
 * PdfGenerateTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { pdfGenerateHandler } from '../PdfGenerateTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __pdfState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { page_size: 'A4' };

describe('PdfGenerateTrait', () => {
  it('has name "pdf_generate"', () => {
    expect(pdfGenerateHandler.name).toBe('pdf_generate');
  });

  it('pdf:generate increments counter and emits pdf:generated', () => {
    const node = makeNode();
    pdfGenerateHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    pdfGenerateHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'pdf:generate', template: 'invoice', pages: 2,
    } as never);
    expect((node.__pdfState as { generated: number }).generated).toBe(1);
    expect(node.emit).toHaveBeenCalledWith('pdf:generated', expect.objectContaining({
      pageSize: 'A4', pages: 2,
    }));
  });
});
