/**
 * Tests for sandbox type system and permission model
 */
import { describe, it, expect } from 'vitest';
import {
  validateSandboxManifest,
  createSandboxedPlugin,
  requiresSandboxing,
  inferPermissions,
  createPlugin,
} from '../../helpers.js';
import type { PluginSandboxManifest, SandboxPermission } from '../types.js';
import type { HoloScriptPlugin } from '../../types.js';

describe('SandboxPermission type validation', () => {
  it('should accept all valid permission strings', () => {
    const validPermissions: SandboxPermission[] = [
      'scene:read',
      'scene:write',
      'scene:subscribe',
      'editor:selection',
      'editor:viewport',
      'editor:undo',
      'ui:panel',
      'ui:toolbar',
      'ui:menu',
      'ui:modal',
      'ui:notification',
      'ui:theme',
      'storage:local',
      'storage:project',
      'network:fetch',
      'network:websocket',
      'clipboard:read',
      'clipboard:write',
      'fs:import',
      'fs:export',
      'user:read',
      'nodes:workflow',
      'nodes:behaviortree',
      'keyboard:shortcuts',
    ];

    const manifest: PluginSandboxManifest = {
      permissions: validPermissions,
      networkPolicy: {
        allowedDomains: ['example.com'],
      },
    };

    const result = validateSandboxManifest(manifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject unknown permissions', () => {
    const manifest: PluginSandboxManifest = {
      permissions: ['scene:read', 'invalid:permission' as SandboxPermission],
    };

    const result = validateSandboxManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Unknown permission: 'invalid:permission'");
  });

  it('should reject empty permissions array', () => {
    const manifest: PluginSandboxManifest = {
      permissions: [],
    };

    const result = validateSandboxManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Sandbox manifest must declare at least one permission');
  });
});

describe('validateSandboxManifest', () => {
  it('should require network policy when network:fetch is requested', () => {
    const manifest: PluginSandboxManifest = {
      permissions: ['network:fetch'],
    };

    const result = validateSandboxManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Network policy is required'))).toBe(true);
  });

  it('should require network policy when network:websocket is requested', () => {
    const manifest: PluginSandboxManifest = {
      permissions: ['network:websocket'],
    };

    const result = validateSandboxManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Network policy is required'))).toBe(true);
  });

  it('should require at least one allowed domain in network policy', () => {
    const manifest: PluginSandboxManifest = {
      permissions: ['network:fetch'],
      networkPolicy: {
        allowedDomains: [],
      },
    };

    const result = validateSandboxManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('at least one allowed domain'))).toBe(true);
  });

  it('should accept valid network policy', () => {
    const manifest: PluginSandboxManifest = {
      permissions: ['network:fetch'],
      networkPolicy: {
        allowedDomains: ['api.example.com', '*.mysite.org'],
        allowLocalhost: false,
      },
    };

    const result = validateSandboxManifest(manifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject negative memory budget', () => {
    const manifest: PluginSandboxManifest = {
      permissions: ['scene:read'],
      memoryBudget: -10,
    };

    const result = validateSandboxManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Memory budget'))).toBe(true);
  });

  it('should reject negative CPU budget', () => {
    const manifest: PluginSandboxManifest = {
      permissions: ['scene:read'],
      cpuBudget: -5,
    };

    const result = validateSandboxManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('CPU budget'))).toBe(true);
  });

  it('should cross-validate with plugin extensions and produce warnings', () => {
    const manifest: PluginSandboxManifest = {
      permissions: ['scene:read'], // Missing ui:panel, ui:toolbar, etc.
    };

    const plugin: HoloScriptPlugin = {
      metadata: {
        id: 'test-plugin',
        name: 'Test',
        version: '1.0.0',
        description: 'Test',
        author: { name: 'Test' },
      },
      panels: [{ id: 'p1', label: 'Panel', component: () => null }],
      toolbarButtons: [{ id: 'b1', label: 'Button', onClick: () => {} }],
    };

    const result = validateSandboxManifest(manifest, plugin);
    expect(result.valid).toBe(true); // Warnings don't cause failure
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('ui:panel'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('ui:toolbar'))).toBe(true);
  });
});

describe('createSandboxedPlugin', () => {
  it('should set default trust level to sandboxed', () => {
    const plugin = createSandboxedPlugin({
      metadata: {
        id: 'test-sandboxed',
        name: 'Test Sandboxed',
        version: '1.0.0',
        description: 'Test',
        author: { name: 'Test' },
      },
      sandbox: {
        permissions: ['scene:read'],
      },
    });

    expect(plugin.sandbox?.trustLevel).toBe('sandboxed');
  });

  it('should preserve explicit trust level', () => {
    const plugin = createSandboxedPlugin({
      metadata: {
        id: 'test-trusted',
        name: 'Test Trusted',
        version: '1.0.0',
        description: 'Test',
        author: { name: 'Test' },
      },
      sandbox: {
        permissions: ['scene:read'],
        trustLevel: 'trusted',
      },
    });

    expect(plugin.sandbox?.trustLevel).toBe('trusted');
  });
});

describe('requiresSandboxing', () => {
  it('should return true for plugins with sandbox manifest (default)', () => {
    const plugin: HoloScriptPlugin = {
      metadata: {
        id: 'sandboxed',
        name: 'Sandboxed',
        version: '1.0.0',
        description: 'Test',
        author: { name: 'Test' },
      },
      sandbox: {
        permissions: ['scene:read'],
      },
    };

    expect(requiresSandboxing(plugin)).toBe(true);
  });

  it('should return true for sandboxed trust level', () => {
    const plugin: HoloScriptPlugin = {
      metadata: {
        id: 'sandboxed',
        name: 'Sandboxed',
        version: '1.0.0',
        description: 'Test',
        author: { name: 'Test' },
      },
      sandbox: {
        permissions: ['scene:read'],
        trustLevel: 'sandboxed',
      },
    };

    expect(requiresSandboxing(plugin)).toBe(true);
  });

  it('should return false for trusted plugins', () => {
    const plugin: HoloScriptPlugin = {
      metadata: {
        id: 'trusted',
        name: 'Trusted',
        version: '1.0.0',
        description: 'Test',
        author: { name: 'Test' },
      },
      sandbox: {
        permissions: ['scene:read'],
        trustLevel: 'trusted',
      },
    };

    expect(requiresSandboxing(plugin)).toBe(false);
  });

  it('should return false for legacy plugins without sandbox manifest', () => {
    const plugin: HoloScriptPlugin = {
      metadata: {
        id: 'legacy',
        name: 'Legacy',
        version: '1.0.0',
        description: 'Test',
        author: { name: 'Test' },
      },
    };

    expect(requiresSandboxing(plugin)).toBe(false);
  });
});

describe('inferPermissions', () => {
  it('should infer ui:panel for plugins with panels', () => {
    const plugin: HoloScriptPlugin = {
      metadata: {
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        description: 'Test',
        author: { name: 'Test' },
      },
      panels: [{ id: 'p1', label: 'Panel', component: () => null }],
    };

    const perms = inferPermissions(plugin);
    expect(perms).toContain('ui:panel');
  });

  it('should infer multiple permissions for complex plugins', () => {
    const plugin: HoloScriptPlugin = {
      metadata: {
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        description: 'Test',
        author: { name: 'Test' },
      },
      panels: [{ id: 'p1', label: 'Panel', component: () => null }],
      toolbarButtons: [{ id: 'b1', label: 'Button', onClick: () => {} }],
      keyboardShortcuts: [{ id: 's1', keys: 'Ctrl+P', description: 'Test', handler: () => {} }],
      menuItems: [{ id: 'm1', label: 'Menu', path: 'Tools/Test', onClick: () => {} }],
      nodeTypes: {
        workflow: [{ type: 'test', label: 'Test' }],
        behaviorTree: [{ type: 'bt-test', label: 'BT Test' }],
      },
      settingsSchema: [{ key: 'apiKey', label: 'API Key', type: 'text' }],
    };

    const perms = inferPermissions(plugin);
    expect(perms).toContain('ui:panel');
    expect(perms).toContain('ui:toolbar');
    expect(perms).toContain('keyboard:shortcuts');
    expect(perms).toContain('ui:menu');
    expect(perms).toContain('nodes:workflow');
    expect(perms).toContain('nodes:behaviortree');
    expect(perms).toContain('storage:local');
  });

  it('should infer network:fetch for plugins with MCP servers', () => {
    const plugin: HoloScriptPlugin = {
      metadata: {
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        description: 'Test',
        author: { name: 'Test' },
      },
      mcpServers: [{ id: 'mcp1', name: 'MCP', url: 'http://localhost:5000' }],
    };

    const perms = inferPermissions(plugin);
    expect(perms).toContain('network:fetch');
  });

  it('should infer fs permissions for plugins with content types', () => {
    const plugin: HoloScriptPlugin = {
      metadata: {
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        description: 'Test',
        author: { name: 'Test' },
      },
      contentTypes: [{ type: 'custom', label: 'Custom', extension: 'cst' }],
    };

    const perms = inferPermissions(plugin);
    expect(perms).toContain('fs:import');
    expect(perms).toContain('fs:export');
  });

  it('should return empty array for minimal plugins', () => {
    const plugin: HoloScriptPlugin = {
      metadata: {
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        description: 'Test',
        author: { name: 'Test' },
      },
    };

    const perms = inferPermissions(plugin);
    expect(perms).toHaveLength(0);
  });
});
