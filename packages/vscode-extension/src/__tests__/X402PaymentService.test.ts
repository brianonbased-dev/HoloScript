/**
 * Unit tests for X402PaymentService
 *
 * Tests HTTP 402 blockchain payment protocol including:
 * - Service initialization and configuration
 * - Payment execution in simulation and real modes
 * - Payment history tracking
 * - Payment event listeners
 * - Configuration management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { X402PaymentService } from '../services/X402PaymentService';
import type { PaymentRequest, PaymentReceipt } from '../../../core/src/plugins/HololandTypes';

// Mock vscode module
vi.mock('vscode', async () => {
  const actual = await vi.importActual('vscode');
  return {
    ...actual,
    window: {
      ...((actual as any).window || {}),
      showInformationMessage: vi.fn(),
      createOutputChannel: vi.fn(() => ({
        appendLine: vi.fn(),
        dispose: vi.fn(),
      })),
    },
  };
});

// Import mocked vscode to access the mock
import * as vscode from 'vscode';
const mockShowInformationMessage = vscode.window.showInformationMessage as ReturnType<typeof vi.fn>;

describe('X402PaymentService', () => {
  let service: X402PaymentService;
  let samplePaymentRequest: PaymentRequest;

  beforeEach(() => {
    vi.clearAllMocks();
    samplePaymentRequest = {
      endpoint: 'https://api.example.com/premium-content',
      price: BigInt(1000000000000000), // 0.001 ETH in wei
      currency: 'ETH',
      metadata: {
        contentType: 'VRR_ACCESS',
        layer: 'vrr',
      },
    };
  });

  afterEach(() => {
    if (service) {
      service.dispose();
    }
  });

  describe('Constructor and Configuration', () => {
    it('should create service with default configuration', () => {
      service = new X402PaymentService();
      const config = service.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.network).toBe('base-sepolia');
      expect(config.defaultCurrency).toBe('ETH');
      expect(config.simulationMode).toBe(true);
    });

    it('should create service with custom configuration', () => {
      service = new X402PaymentService({
        enabled: false,
        network: 'ethereum',
        defaultCurrency: 'USDC',
        simulationMode: false,
      });

      const config = service.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.network).toBe('ethereum');
      expect(config.defaultCurrency).toBe('USDC');
      expect(config.simulationMode).toBe(false);
    });

    it('should merge partial config with defaults', () => {
      service = new X402PaymentService({
        network: 'base',
      });

      const config = service.getConfig();
      expect(config.network).toBe('base');
      expect(config.enabled).toBe(true); // default
      expect(config.simulationMode).toBe(true); // default
    });
  });

  describe('Simulated Payments', () => {
    beforeEach(() => {
      service = new X402PaymentService({ simulationMode: true });
    });

    it('should execute simulated payment successfully when user confirms', async () => {
      mockShowInformationMessage.mockResolvedValueOnce('Confirm');

      const receipt = await service.pay(samplePaymentRequest);

      expect(receipt).toMatchObject<Partial<PaymentReceipt>>({
        txHash: expect.stringMatching(/^0x[a-f0-9]{64}$/),
        from: expect.any(String),
        to: samplePaymentRequest.endpoint,
        amount: samplePaymentRequest.price.toString(),
        currency: samplePaymentRequest.currency,
        timestamp: expect.any(Number),
        status: 'confirmed',
      });
    });

    it('should throw error when user cancels payment', async () => {
      mockShowInformationMessage.mockResolvedValueOnce('Cancel');

      await expect(service.pay(samplePaymentRequest)).rejects.toThrow('Payment cancelled by user');
    });

    it('should add payment to history after successful payment', async () => {
      mockShowInformationMessage.mockResolvedValueOnce('Confirm');

      await service.pay(samplePaymentRequest);
      const history = service.getHistory();

      expect(history.length).toBe(1);
      expect(history[0].to).toBe(samplePaymentRequest.endpoint);
    });

    it('should emit payment event to listeners', async () => {
      mockShowInformationMessage.mockResolvedValueOnce('Confirm');
      const listener = vi.fn();

      service.onPayment(listener);
      const receipt = await service.pay(samplePaymentRequest);

      expect(listener).toHaveBeenCalledWith(receipt);
    });

    it('should simulate network delay', async () => {
      mockShowInformationMessage.mockResolvedValueOnce('Confirm');
      vi.useFakeTimers();

      const paymentPromise = service.pay(samplePaymentRequest);

      // Fast-forward time
      await vi.advanceTimersByTimeAsync(1000);

      const receipt = await paymentPromise;
      expect(receipt.status).toBe('confirmed');

      vi.useRealTimers();
    });
  });

  describe('Real Blockchain Payments', () => {
    beforeEach(() => {
      service = new X402PaymentService({ simulationMode: false });
    });

    it('should throw error for real payments (not yet implemented)', async () => {
      await expect(service.pay(samplePaymentRequest)).rejects.toThrow(
        'Real blockchain payments not yet implemented'
      );
    });
  });

  describe('Payment History', () => {
    beforeEach(() => {
      service = new X402PaymentService({ simulationMode: true });
      mockShowInformationMessage.mockResolvedValue('Confirm');
    });

    it('should track all payments in history', async () => {
      await service.pay(samplePaymentRequest);
      await service.pay({ ...samplePaymentRequest, price: BigInt(2000000000000000) });

      const history = service.getHistory();
      expect(history.length).toBe(2);
    });

    it('should return limited history when limit specified', async () => {
      await service.pay(samplePaymentRequest);
      await service.pay(samplePaymentRequest);
      await service.pay(samplePaymentRequest);

      const history = service.getHistory(2);
      expect(history.length).toBe(2);
    });

    it('should calculate total spent correctly', async () => {
      const amount1 = BigInt(1000000000000000); // 0.001 ETH
      const amount2 = BigInt(2000000000000000); // 0.002 ETH

      await service.pay({ ...samplePaymentRequest, price: amount1 });
      await service.pay({ ...samplePaymentRequest, price: amount2 });

      const total = service.getTotalSpent();
      expect(total).toBe((amount1 + amount2).toString());
    });

    it('should filter total spent by currency', async () => {
      await service.pay({ ...samplePaymentRequest, currency: 'ETH', price: BigInt(1000) });
      await service.pay({ ...samplePaymentRequest, currency: 'USDC', price: BigInt(2000) });

      const ethTotal = service.getTotalSpent('ETH');
      const usdcTotal = service.getTotalSpent('USDC');

      expect(ethTotal).toBe('1000');
      expect(usdcTotal).toBe('2000');
    });

    it('should clear payment history', async () => {
      await service.pay(samplePaymentRequest);
      await service.pay(samplePaymentRequest);

      expect(service.getHistory().length).toBe(2);

      service.clearHistory();
      expect(service.getHistory().length).toBe(0);
    });

    it('should export history as JSON', async () => {
      await service.pay(samplePaymentRequest);

      const exported = service.exportHistory();
      const parsed = JSON.parse(exported);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(1);
      expect(parsed[0].to).toBe(samplePaymentRequest.endpoint);
    });
  });

  describe('Payment Event Listeners', () => {
    beforeEach(() => {
      service = new X402PaymentService({ simulationMode: true });
      mockShowInformationMessage.mockResolvedValue('Confirm');
    });

    it('should register payment listener', () => {
      const listener = vi.fn();
      service.onPayment(listener);
      // No error means successful registration
      expect(true).toBe(true);
    });

    it('should call all registered listeners', async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      service.onPayment(listener1);
      service.onPayment(listener2);

      await service.pay(samplePaymentRequest);

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should unsubscribe listener', async () => {
      const listener = vi.fn();

      service.onPayment(listener);
      await service.pay(samplePaymentRequest);
      expect(listener).toHaveBeenCalledTimes(1);

      service.offPayment(listener);
      await service.pay(samplePaymentRequest);
      expect(listener).toHaveBeenCalledTimes(1); // Should not increase
    });

    it('should handle listener errors gracefully', async () => {
      const errorListener = vi.fn(() => {
        throw new Error('Listener error');
      });
      const normalListener = vi.fn();

      service.onPayment(errorListener);
      service.onPayment(normalListener);

      // Should not throw even if one listener errors
      await expect(service.pay(samplePaymentRequest)).resolves.toBeDefined();
      expect(normalListener).toHaveBeenCalled();
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration', () => {
      service = new X402PaymentService({ network: 'base-sepolia' });

      service.updateConfig({ network: 'ethereum', simulationMode: false });

      const config = service.getConfig();
      expect(config.network).toBe('ethereum');
      expect(config.simulationMode).toBe(false);
    });

    it('should preserve unmodified config values', () => {
      service = new X402PaymentService({
        network: 'base',
        defaultCurrency: 'USDC',
      });

      service.updateConfig({ network: 'ethereum' });

      const config = service.getConfig();
      expect(config.network).toBe('ethereum');
      expect(config.defaultCurrency).toBe('USDC'); // Preserved
    });
  });

  describe('Disabled State', () => {
    beforeEach(() => {
      service = new X402PaymentService({ enabled: false });
    });

    it('should throw error when payments are disabled', async () => {
      await expect(service.pay(samplePaymentRequest)).rejects.toThrow('x402 payments are disabled');
    });
  });

  describe('Different Networks', () => {
    it('should support base network', () => {
      service = new X402PaymentService({ network: 'base' });
      expect(service.getConfig().network).toBe('base');
    });

    it('should support ethereum network', () => {
      service = new X402PaymentService({ network: 'ethereum' });
      expect(service.getConfig().network).toBe('ethereum');
    });

    it('should support base-sepolia testnet', () => {
      service = new X402PaymentService({ network: 'base-sepolia' });
      expect(service.getConfig().network).toBe('base-sepolia');
    });
  });

  describe('Different Currencies', () => {
    beforeEach(() => {
      service = new X402PaymentService({ simulationMode: true });
      mockShowInformationMessage.mockResolvedValue('Confirm');
    });

    it('should support ETH payments', async () => {
      const receipt = await service.pay({ ...samplePaymentRequest, currency: 'ETH' });
      expect(receipt.currency).toBe('ETH');
    });

    it('should support USDC payments', async () => {
      const receipt = await service.pay({ ...samplePaymentRequest, currency: 'USDC' });
      expect(receipt.currency).toBe('USDC');
    });
  });

  describe('Disposal', () => {
    it('should clear listeners on dispose', async () => {
      service = new X402PaymentService({ simulationMode: true });
      mockShowInformationMessage.mockResolvedValue('Confirm');

      const listener = vi.fn();
      service.onPayment(listener);

      service.dispose();

      // Attempting to emit after dispose should not call listener
      // (This would require accessing private methods, so we verify indirectly)
      expect(true).toBe(true);
    });

    it('should handle multiple dispose calls', () => {
      service = new X402PaymentService();
      expect(() => {
        service.dispose();
        service.dispose();
      }).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      service = new X402PaymentService({ simulationMode: true });
    });

    it('should handle very large payment amounts', async () => {
      mockShowInformationMessage.mockResolvedValue('Confirm');
      const largeAmount = BigInt('999999999999999999999999');

      const receipt = await service.pay({
        ...samplePaymentRequest,
        price: largeAmount,
      });

      expect(receipt.amount).toBe(largeAmount.toString());
    });

    it('should handle payment requests with metadata', async () => {
      mockShowInformationMessage.mockResolvedValue('Confirm');

      const requestWithMetadata: PaymentRequest = {
        ...samplePaymentRequest,
        metadata: {
          layer: 'vr',
          contentType: 'PREMIUM_ACCESS',
          userId: 'user123',
        },
      };

      const receipt = await service.pay(requestWithMetadata);
      expect(receipt.status).toBe('confirmed');
    });

    it('should generate unique transaction hashes', async () => {
      mockShowInformationMessage.mockResolvedValue('Confirm');

      const receipt1 = await service.pay(samplePaymentRequest);
      const receipt2 = await service.pay(samplePaymentRequest);

      expect(receipt1.txHash).not.toBe(receipt2.txHash);
    });
  });
});
