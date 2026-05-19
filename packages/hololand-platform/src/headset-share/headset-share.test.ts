import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';

import {
  buildHeadsetShareReceipt,
  detectAllLanIps,
  detectLanIp,
  generateShareId,
  renderScenePage,
  adbAvailable,
  adbListDevices,
  adbReverseForward,
  adbReverseRemove,
  type CommandRunner,
} from './index';

const FIXED_NOW = '2026-05-18T12:00:00.000Z';

function makeFailingAdbRunner(): CommandRunner {
  return () => ({ status: 1, stdout: '', stderr: 'adb not found' });
}

function makePassingAdbRunner(devices: string[] = ['quest3-device-1']): CommandRunner {
  return (command: string, args: string[]) => {
    if (command === 'adb' && args[0] === 'version') {
      return {
        status: 0,
        stdout: 'Android Debug Bridge version 1.0.41',
        stderr: '',
      };
    }
    if (command === 'adb' && args[0] === 'devices') {
      const header = 'List of devices attached\n';
      const deviceLines = devices.map((d) => `${d}\tdevice`).join('\n');
      return { status: 0, stdout: header + deviceLines + '\n', stderr: '' };
    }
    if (command === 'adb' && args.includes('reverse')) {
      return { status: 0, stdout: '', stderr: '' };
    }
    return { status: 1, stdout: '', stderr: 'unknown command' };
  };
}

describe('HoloLand Headset Share Transport', () => {
  describe('generateShareId', () => {
    it('generates unique IDs of length 12', () => {
      const id1 = generateShareId();
      const id2 = generateShareId();
      expect(id1).not.toBe(id2);
      expect(id1).toHaveLength(12);
      expect(id1).toMatch(/^[0-9a-f-]+$/);
    });
  });

  describe('detectLanIp', () => {
    it('returns a string or null (non-blocking on any environment)', () => {
      const ip = detectLanIp();
      // In CI or unusual environments, may be null
      if (ip !== null) {
        expect(ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
      }
    });
  });

  describe('detectAllLanIps', () => {
    it('returns an array of strings', () => {
      const ips = detectAllLanIps();
      expect(Array.isArray(ips)).toBe(true);
      for (const ip of ips) {
        expect(ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
      }
    });
  });

  describe('buildHeadsetShareReceipt', () => {
    it('builds a valid lan-https receipt', () => {
      const receipt = buildHeadsetShareReceipt({
        shareId: 'abc123',
        transport: 'lan-https',
        url: 'http://192.168.1.100:8420/s/abc123',
        hostIp: '192.168.1.100',
        port: 8420,
        serverStartupMs: 150,
        urlReadyMs: 200,
        taskId: 'task_1778964942978_iuct',
        now: FIXED_NOW,
      });

      expect(receipt.schemaVersion).toBe('hololand-headset-share-receipt/v1');
      expect(receipt.receiptId).toMatch(/^hlshare_[a-f0-9]{16}$/);
      expect(receipt.transport).toBe('lan-https');
      expect(receipt.captureTransport).toBe('lan-https');
      expect(receipt.url).toBe('http://192.168.1.100:8420/s/abc123');
      expect(receipt.shareId).toBe('abc123');
      expect(receipt.taskId).toBe('task_1778964942978_iuct');
      expect(receipt.overallStatus).toBe('pass');
      expect(receipt.headsetEvidence.hostIp).toBe('192.168.1.100');
      expect(receipt.headsetEvidence.port).toBe(8420);
      expect(receipt.headsetEvidence.adbForwarded).toBeUndefined();
      expect(receipt.frameTiming.serverStartupMs).toBe(150);
      expect(receipt.webxr.available).toBe(false); // Node.js has no WebXR
    });

    it('builds a valid usb-adb receipt with adbForwarded flag', () => {
      const receipt = buildHeadsetShareReceipt({
        shareId: 'def456',
        transport: 'usb-adb',
        url: 'https://localhost:8420/s/def456',
        hostIp: 'localhost',
        port: 8420,
        adbForwarded: true,
        now: FIXED_NOW,
      });

      expect(receipt.transport).toBe('usb-adb');
      expect(receipt.captureTransport).toBe('usb-adb');
      expect(receipt.headsetEvidence.adbForwarded).toBe(true);
      expect(receipt.overallStatus).toBe('pass');
    });

    it('builds a valid holomesh-relay receipt with relayId', () => {
      const receipt = buildHeadsetShareReceipt({
        shareId: 'ghi789',
        transport: 'holomesh-relay',
        url: 'https://mcp.holoscript.net/s/ghi789',
        relayId: 'relay-xyz',
        customDomain: 'hololand.io',
        now: FIXED_NOW,
      });

      expect(receipt.transport).toBe('holomesh-relay');
      expect(receipt.headsetEvidence.relayId).toBe('relay-xyz');
      expect(receipt.headsetEvidence.customDomain).toBe('hololand.io');
    });

    it('marks ngrok-https as warn status', () => {
      const receipt = buildHeadsetShareReceipt({
        shareId: 'ngrok001',
        transport: 'ngrok-https',
        url: 'https://abc123.ngrok.io/s/ngrok001',
        now: FIXED_NOW,
      });

      expect(receipt.transport).toBe('ngrok-https');
      expect(receipt.overallStatus).toBe('warn');
    });

    it('marks missing URL as fail status', () => {
      const receipt = buildHeadsetShareReceipt({
        shareId: 'fail001',
        transport: 'lan-https',
        url: '',
        now: FIXED_NOW,
      });

      expect(receipt.overallStatus).toBe('fail');
    });

    it('includes webxr note when available', () => {
      const receipt = buildHeadsetShareReceipt({
        shareId: 'webxr001',
        transport: 'lan-https',
        url: 'http://192.168.1.100:8420/s/webxr001',
        webxrAvailable: true,
        immersiveVrSupported: true,
        immersiveArSupported: false,
        now: FIXED_NOW,
      });

      expect(receipt.webxr.available).toBe(true);
      expect(receipt.webxr.immersiveVrSupported).toBe(true);
      expect(receipt.webxr.immersiveArSupported).toBe(false);
      expect(receipt.webxr.note).toContain('WebXR API detected');
    });
  });

  describe('renderScenePage', () => {
    it('renders a complete HTML page with scene metadata', () => {
      const html = renderScenePage('test123', 'My Scene', 'Author', 'ball { position 0 1 0 }');

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('My Scene');
      expect(html).toContain('Author');
      expect(html).toContain('test123');
      expect(html).toContain('ball { position 0 1 0 }');
      expect(html).toContain('__hololandShare');
      expect(html).toContain("shareId: 'test123'");
      expect(html).toContain("transport: 'lan-https'");
      expect(html).toContain("captureTransport: 'lan-https'");
    });

    it('escapes HTML in code content', () => {
      const html = renderScenePage('esc1', 'Test', 'A', '<script>alert(1)</script>');
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('escapes HTML in name', () => {
      const html = renderScenePage('esc2', '<b>bold</b>', 'A', 'code');
      expect(html).not.toContain('<b>bold</b>');
      expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
    });
  });

  describe('ADB helpers', () => {
    it('adbAvailable returns false when ADB is not installed', () => {
      const result = adbAvailable(makeFailingAdbRunner());
      expect(result).toBe(false);
    });

    it('adbAvailable returns true when ADB responds', () => {
      const result = adbAvailable(makePassingAdbRunner());
      expect(result).toBe(true);
    });

    it('adbListDevices returns empty array when ADB fails', () => {
      const devices = adbListDevices(makeFailingAdbRunner());
      expect(devices).toEqual([]);
    });

    it('adbListDevices returns device serials', () => {
      const devices = adbListDevices(makePassingAdbRunner(['quest3-abc', 'quest3-def']));
      expect(devices).toEqual(['quest3-abc', 'quest3-def']);
    });

    it('adbReverseForward constructs correct arguments', () => {
      const calls: Array<{ command: string; args: string[] }> = [];
      const runner: CommandRunner = (command, args) => {
        calls.push({ command, args });
        return { status: 0, stdout: '', stderr: '' };
      };

      adbReverseForward(8420, 8420, undefined, runner);
      expect(calls[0]).toEqual({
        command: 'adb',
        args: ['reverse', 'tcp:8420', 'tcp:8420'],
      });
    });

    it('adbReverseForward includes device serial when specified', () => {
      const calls: Array<{ command: string; args: string[] }> = [];
      const runner: CommandRunner = (command, args) => {
        calls.push({ command, args });
        return { status: 0, stdout: '', stderr: '' };
      };

      adbReverseForward(8420, 8420, 'quest3-abc', runner);
      expect(calls[0]).toEqual({
        command: 'adb',
        args: ['-s', 'quest3-abc', 'reverse', 'tcp:8420', 'tcp:8420'],
      });
    });

    it('adbReverseRemove constructs correct arguments', () => {
      const calls: Array<{ command: string; args: string[] }> = [];
      const runner: CommandRunner = (command, args) => {
        calls.push({ command, args });
        return { status: 0, stdout: '', stderr: '' };
      };

      adbReverseRemove(8420, undefined, runner);
      expect(calls[0]).toEqual({
        command: 'adb',
        args: ['reverse', '--remove', 'tcp:8420'],
      });
    });
  });

  describe('receipt determinism', () => {
    it('produces the same receiptId for identical inputs', () => {
      const receipt1 = buildHeadsetShareReceipt({
        shareId: 'deterministic',
        transport: 'lan-https',
        url: 'http://192.168.1.100:8420/s/deterministic',
        hostIp: '192.168.1.100',
        port: 8420,
        now: FIXED_NOW,
      });

      const receipt2 = buildHeadsetShareReceipt({
        shareId: 'deterministic',
        transport: 'lan-https',
        url: 'http://192.168.1.100:8420/s/deterministic',
        hostIp: '192.168.1.100',
        port: 8420,
        now: FIXED_NOW,
      });

      expect(receipt1.receiptId).toBe(receipt2.receiptId);
    });

    it('produces different receiptId for different inputs', () => {
      const receipt1 = buildHeadsetShareReceipt({
        shareId: 'first',
        transport: 'lan-https',
        url: 'http://192.168.1.100:8420/s/first',
        now: FIXED_NOW,
      });

      const receipt2 = buildHeadsetShareReceipt({
        shareId: 'second',
        transport: 'lan-https',
        url: 'http://192.168.1.100:8420/s/second',
        now: FIXED_NOW,
      });

      expect(receipt1.receiptId).not.toBe(receipt2.receiptId);
    });
  });
});