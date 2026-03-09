/**
 * StripePaymentProcessor — Example Stripe payment processor for x402 protocol
 *
 * Demonstrates how to implement a custom payment processor that integrates
 * traditional payment methods (credit cards, ACH, etc.) with the x402 protocol.
 *
 * This example uses Stripe, but the pattern works for any payment provider
 * (PayPal, Square, Coinbase Commerce, etc.)
 *
 * @version 1.0.0
 * @example Example plugin implementation
 */

import { BasePaymentProcessor, type PaymentProcessorConfig } from '../HololandExtensionPoint';
import type { PaymentRequest, PaymentReceipt } from '../HololandTypes';

/**
 * Stripe payment processor implementation
 *
 * Integrates Stripe's Payment Intents API with the x402 protocol,
 * allowing traditional payment methods in VR/AR layer transitions.
 *
 * @example Usage
 * ```typescript
 * import { StripePaymentProcessor } from '@holoscript/plugin-stripe-payments';
 * import { getHololandRegistry } from '@holoscript/core';
 *
 * const processor = new StripePaymentProcessor();
 * await processor.initialize({
 *   processorId: 'stripe',
 *   displayName: 'Stripe',
 *   apiKey: 'sk_test_...',
 *   simulationMode: false
 * });
 *
 * const registry = getHololandRegistry();
 * registry.registerPaymentProcessor(processor);
 *
 * // Process a payment
 * const receipt = await processor.processPayment({
 *   endpoint: 'https://api.example.com/premium-content',
 *   price: 1000, // $10.00 in cents
 *   currency: 'USD'
 * });
 * ```
 */
export class StripePaymentProcessor extends BasePaymentProcessor {
  readonly id = 'stripe';
  private stripeApiUrl = 'https://api.stripe.com/v1';

  /**
   * Initialize the payment processor
   */
  async initialize(config: PaymentProcessorConfig): Promise<void> {
    await super.initialize(config);

    if (!config.simulationMode && !config.apiKey) {
      throw new Error('Stripe API key required when not in simulation mode');
    }

    console.log('[StripeProcessor] Initialized (simulation:', config.simulationMode, ')');
  }

  /**
   * Process a payment
   */
  async processPayment(request: PaymentRequest): Promise<PaymentReceipt> {
    if (this.config!.simulationMode) {
      return this.simulatePayment(request);
    }

    try {
      // Convert wei to cents (assuming ETH price conversion needed)
      // In practice, you'd need a price oracle or fixed conversion rate
      const amountInCents = await this.convertWeiToCents(request.price, request.currency);

      // Create Stripe Payment Intent
      const paymentIntent = await this.createPaymentIntent(amountInCents, request.currency);

      // In a real implementation, you'd:
      // 1. Return client_secret to frontend
      // 2. Frontend collects payment method
      // 3. Frontend confirms payment
      // 4. Webhook confirms completion

      // For this example, we'll simulate successful payment
      const receipt: PaymentReceipt = {
        txHash: paymentIntent.id, // Use Stripe Payment Intent ID
        from: 'customer',
        to: request.endpoint,
        amount: request.price.toString(),
        currency: request.currency,
        timestamp: Date.now(),
        confirmed: true,
      };

      this.recordPayment(receipt);
      console.log('[StripeProcessor] Payment processed:', receipt.txHash);

      return receipt;
    } catch (error) {
      console.error('[StripeProcessor] Payment failed:', error);
      throw error;
    }
  }

  /**
   * Simulate a payment (for development/testing)
   */
  private async simulatePayment(request: PaymentRequest): Promise<PaymentReceipt> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const receipt: PaymentReceipt = {
      txHash: `pi_sim_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      from: 'simulation_customer',
      to: request.endpoint,
      amount: request.price.toString(),
      currency: request.currency,
      timestamp: Date.now(),
      confirmed: true,
    };

    this.recordPayment(receipt);
    console.log('[StripeProcessor] Simulated payment:', receipt.txHash);

    return receipt;
  }

  /**
   * Create a Stripe Payment Intent
   */
  private async createPaymentIntent(
    amountInCents: number,
    currency: string
  ): Promise<{ id: string; client_secret: string }> {
    const response = await fetch(`${this.stripeApiUrl}/payment_intents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config!.apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        amount: amountInCents.toString(),
        currency: currency.toLowerCase(),
        'automatic_payment_methods[enabled]': 'true',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Stripe API error: ${error.error?.message || response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Convert wei to cents (requires price oracle in production)
   */
  private async convertWeiToCents(wei: number, targetCurrency: string): Promise<number> {
    // In production, you'd use a price oracle like Chainlink or CoinGecko
    // For this example, we'll use a mock conversion

    if (targetCurrency === 'USD') {
      // Mock: 1 ETH = $2000, convert wei to USD cents
      const ethAmount = wei / 1e18;
      const usdAmount = ethAmount * 2000;
      return Math.round(usdAmount * 100); // Convert to cents
    }

    throw new Error(`Unsupported currency: ${targetCurrency}`);
  }

  /**
   * Verify a payment receipt
   */
  async verifyPayment(txHash: string): Promise<{
    valid: boolean;
    amount: number;
    timestamp: number;
  }> {
    if (this.config!.simulationMode) {
      // In simulation mode, check our local history
      const receipt = this.paymentHistory.find((r) => r.txHash === txHash);
      return {
        valid: !!receipt,
        amount: receipt ? parseInt(receipt.amount) : 0,
        timestamp: receipt?.timestamp || 0,
      };
    }

    try {
      // Retrieve Payment Intent from Stripe
      const response = await fetch(`${this.stripeApiUrl}/payment_intents/${txHash}`, {
        headers: {
          Authorization: `Bearer ${this.config!.apiKey}`,
        },
      });

      if (!response.ok) {
        return { valid: false, amount: 0, timestamp: 0 };
      }

      const paymentIntent = await response.json();

      return {
        valid: paymentIntent.status === 'succeeded',
        amount: paymentIntent.amount,
        timestamp: paymentIntent.created * 1000, // Convert to milliseconds
      };
    } catch (error) {
      console.error('[StripeProcessor] Verification error:', error);
      return { valid: false, amount: 0, timestamp: 0 };
    }
  }

  /**
   * Check if processor is available
   */
  async checkAvailability(): Promise<boolean> {
    if (this.config!.simulationMode) {
      return true;
    }

    if (!this.config!.apiKey) {
      return false;
    }

    try {
      // Check API connectivity by retrieving account info
      const response = await fetch(`${this.stripeApiUrl}/account`, {
        headers: {
          Authorization: `Bearer ${this.config!.apiKey}`,
        },
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    super.dispose();
    console.log('[StripeProcessor] Disposed');
  }
}

/**
 * Plugin manifest for Stripe payment processor
 */
export const stripePaymentPluginManifest = {
  id: 'holoscript-stripe-payments',
  name: 'Stripe Payment Processor',
  version: '1.0.0',
  description: 'Stripe integration for x402 payments in AR/VRR/VR layer transitions',
  author: 'HoloScript Community',
  license: 'MIT',
  main: 'StripePaymentProcessor.js',
  permissions: ['x402:payment'] as const,
  hololandFeatures: {
    paymentProcessors: [
      {
        id: 'stripe',
        displayName: 'Stripe',
        description: 'Credit cards, ACH, and more via Stripe',
        className: 'StripePaymentProcessor',
        supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD'],
        blockchain: false,
        configSchema: {
          type: 'object',
          properties: {
            apiKey: {
              type: 'string',
              description: 'Stripe Secret Key (sk_...)',
            },
            simulationMode: {
              type: 'boolean',
              default: true,
              description: 'Use simulation mode for testing',
            },
            webhookSecret: {
              type: 'string',
              description: 'Stripe Webhook Secret for event verification',
            },
          },
          required: ['apiKey'],
        },
      },
    ],
  },
};
