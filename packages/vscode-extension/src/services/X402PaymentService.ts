/**
 * X402PaymentService — HTTP 402 "Payment Required" blockchain payment protocol
 *
 * Simulates x402 payment flows for layer transitions (AR → VRR → VR)
 * and premium content access using blockchain micropayments.
 *
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import type { PaymentRequest, PaymentReceipt } from '../../../core/src/plugins/HololandTypes';

export interface X402Config {
  enabled: boolean;
  network: 'base' | 'ethereum' | 'base-sepolia';
  defaultCurrency: 'ETH' | 'USDC';
  simulationMode: boolean; // true = mock payments, false = real blockchain
}

export class X402PaymentService {
  private config: X402Config;
  private outputChannel: vscode.OutputChannel;
  private paymentHistory: PaymentReceipt[] = [];
  private listeners: Set<(receipt: PaymentReceipt) => void> = new Set();

  constructor(config?: Partial<X402Config>) {
    this.config = {
      enabled: config?.enabled ?? true,
      network: config?.network ?? 'base-sepolia',
      defaultCurrency: config?.defaultCurrency ?? 'ETH',
      simulationMode: config?.simulationMode ?? true,
    };
    this.outputChannel = vscode.window.createOutputChannel('x402 Payments');
  }

  /**
   * Execute an x402 payment
   */
  async pay(request: PaymentRequest): Promise<PaymentReceipt> {
    if (!this.config.enabled) {
      throw new Error('x402 payments are disabled');
    }

    this.outputChannel.appendLine(`Payment request: ${request.endpoint} - ${request.price} wei`);

    if (this.config.simulationMode) {
      return this.simulatePayment(request);
    } else {
      return this.executeBlockchainPayment(request);
    }
  }

  /**
   * Simulate a payment (for development/testing)
   */
  private async simulatePayment(request: PaymentRequest): Promise<PaymentReceipt> {
    // Show payment confirmation dialog
    const proceed = await vscode.window.showInformationMessage(
      `Simulate x402 Payment:\n${request.endpoint}\nAmount: ${request.price} wei (${request.currency})`,
      'Confirm',
      'Cancel'
    );

    if (proceed !== 'Confirm') {
      throw new Error('Payment cancelled by user');
    }

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Generate proper 64-character transaction hash
    const generateTxHash = () => {
      let hash = '0x';
      for (let i = 0; i < 64; i++) {
        hash += Math.floor(Math.random() * 16).toString(16);
      }
      return hash;
    };

    const receipt: PaymentReceipt = {
      txHash: generateTxHash(),
      from: '0xSimulatedSender...',
      to: request.endpoint,
      amount: request.price.toString(),
      currency: request.currency,
      timestamp: Date.now(),
      status: 'confirmed',
    };

    this.paymentHistory.push(receipt);
    this.emit(receipt);

    this.outputChannel.appendLine(`Payment confirmed: ${receipt.txHash}`);
    vscode.window.showInformationMessage(`✅ Payment successful: ${receipt.txHash.slice(0, 10)}...`);

    return receipt;
  }

  /**
   * Execute real blockchain payment (requires AgentKit SDK)
   */
  private async executeBlockchainPayment(request: PaymentRequest): Promise<PaymentReceipt> {
    this.outputChannel.appendLine(`Executing blockchain payment on ${this.config.network}...`);

    // TODO: Integrate with AgentKit SDK for real payments
    // For now, throw error prompting user to enable simulation mode
    throw new Error(
      'Real blockchain payments not yet implemented. Enable simulation mode in settings.'
    );
  }

  /**
   * Get payment history
   */
  getHistory(limit?: number): PaymentReceipt[] {
    return limit ? this.paymentHistory.slice(-limit) : [...this.paymentHistory];
  }

  /**
   * Get total spent in wei
   */
  getTotalSpent(currency?: 'ETH' | 'USDC'): string {
    return this.paymentHistory
      .filter((r) => !currency || r.currency === currency)
      .reduce((sum, r) => sum + BigInt(r.amount), BigInt(0))
      .toString();
  }

  /**
   * Subscribe to payment events
   */
  onPayment(callback: (receipt: PaymentReceipt) => void): void {
    this.listeners.add(callback);
  }

  /**
   * Unsubscribe from payment events
   */
  offPayment(callback: (receipt: PaymentReceipt) => void): void {
    this.listeners.delete(callback);
  }

  /**
   * Emit payment event to all listeners
   */
  private emit(receipt: PaymentReceipt): void {
    this.listeners.forEach((cb) => {
      try {
        cb(receipt);
      } catch (error) {
        this.outputChannel.appendLine(`Listener error: ${error}`);
      }
    });
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<X402Config>): void {
    this.config = { ...this.config, ...config };
    this.outputChannel.appendLine(`Config updated: network=${this.config.network}, simulation=${this.config.simulationMode}`);
  }

  /**
   * Get current configuration
   */
  getConfig(): X402Config {
    return { ...this.config };
  }

  /**
   * Clear payment history
   */
  clearHistory(): void {
    this.paymentHistory = [];
    this.outputChannel.appendLine('Payment history cleared');
  }

  /**
   * Export payment history as JSON
   */
  exportHistory(): string {
    return JSON.stringify(this.paymentHistory, null, 2);
  }

  /**
   * Dispose of service resources
   */
  dispose(): void {
    this.listeners.clear();
    this.outputChannel.dispose();
  }
}
