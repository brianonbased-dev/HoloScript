/**
 * Receipt Capability Query MCP Tools tests
 *
 * Validates the MCP tool definitions and handler logic for
 * holo_query_receipts and holo_list_receipt_capabilities.
 *
 * Created: task_1779157196014_yx3r
 */

import { describe, it, expect } from 'vitest';
import {
  receiptQueryTools,
  handleReceiptQueryTool,
} from '../receipt-query-tools';

describe('Receipt Query Tools', () => {
  describe('Tool definitions', () => {
    it('exports two tools', () => {
      expect(receiptQueryTools.length).toBe(2);
    });

    it('has holo_query_receipts tool', () => {
      const tool = receiptQueryTools.find((t) => t.name === 'holo_query_receipts');
      expect(tool).toBeDefined();
      expect(tool!.description).toContain('receipt');
      expect(tool!.inputSchema.properties).toBeDefined();
      expect(tool!.inputSchema.properties!.capability).toBeDefined();
      expect(tool!.inputSchema.properties!.subject).toBeDefined();
    });

    it('has holo_list_receipt_capabilities tool', () => {
      const tool = receiptQueryTools.find((t) => t.name === 'holo_list_receipt_capabilities');
      expect(tool).toBeDefined();
      expect(tool!.description).toContain('receipt');
      expect(tool!.inputSchema.properties!.includeSubjects).toBeDefined();
    });
  });

  describe('handleReceiptQueryTool', () => {
    it('returns null for unknown tool name', async () => {
      const result = await handleReceiptQueryTool('unknown_tool', {});
      expect(result).toBeNull();
    });

    it('handles holo_query_receipts with no args', async () => {
      const result = await handleReceiptQueryTool('holo_query_receipts', {});
      expect(result).not.toBeNull();
      const data = result as { count: number; capabilities: unknown[] };
      expect(data.count).toBeGreaterThan(0);
      expect(data.capabilities.length).toBe(data.count);
    });

    it('handles holo_query_receipts with capability filter', async () => {
      const result = await handleReceiptQueryTool('holo_query_receipts', {
        capability: 'hardware',
      });
      expect(result).not.toBeNull();
      const data = result as { count: number; capabilities: unknown[]; capability: string };
      expect(data.count).toBeGreaterThanOrEqual(1);
      expect(data.capability).toBe('hardware');
    });

    it('handles holo_query_receipts with capability and subject', async () => {
      const result = await handleReceiptQueryTool('holo_query_receipts', {
        capability: 'device',
        subject: 'consent',
      });
      expect(result).not.toBeNull();
      const data = result as { count: number; capabilities: unknown[]; subject: string };
      expect(data.count).toBeGreaterThanOrEqual(1);
      expect(data.subject).toBe('consent');
    });

    it('handles holo_list_receipt_capabilities', async () => {
      const result = await handleReceiptQueryTool('holo_list_receipt_capabilities', {});
      expect(result).not.toBeNull();
      const data = result as {
        totalCapabilities: number;
        capabilities: unknown[];
        allSubjects: string[];
      };
      expect(data.totalCapabilities).toBeGreaterThan(0);
      expect(data.capabilities.length).toBe(data.totalCapabilities);
      expect(data.allSubjects.length).toBeGreaterThan(0);
    });

    it('handles holo_list_receipt_capabilities without subjects', async () => {
      const result = await handleReceiptQueryTool('holo_list_receipt_capabilities', {
        includeSubjects: false,
      });
      expect(result).not.toBeNull();
      const data = result as {
        totalCapabilities: number;
        capabilities: Array<{ capability: string; subjects?: string[] }>;
        allSubjects: string[];
      };
      expect(data.totalCapabilities).toBeGreaterThan(0);
      // When includeSubjects is false, subjects should not be in the output
      for (const cap of data.capabilities) {
        expect(cap.subjects).toBeUndefined();
      }
      expect(data.allSubjects).toEqual([]);
    });
  });
});