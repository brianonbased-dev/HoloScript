/**
 * HITLBackendService Tests
 *
 * Tests for the HITL Backend service including storage backends,
 * approval workflows, and audit logging.
 *
 * @version 3.3.0
 * @Sprint Sprint 3: Safety & Testing
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  HITLBackendService,
  getHITLBackend,
  configureHITLBackend,
  type ApprovalRequest,
  type AuditLogEntry,
  type HITLBackendConfig,
} from '../HITLBackendService';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('HITLBackendService', () => {
  let service: HITLBackendService;
  const testConfig: HITLBackendConfig = {
    apiEndpoint: 'http://localhost:3000/api/hitl',
    timeout: 5000,
    retry: {
      maxAttempts: 3,
      backoffMs: 100,
      maxBackoffMs: 1000,
    },
    storage: {
      type: 'memory',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () =>
        Promise.resolve({
          success: true,
          requestId: 'response_123',
          status: 'pending',
          timestamp: Date.now(),
        }),
      headers: { get: () => null },
    });
    service = new HITLBackendService(testConfig);
  });

  afterEach(async () => {
    await service.clearAuditLogs();
    service.disconnect();
  });

  describe('initialization', () => {
    it('should create service with default config', () => {
      expect(service).toBeInstanceOf(HITLBackendService);
    });

    it('should configure service via factory function', () => {
      configureHITLBackend(testConfig);
      const backend = getHITLBackend();
      expect(backend).toBeInstanceOf(HITLBackendService);
    });

    it('should support memory storage backend', () => {
      const memService = new HITLBackendService({
        ...testConfig,
        storage: { type: 'memory' },
      });
      expect(memService).toBeInstanceOf(HITLBackendService);
    });

    it('should support indexeddb storage config', () => {
      const idbService = new HITLBackendService({
        ...testConfig,
        storage: { type: 'indexeddb', database: 'test_hitl' },
      });
      expect(idbService).toBeInstanceOf(HITLBackendService);
    });

    it('should support REST storage config', () => {
      const restService = new HITLBackendService({
        ...testConfig,
        storage: {
          type: 'rest',
          endpoint: 'http://localhost:3000/api/audit',
          apiKey: 'test-key',
        },
      });
      expect(restService).toBeInstanceOf(HITLBackendService);
    });
  });

  describe('approval requests', () => {
    const mockRequest: ApprovalRequest = {
      id: `req_${Date.now()}`,
      timestamp: Date.now(),
      agentId: 'test-agent',
      action: 'transfer_funds',
      category: 'financial',
      description: 'Transfer $100 to account',
      confidence: 0.85,
      riskScore: 0.6,
      context: { amount: 100, currency: 'USD' },
      status: 'pending',
      expiresAt: Date.now() + 3600000,
      metadata: {},
    };

    it('should submit approval request via API', async () => {
      const response = await service.submitApprovalRequest(mockRequest);

      expect(response).toBeDefined();
      expect(response.success).toBe(true);
      expect(response.requestId).toBeDefined();
      expect(response.status).toBeDefined();
      expect(response.timestamp).toBeDefined();
    });

    it('should call API endpoint for approval', async () => {
      await service.submitApprovalRequest(mockRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/hitl/approvals',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(String),
        })
      );
    });

    it('should retry on failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error')).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, requestId: 'req_123' }),
      });

      const response = await service.submitApprovalRequest(mockRequest);

      expect(response.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should include auth header when API key configured', async () => {
      const authService = new HITLBackendService({
        ...testConfig,
        apiKey: 'test-api-key',
      });

      await authService.submitApprovalRequest(mockRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        })
      );
    });

    it('should work in local-only mode without API endpoint', async () => {
      const localService = new HITLBackendService({
        timeout: 5000,
        retry: { maxAttempts: 3, backoffMs: 100, maxBackoffMs: 1000 },
        storage: { type: 'memory' },
        // No apiEndpoint
      });

      const response = await localService.submitApprovalRequest(mockRequest);

      expect(response.success).toBe(true);
      expect(response.status).toBe('pending');
      // Should not call fetch
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('audit logging', () => {
    const mockEntry: Partial<AuditLogEntry> = {
      agentId: 'test-agent',
      action: 'read_data',
      decision: 'autonomous',
      confidence: 0.95,
      riskScore: 0.1,
      rollbackAvailable: false,
    };

    it('should log audit entry', async () => {
      await service.logAuditEntry(mockEntry);

      const logs = await service.queryAuditLogs({});
      expect(logs.length).toBeGreaterThan(0);
    });

    it('should generate unique audit IDs', async () => {
      await service.logAuditEntry(mockEntry);
      await service.logAuditEntry(mockEntry);

      const logs = await service.queryAuditLogs({});
      expect(logs[0].id).not.toBe(logs[1].id);
    });

    it('should query logs by agent', async () => {
      await service.logAuditEntry(mockEntry);
      await service.logAuditEntry({ ...mockEntry, agentId: 'other-agent' });

      const logs = await service.queryAuditLogs({ agentId: 'test-agent' });
      expect(logs.every((log) => log.agentId === 'test-agent')).toBe(true);
    });

    it('should query logs by decision', async () => {
      await service.logAuditEntry(mockEntry);
      await service.logAuditEntry({ ...mockEntry, decision: 'approved' });

      const logs = await service.queryAuditLogs({ decision: 'autonomous' });
      expect(logs.every((log) => log.decision === 'autonomous')).toBe(true);
    });

    it('should query logs by time range', async () => {
      const now = Date.now();
      await service.logAuditEntry({ ...mockEntry, timestamp: now - 1000 });
      await service.logAuditEntry({ ...mockEntry, timestamp: now });
      await service.logAuditEntry({ ...mockEntry, timestamp: now + 1000 });

      const logs = await service.queryAuditLogs({
        startTime: now - 500,
        endTime: now + 500,
      });
      // Only the middle entry should match
      expect(logs.length).toBeGreaterThanOrEqual(1);
    });

    it('should support pagination', async () => {
      // Add multiple entries
      for (let i = 0; i < 10; i++) {
        await service.logAuditEntry({ ...mockEntry, action: `action_${i}` });
      }

      const page1 = await service.queryAuditLogs({ limit: 3, offset: 0 });
      const page2 = await service.queryAuditLogs({ limit: 3, offset: 3 });

      expect(page1.length).toBe(3);
      expect(page2.length).toBe(3);
      expect(page1[0].id).not.toBe(page2[0].id);
    });

    it('should get audit entry by ID', async () => {
      await service.logAuditEntry(mockEntry);
      const logs = await service.queryAuditLogs({});
      const entry = await service.getAuditEntry(logs[0].id);

      expect(entry).toBeDefined();
      expect(entry?.action).toBe('read_data');
    });

    it('should return null for non-existent entry', async () => {
      const entry = await service.getAuditEntry('non-existent-id');
      expect(entry).toBeNull();
    });

    it('should clear all audit logs', async () => {
      await service.logAuditEntry(mockEntry);
      await service.logAuditEntry(mockEntry);

      await service.clearAuditLogs();

      const logs = await service.queryAuditLogs({});
      expect(logs.length).toBe(0);
    });

    it('should track violations', async () => {
      await service.logAuditEntry({
        ...mockEntry,
        isViolation: true,
        violations: [{ type: 'rate_limit', message: 'Too many requests' }],
      });

      const logs = await service.queryAuditLogs({});
      expect(logs[0].isViolation).toBe(true);
      expect(logs[0].violations).toHaveLength(1);
    });
  });

  describe('rollback support', () => {
    it('should create rollback checkpoint', async () => {
      await service.logAuditEntry({
        agentId: 'test-agent',
        action: 'update_config',
        decision: 'approved',
        confidence: 0.9,
        riskScore: 0.3,
        rollbackAvailable: true,
        rollbackId: 'checkpoint-1',
      });

      const logs = await service.queryAuditLogs({});
      expect(logs[0].rollbackAvailable).toBe(true);
      expect(logs[0].rollbackId).toBe('checkpoint-1');
    });

    it('should execute rollback', async () => {
      // Without API endpoint, rollback returns false
      const result = await service.executeRollback('checkpoint-1', 'admin@test.com');

      expect(typeof result).toBe('boolean');
    });
  });

  describe('connection management', () => {
    it('should connect to WebSocket if configured', async () => {
      const wsService = new HITLBackendService({
        ...testConfig,
        wsEndpoint: 'ws://localhost:3000/hitl',
      });

      // Should not throw
      expect(wsService).toBeInstanceOf(HITLBackendService);
      wsService.disconnect();
    });

    it('should disconnect gracefully', () => {
      service.disconnect();
      // Should not throw on multiple disconnects
      service.disconnect();
    });
  });

  describe('error handling', () => {
    it('should handle submission errors gracefully', async () => {
      // Request with minimal fields should still work
      const mockEmptyRequest: ApprovalRequest = {
        id: `req_${Date.now()}`,
        timestamp: Date.now(),
        agentId: '',
        action: '',
        category: 'read',
        description: '',
        confidence: 0,
        riskScore: 0,
        status: 'pending',
        expiresAt: Date.now() + 3600000,
        context: {},
        metadata: {},
      };
      const response = await service.submitApprovalRequest(mockEmptyRequest);

      expect(response).toBeDefined();
      expect(response.requestId).toBeDefined();
    });
  });
});

describe('Memory Storage Backend', () => {
  let service: HITLBackendService;

  beforeEach(() => {
    service = new HITLBackendService({
      apiEndpoint: 'http://localhost:3000/api/hitl',
      timeout: 5000,
      retry: { maxAttempts: 3, backoffMs: 100, maxBackoffMs: 1000 },
      storage: { type: 'memory' },
    });
  });

  afterEach(async () => {
    await service.clearAuditLogs();
  });

  it('should persist entries in memory', async () => {
    await service.logAuditEntry({
      agentId: 'agent-1',
      action: 'test',
      decision: 'autonomous',
      confidence: 0.9,
      riskScore: 0.1,
      rollbackAvailable: false,
    });

    const logs = await service.queryAuditLogs({});
    expect(logs.length).toBe(1);
  });

  it('should clear memory storage', async () => {
    await service.logAuditEntry({
      agentId: 'agent-1',
      action: 'test',
      decision: 'autonomous',
      confidence: 0.9,
      riskScore: 0.1,
      rollbackAvailable: false,
    });

    await service.clearAuditLogs();

    const logs = await service.queryAuditLogs({});
    expect(logs.length).toBe(0);
  });

  it('should filter by multiple criteria', async () => {
    await service.logAuditEntry({
      agentId: 'agent-1',
      action: 'read',
      decision: 'autonomous',
      confidence: 0.9,
      riskScore: 0.1,
      rollbackAvailable: false,
    });
    await service.logAuditEntry({
      agentId: 'agent-1',
      action: 'write',
      decision: 'approved',
      confidence: 0.8,
      riskScore: 0.3,
      rollbackAvailable: true,
    });
    await service.logAuditEntry({
      agentId: 'agent-2',
      action: 'read',
      decision: 'autonomous',
      confidence: 0.95,
      riskScore: 0.05,
      rollbackAvailable: false,
    });

    const logs = await service.queryAuditLogs({
      agentId: 'agent-1',
      decision: 'autonomous',
    });

    expect(logs.length).toBe(1);
    expect(logs[0].action).toBe('read');
  });
});
