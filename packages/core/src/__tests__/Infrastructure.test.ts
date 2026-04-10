import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HoloScriptParser } from '../HoloScriptParser';
import { HoloScriptRuntime } from '../HoloScriptRuntime';
import { logger } from '../logger';

describe('Infrastructure Nodes', () => {
  let parser: HoloScriptParser;
  let runtime: HoloScriptRuntime;

  beforeEach(() => {
    parser = new HoloScriptParser();
    runtime = new HoloScriptRuntime();
    // Mock logger to avoid clutter
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.spyOn(logger, 'error').mockImplementation(() => {});
  });

  describe('Parser', () => {
    it('should parse server command', () => {
      const command = {
        command: 'create server port 8080 routes /api,/admin',
        confidence: 1,
        timestamp: Date.now(),
      };

      const nodes = parser.parseVoiceCommand(command);
      expect(nodes).toHaveLength(1);
      const node = nodes[0] as any;

      expect(node.type).toBe('server');
      expect(node.port).toBe(8080);
      expect(node.routes).toEqual(['/api', '/admin']);
    });

    it('should parse database command', () => {
      const command = {
        command: 'create database query "SELECT * FROM users"',
        confidence: 1,
        timestamp: Date.now(),
      };

      const nodes = parser.parseVoiceCommand(command);
      expect(nodes).toHaveLength(1);
      const node = nodes[0] as any;

      expect(node.query.toLowerCase()).toContain('select * from users');
    });

    it('should parse fetch command', () => {
      const command = {
        command: 'create fetch url https://api.example.com/data',
        confidence: 1,
        timestamp: Date.now(),
      };

      const nodes = parser.parseVoiceCommand(command);
      expect(nodes).toHaveLength(1);
      const node = nodes[0] as any;

      expect(node.type).toBe('fetch');
      expect(node.url).toBe('https://api.example.com/data');
    });

    it('should parse execute command', () => {
      const command = {
        command: 'execute myFunction',
        confidence: 1,
        timestamp: Date.now(),
      };

      const nodes = parser.parseVoiceCommand(command);
      expect(nodes).toHaveLength(1);
      const node = nodes[0] as any;

      expect(node.type).toBe('execute');
      expect(node.target).toBe('myFunction'); // Case preserved
    });
  });

  describe('Runtime', () => {
    it('should block server creation in public mode by default', async () => {
      // Assuming default is undefined which might not block, but let's check explicit public mode
      (runtime as any).context.mode = 'public';

      const node: any = {
        type: 'server',
        port: 3000,
        routes: [],
        hologram: { shape: 'cube', color: '#000', size: 1, glow: false, interactive: false },
      };

      const result = await runtime.executeNode(node);
      expect(result.success).toBe(false);
      expect(result.error).toContain('SecurityViolation');
    });

    it('should execute server creation in secure mode (implicit)', async () => {
      // Default mode is undefined which acts as secure/internal in this implementation context unless set to public
      const node: any = {
        type: 'server',
        port: 3000,
        routes: [],
        hologram: { shape: 'cube', color: '#000', size: 1, glow: false, interactive: false },
      };

      const result = await runtime.executeNode(node);
      expect(result.success).toBe(true);
      expect(result.output).toContain('Server listening');
    });
  });
});
