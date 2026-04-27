/**
 * InvoiceTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { invoiceHandler } from '../InvoiceTrait';

const makeNode = () => ({
  id: 'n1', traits: new Set<string>(), emit: vi.fn(),
  __invoiceState: undefined as unknown,
});
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});
const defaultConfig = { auto_number: true };

describe('InvoiceTrait', () => {
  it('has name "invoice"', () => {
    expect(invoiceHandler.name).toBe('invoice');
  });

  it('defaultConfig auto_number=true', () => {
    expect(invoiceHandler.defaultConfig?.auto_number).toBe(true);
  });

  it('onAttach initializes empty invoices map', () => {
    const node = makeNode();
    invoiceHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__invoiceState as { invoices: Map<string, unknown>; counter: number };
    expect(state.invoices.size).toBe(0);
    expect(state.counter).toBe(0);
  });

  it('invoice:create assigns auto-numbered id and emits invoice:created', () => {
    const node = makeNode();
    invoiceHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    invoiceHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'invoice:create', amount: 99.99,
    } as never);
    expect(node.emit).toHaveBeenCalledWith('invoice:created', expect.objectContaining({
      invoiceId: 'INV-00001', amount: 99.99,
    }));
  });

  it('invoice:send updates status to sent and emits invoice:sent', () => {
    const node = makeNode();
    invoiceHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    invoiceHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'invoice:create', amount: 50,
    } as never);
    node.emit.mockClear();
    invoiceHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'invoice:send', invoiceId: 'INV-00001',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('invoice:sent', { invoiceId: 'INV-00001' });
  });

  it('invoice:pay updates status to paid and emits invoice:paid', () => {
    const node = makeNode();
    invoiceHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    invoiceHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'invoice:create', amount: 200,
    } as never);
    node.emit.mockClear();
    invoiceHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'invoice:pay', invoiceId: 'INV-00001',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('invoice:paid', { invoiceId: 'INV-00001' });
  });
});
