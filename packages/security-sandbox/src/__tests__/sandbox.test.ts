/**
 * Security Sandbox Tests
 *
 * Validates that the sandbox properly isolates and protects against:
 * - Invalid syntax
 * - Malicious code patterns
 * - Resource exhaustion
 * - Timeout violations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HoloScriptSandbox, executeSafely } from '../index';

describe('HoloScriptSandbox', () => {
  let sandbox: HoloScriptSandbox;

  beforeEach(() => {
    sandbox = new HoloScriptSandbox({
      timeout: 1000,
      enableLogging: true,
    });
  });

  describe('Valid Code Execution', () => {
    it('should validate and report valid HoloScript that is not executable JS', async () => {
      const validCode = `
        cube {
          @color(red)
          @position(0, 0, 0)
        }
      `;

      const result = await sandbox.executeHoloScript(validCode, { source: 'user' });

      // Valid HoloScript passes validation but is not executable as JavaScript
      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('syntax');
      expect(result.metadata.validated).toBe(true);
      expect(result.metadata.executionTime).toBeGreaterThan(0);
    });

    it('should execute simple JavaScript expressions', async () => {
      const code = '2 + 2';
      const result = await sandbox.executeHoloScript<number>(code, { source: 'trusted' });

      expect(result.success).toBe(true);
      expect(result.data).toBe(4);
    });
  });

  describe('Syntax Validation', () => {
    it('should reject invalid HoloScript syntax', async () => {
      const invalidCode = `
        cube {{{
          @invalid-trait***
        }
      `;

      const result = await sandbox.executeHoloScript(invalidCode, { source: 'ai-generated' });

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('validation');
      expect(result.error?.message).toContain('syntax');
      expect(result.metadata.validated).toBe(false);
    });

    it('should reject empty code', async () => {
      const result = await sandbox.executeHoloScript('', { source: 'user' });

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('validation');
    });
  });

  describe('Security Protection', () => {
    it('should prevent filesystem access', async () => {
      const maliciousCode = `
        const fs = require('fs');
        fs.readFileSync('/etc/passwd');
      `;

      const result = await sandbox.executeHoloScript(maliciousCode, { source: 'ai-generated' });

      expect(result.success).toBe(false);
      // require is now caught at validation level (GLOBALS_BLOCKLIST); runtime is also valid
      expect(['validation', 'runtime']).toContain(result.error?.type);
    });

    it('should prevent network access', async () => {
      const maliciousCode = `
        const http = require('http');
        http.get('http://evil.com');
      `;

      const result = await sandbox.executeHoloScript(maliciousCode, { source: 'ai-generated' });

      expect(result.success).toBe(false);
      // Network access may be caught at validation or runtime depending on static analysis
      expect(['validation', 'runtime']).toContain(result.error?.type);
    });

    it('should prevent process access', async () => {
      const maliciousCode = `
        process.exit(1);
      `;

      const result = await sandbox.executeHoloScript(maliciousCode, { source: 'ai-generated' });

      expect(result.success).toBe(false);
      // process is now caught at validation level (GLOBALS_BLOCKLIST); runtime is also valid
      expect(['validation', 'runtime']).toContain(result.error?.type);
    });

    it('should enforce timeout limits', async () => {
      const timeoutCode = `
        while(true) {
          // Infinite loop
        }
      `;

      const quickSandbox = new HoloScriptSandbox({ timeout: 100 });
      const result = await quickSandbox.executeHoloScript(timeoutCode, { source: 'ai-generated' });

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('timeout');
    });
  });

  describe('Audit Logging', () => {
    it('should log validation events', async () => {
      const code = `cube { @color(blue) }`;
      await sandbox.executeHoloScript(code, { source: 'user' });

      const logs = sandbox.getAuditLogs();
      expect(logs.length).toBeGreaterThan(0);

      const validationLog = logs.find((log) => log.action === 'validate');
      expect(validationLog).toBeDefined();
      expect(validationLog?.success).toBe(true);
    });

    it('should log rejection events', async () => {
      const invalidCode = 'invalid {{{ code';
      await sandbox.executeHoloScript(invalidCode, { source: 'ai-generated' });

      const logs = sandbox.getAuditLogs();
      const rejectionLog = logs.find((log) => log.action === 'reject');

      expect(rejectionLog).toBeDefined();
      expect(rejectionLog?.success).toBe(false);
      expect(rejectionLog?.reason).toContain('Validation failed');
    });

    it('should filter logs by source', async () => {
      await sandbox.executeHoloScript('2 + 2', { source: 'ai-generated' });
      await sandbox.executeHoloScript('3 + 3', { source: 'user' });

      const aiLogs = sandbox.getAuditLogs({ source: 'ai-generated' });
      const userLogs = sandbox.getAuditLogs({ source: 'user' });

      expect(aiLogs.length).toBeGreaterThan(0);
      expect(userLogs.length).toBeGreaterThan(0);
      expect(aiLogs.every((log) => log.source === 'ai-generated')).toBe(true);
    });

    it('should filter logs by time range', async () => {
      const startTime = Date.now();
      await sandbox.executeHoloScript('1 + 1', { source: 'user' });
      const endTime = Date.now();

      const logs = sandbox.getAuditLogs({ startTime, endTime: endTime + 1000 });
      expect(logs.length).toBeGreaterThan(0);
    });

    it('should limit audit log size to 1000 entries', async () => {
      const largeSandbox = new HoloScriptSandbox({ enableLogging: true });

      // Generate > 1000 logs
      for (let i = 0; i < 1100; i++) {
        await largeSandbox.executeHoloScript('1 + 1', { source: 'user' });
      }

      const logs = largeSandbox.getAuditLogs();
      expect(logs.length).toBeLessThanOrEqual(1000);
    }, 15_000); // 1100 VM executions; 15 s budget

    it('should clear audit logs', async () => {
      await sandbox.executeHoloScript('1 + 1', { source: 'user' });
      expect(sandbox.getAuditLogs().length).toBeGreaterThan(0);

      sandbox.clearAuditLogs();
      expect(sandbox.getAuditLogs().length).toBe(0);
    });
  });

  describe('Security Statistics', () => {
    it('should track validation stats', async () => {
      await sandbox.executeHoloScript('1 + 1', { source: 'user' });
      await sandbox.executeHoloScript('invalid {{{', { source: 'ai-generated' });

      const stats = sandbox.getSecurityStats();
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.validated).toBeGreaterThan(0);
      expect(stats.rejected).toBeGreaterThan(0);
    });

    it('should track execution stats', async () => {
      await sandbox.executeHoloScript('2 + 2', { source: 'user' });

      const stats = sandbox.getSecurityStats();
      expect(stats.executed).toBeGreaterThan(0);
    });

    it('should track stats by source', async () => {
      await sandbox.executeHoloScript('1 + 1', { source: 'ai-generated' });
      await sandbox.executeHoloScript('2 + 2', { source: 'user' });

      const stats = sandbox.getSecurityStats();
      expect(stats.bySource['ai-generated']).toBeGreaterThan(0);
      expect(stats.bySource['user']).toBeGreaterThan(0);
    });
  });

  describe('Convenience Functions', () => {
    it('should execute safely with executeSafely helper', async () => {
      const result = await executeSafely<number>('5 + 5', { timeout: 1000 });

      expect(result.success).toBe(true);
      expect(result.data).toBe(10);
    });

    it('should handle errors with executeSafely helper', async () => {
      const result = await executeSafely('invalid code {{{', { source: 'ai-generated' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Custom Sandbox Configuration', () => {
    it('should respect custom timeout settings', async () => {
      const quickSandbox = new HoloScriptSandbox({ timeout: 50 });
      const slowCode = `
        let sum = 0;
        for(let i = 0; i < 1000000; i++) {
          sum += i;
        }
      `;

      const result = await quickSandbox.executeHoloScript(slowCode);
      expect(result.metadata.executionTime).toBeLessThan(100);
    });

    it('should allow custom sandbox globals', async () => {
      const customSandbox = new HoloScriptSandbox({
        sandbox: {
          customValue: 42,
        },
      });

      const result = await customSandbox.executeHoloScript<number>('customValue * 2');
      expect(result.success).toBe(true);
      expect(result.data).toBe(84);
    });

    it('should respect logging configuration', async () => {
      const noLogSandbox = new HoloScriptSandbox({ enableLogging: false });
      await noLogSandbox.executeHoloScript('1 + 1');

      expect(noLogSandbox.getAuditLogs().length).toBe(0);
    });
  });
});
