/**
 * Unit tests for ARPreviewService
 *
 * Tests AR portal simulation including:
 * - Portal creation with different trigger types
 * - QR code generation
 * - Scan simulation
 * - Layer transition tracking
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ARPreviewService } from '../services/ARPreviewService';

// Mock vscode module
vi.mock('vscode', async () => {
  const actual = await vi.importActual('vscode');
  return {
    ...actual,
    window: {
      ...((actual as any).window || {}),
      showInformationMessage: vi.fn().mockResolvedValue(undefined),
      withProgress: vi.fn((options, task) => task({ report: vi.fn() })),
      createOutputChannel: vi.fn(() => ({
        appendLine: vi.fn(),
        show: vi.fn(),
        dispose: vi.fn(),
      })),
    },
    env: {
      openExternal: vi.fn(),
    },
    Uri: {
      parse: vi.fn((url: string) => ({ toString: () => url })),
    },
    ProgressLocation: {
      Notification: 15,
    },
  };
});

import * as vscode from 'vscode';
const mockShowInformationMessage = vscode.window.showInformationMessage as ReturnType<typeof vi.fn>;

describe('ARPreviewService', () => {
  let service: ARPreviewService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (service) {
      service.dispose();
    }
  });

  describe('Constructor and Configuration', () => {
    it('should create service with default configuration', () => {
      service = new ARPreviewService();
      const config = service.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.autoGenerateQR).toBe(true);
      expect(config.simulateCameraFeed).toBe(true);
    });

    it('should create service with custom configuration', () => {
      service = new ARPreviewService({
        enabled: false,
        autoGenerateQR: false,
        simulateCameraFeed: false,
      });

      const config = service.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.autoGenerateQR).toBe(false);
      expect(config.simulateCameraFeed).toBe(false);
    });
  });

  describe('Portal Creation', () => {
    beforeEach(() => {
      service = new ARPreviewService();
    });

    it('should create QR portal', () => {
      const portal = service.createPortal('VRR Coffee Shop', {
        title: 'Coffee Shop Entry',
        description: 'Enter the VRR coffee shop experience',
        triggerType: 'qr',
      });

      expect(portal.id).toMatch(/^portal_\d+_[a-z0-9]+$/);
      expect(portal.title).toBe('Coffee Shop Entry');
      expect(portal.triggerType).toBe('qr');
      expect(portal.triggerData).toMatch(/^https:\/\/hololand\.app\/portal\//);
      expect(portal.requiresPayment).toBe(false);
    });

    it('should create image marker portal', () => {
      const portal = service.createPortal('Art Gallery VR', {
        title: 'Gallery Entry',
        description: 'Scan the painting to enter',
        triggerType: 'image',
      });

      expect(portal.triggerType).toBe('image');
      expect(portal.triggerData).toContain('marker_');
    });

    it('should create location-based portal', () => {
      const portal = service.createPortal('City Tour', {
        title: 'Downtown Tour',
        description: 'Visit this location',
        triggerType: 'location',
      });

      expect(portal.triggerType).toBe('location');
      expect(portal.triggerData).toMatch(/^[\d.-]+,[\d.-]+$/); // lat,lon format
    });

    it('should create paid portal', () => {
      const portal = service.createPortal('Premium VR Experience', {
        title: 'Premium Entry',
        description: 'Exclusive content',
        price: 1000000000000000, // 0.001 ETH in wei
      });

      expect(portal.requiresPayment).toBe(true);
      expect(portal.price).toBe(1000000000000000);
    });

    it('should default to QR trigger type', () => {
      const portal = service.createPortal('Default Portal', {
        title: 'Default',
        description: 'Test',
      });

      expect(portal.triggerType).toBe('qr');
    });
  });

  describe('Portal Management', () => {
    beforeEach(() => {
      service = new ARPreviewService();
    });

    it('should get all portals', () => {
      service.createPortal('Dest1', { title: 'P1', description: 'D1' });
      service.createPortal('Dest2', { title: 'P2', description: 'D2' });

      const portals = service.getAllPortals();
      expect(portals.length).toBe(2);
    });

    it('should get portal by ID', () => {
      const portal = service.createPortal('Test Dest', {
        title: 'Find Me',
        description: 'Test',
      });

      const found = service.getPortal(portal.id);
      expect(found?.title).toBe('Find Me');
    });

    it('should return undefined for non-existent portal', () => {
      const portal = service.getPortal('fake-id');
      expect(portal).toBeUndefined();
    });

    it('should delete portal', () => {
      const portal = service.createPortal('Temp', {
        title: 'Delete Me',
        description: 'Test',
      });

      const deleted = service.deletePortal(portal.id);
      expect(deleted).toBe(true);
      expect(service.getPortal(portal.id)).toBeUndefined();
    });

    it('should return false when deleting non-existent portal', () => {
      const deleted = service.deletePortal('fake-id');
      expect(deleted).toBe(false);
    });
  });

  describe('QR Scan Simulation', () => {
    beforeEach(() => {
      service = new ARPreviewService();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should simulate scan without payment', async () => {
      mockShowInformationMessage.mockResolvedValueOnce(undefined); // createPortal call

      const portal = service.createPortal('Free Content', {
        title: 'Free Portal',
        description: 'No payment required',
      });

      const scanPromise = service.simulateScan(portal);
      await vi.advanceTimersByTimeAsync(2000); // Advance through setTimeout delays
      await scanPromise;

      const scanHistory = service.getScanHistory();
      expect(scanHistory.length).toBe(1);
      expect(scanHistory[0].portalId).toBe(portal.id);
    });

    it('should add scan to history', async () => {
      mockShowInformationMessage.mockResolvedValueOnce(undefined); // createPortal call

      const portal = service.createPortal('Test', {
        title: 'Portal',
        description: 'Test',
      });

      const scanPromise = service.simulateScan(portal);
      await vi.advanceTimersByTimeAsync(2000);
      await scanPromise;

      const history = service.getScanHistory();
      expect(history.length).toBe(1);
      expect(history[0].format).toBe('QR_CODE');
    });

    it('should record transition on successful scan', async () => {
      mockShowInformationMessage.mockResolvedValueOnce(undefined); // createPortal call

      const portal = service.createPortal('VRR Space', {
        title: 'Space Entry',
        description: 'Test',
      });

      const scanPromise = service.simulateScan(portal);
      await vi.advanceTimersByTimeAsync(2000);
      await scanPromise;

      const transitions = service.getTransitionHistory();
      expect(transitions.length).toBe(1);
      expect(transitions[0].from).toBe('ar');
      expect(transitions[0].to).toBe('vrr');
    });

    it('should cancel on payment rejection', async () => {
      mockShowInformationMessage.mockResolvedValueOnce(undefined); // createPortal call
      mockShowInformationMessage.mockResolvedValueOnce('Cancel'); // payment prompt

      const portal = service.createPortal('Paid Content', {
        title: 'Premium',
        description: 'Costs money',
        price: 1000000,
      });

      const scanPromise = service.simulateScan(portal);
      await vi.advanceTimersByTimeAsync(2000);
      await scanPromise;

      // Should not create transition if payment cancelled
      const transitions = service.getTransitionHistory();
      expect(transitions.length).toBe(0);
    });

    it('should process payment and transition', async () => {
      mockShowInformationMessage.mockResolvedValueOnce(undefined); // createPortal call
      mockShowInformationMessage.mockResolvedValueOnce('Pay & Enter'); // payment prompt

      const portal = service.createPortal('Premium VR', {
        title: 'Premium',
        description: 'Paid content',
        price: 5000000,
      });

      const scanPromise = service.simulateScan(portal);
      await vi.advanceTimersByTimeAsync(2000);
      await scanPromise;

      const transitions = service.getTransitionHistory();
      expect(transitions.length).toBe(1);
      expect(transitions[0].paymentTxHash).toBeDefined();
    });
  });

  describe('History Management', () => {
    beforeEach(() => {
      service = new ARPreviewService();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should get limited scan history', async () => {
      mockShowInformationMessage.mockResolvedValue(undefined); // All calls

      const portal = service.createPortal('Test', { title: 'P', description: 'D' });

      const scan1 = service.simulateScan(portal);
      await vi.advanceTimersByTimeAsync(2000);
      await scan1;

      const scan2 = service.simulateScan(portal);
      await vi.advanceTimersByTimeAsync(2000);
      await scan2;

      const scan3 = service.simulateScan(portal);
      await vi.advanceTimersByTimeAsync(2000);
      await scan3;

      const history = service.getScanHistory(2);
      expect(history.length).toBe(2);
    });

    it('should get limited transition history', async () => {
      mockShowInformationMessage.mockResolvedValue(undefined); // All calls

      const portal = service.createPortal('Test', { title: 'P', description: 'D' });

      const scan1 = service.simulateScan(portal);
      await vi.advanceTimersByTimeAsync(2000);
      await scan1;

      const scan2 = service.simulateScan(portal);
      await vi.advanceTimersByTimeAsync(2000);
      await scan2;

      const history = service.getTransitionHistory(1);
      expect(history.length).toBe(1);
    });

    it('should clear all history', async () => {
      mockShowInformationMessage.mockResolvedValueOnce(undefined); // createPortal call

      const portal = service.createPortal('Test', { title: 'P', description: 'D' });

      const scanPromise = service.simulateScan(portal);
      await vi.advanceTimersByTimeAsync(2000);
      await scanPromise;

      service.clearHistory();

      expect(service.getScanHistory().length).toBe(0);
      expect(service.getTransitionHistory().length).toBe(0);
    });
  });

  describe('Export', () => {
    beforeEach(() => {
      service = new ARPreviewService();
    });

    it('should export portals as JSON', () => {
      service.createPortal('Dest1', { title: 'P1', description: 'D1' });
      service.createPortal('Dest2', { title: 'P2', description: 'D2' });

      const exported = service.exportPortals();
      const parsed = JSON.parse(exported);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration', () => {
      service = new ARPreviewService({ enabled: true });

      service.updateConfig({ enabled: false, autoGenerateQR: false });

      const config = service.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.autoGenerateQR).toBe(false);
    });
  });

  describe('Disposal', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should clear all data on dispose', async () => {
      mockShowInformationMessage.mockResolvedValueOnce(undefined); // createPortal call

      service = new ARPreviewService();
      const portal = service.createPortal('Test', { title: 'P', description: 'D' });

      const scanPromise = service.simulateScan(portal);
      await vi.advanceTimersByTimeAsync(2000);
      await scanPromise;

      service.dispose();

      expect(service.getAllPortals().length).toBe(0);
      expect(service.getScanHistory().length).toBe(0);
      expect(service.getTransitionHistory().length).toBe(0);
    });
  });
});
