/** @checkout Trait — Checkout flow management. @trait checkout */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type CheckoutStep = 'shipping' | 'payment' | 'review' | 'confirm' | 'complete';
export type PaymentMethod = 'credit_card' | 'debit_card' | 'paypal' | 'crypto' | 'bank_transfer' | 'apple_pay';
export interface Address { line1: string; line2?: string; city: string; state: string; postalCode: string; country: string; }
export interface CheckoutConfig { step: CheckoutStep; paymentMethod: PaymentMethod; shippingAddress: Address | null; billingAddress: Address | null; orderTotal: number; tax: number; }
export interface CheckoutState { currentStep: CheckoutStep; isProcessing: boolean; orderId: string | null; error: string | null; }

const defaultConfig: CheckoutConfig = { step: 'shipping', paymentMethod: 'credit_card', shippingAddress: null, billingAddress: null, orderTotal: 0, tax: 0 };

export function createCheckoutHandler(): TraitHandler<CheckoutConfig> {
  return {
    name: 'checkout', defaultConfig,
    onAttach(node: HSPlusNode, config: CheckoutConfig, ctx: TraitContext) { node.__checkoutState = { currentStep: config.step, isProcessing: false, orderId: null, error: null }; ctx.emit?.('checkout:started'); },
    onDetach(node: HSPlusNode, _c: CheckoutConfig, ctx: TraitContext) { delete node.__checkoutState; ctx.emit?.('checkout:abandoned'); },
    onUpdate() {},
    onEvent(node: HSPlusNode, _c: CheckoutConfig, ctx: TraitContext, event: TraitEvent) {
      const s = node.__checkoutState as CheckoutState | undefined; if (!s) return;
      if (event.type === 'checkout:next_step') {
        const steps: CheckoutStep[] = ['shipping', 'payment', 'review', 'confirm', 'complete'];
        const idx = steps.indexOf(s.currentStep);
        if (idx < steps.length - 1) { s.currentStep = steps[idx + 1]; ctx.emit?.('checkout:step_changed', { step: s.currentStep }); }
      }
      if (event.type === 'checkout:process_payment') { s.isProcessing = true; ctx.emit?.('checkout:processing'); }
      if (event.type === 'checkout:complete') { s.currentStep = 'complete'; s.orderId = event.payload?.orderId as string; ctx.emit?.('checkout:completed', { orderId: s.orderId }); }
    },
  };
}
