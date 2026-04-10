/**
 * InvoiceTrait — v5.1
 *
 * Invoice generation and lifecycle tracking.
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface InvoiceConfig {
  auto_number: boolean;
}

export const invoiceHandler: TraitHandler<InvoiceConfig> = {
  name: 'invoice',
  defaultConfig: { auto_number: true },

  onAttach(node: HSPlusNode): void {
    node.__invoiceState = {
      invoices: new Map<string, { amount: number; status: string }>(),
      counter: 0,
    };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__invoiceState;
  },
  onUpdate(): void {},

  onEvent(node: HSPlusNode, config: InvoiceConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__invoiceState as
      | { invoices: Map<string, any>; counter: number }
      | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;

    switch (t) {
      case 'invoice:create': {
        state.counter++;
        const id = config.auto_number
          ? `INV-${String(state.counter).padStart(5, '0')}`
          : (event.invoiceId as string);
        state.invoices.set(id, { amount: event.amount ?? 0, status: 'draft' });
        context.emit?.('invoice:created', { invoiceId: id, amount: event.amount });
        break;
      }
      case 'invoice:send': {
        const inv = state.invoices.get(event.invoiceId as string);
        if (inv) {
          inv.status = 'sent';
        }
        context.emit?.('invoice:sent', { invoiceId: event.invoiceId });
        break;
      }
      case 'invoice:pay': {
        const inv = state.invoices.get(event.invoiceId as string);
        if (inv) {
          inv.status = 'paid';
        }
        context.emit?.('invoice:paid', { invoiceId: event.invoiceId });
        break;
      }
    }
  },
};

export default invoiceHandler;
