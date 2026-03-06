/**
 * Orchestrator Registration - Test Suite
 *
 * Tests the registration script that registers HoloScript MCP tools
 * with the MCP Mesh Orchestrator at localhost:5567.
 *
 * Uses mocked fetch to avoid requiring a running orchestrator.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  registerWithOrchestrator,
  unregisterFromOrchestrator,
  buildRegistrationPayload,
  type RegistrationConfig,
} from '../registerWithOrchestrator';
import { HOLOSCRIPT_MCP_TOOLS } from '../HoloScriptMCPAdapter';

// =============================================================================
// MOCK SETUP
// =============================================================================

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// =============================================================================
// buildRegistrationPayload
// =============================================================================

describe('buildRegistrationPayload', () => {
  it('should build a valid payload with all tools', () => {
    const config: RegistrationConfig = {
      orchestratorUrl: 'http://localhost:5567',
      apiKey: 'test-key',
      serverName: 'holoscript-tools',
      serverDescription: 'Test description',
      serverVersion: '1.0.0',
    };

    const payload = buildRegistrationPayload(config, HOLOSCRIPT_MCP_TOOLS);

    expect(payload.id).toBe('holoscript-tools');
    expect(payload.name).toBe('Test description');
    expect(payload.description).toBe('Test description');
    expect(payload.workspace).toBe('HoloScript');
    expect(payload.visibility).toBe('public');
    expect(Array.isArray(payload.tools)).toBe(true);

    // Tools are serialized as string names
    const tools = payload.tools as string[];
    expect(tools).toHaveLength(5);

    expect(tools).toContain('holo_compile_nir');
    expect(tools).toContain('holo_compile_wgsl');
    expect(tools).toContain('holo_generate_spatial_training');
    expect(tools).toContain('holo_sparsity_check');
    expect(tools).toContain('holo_agent_create');
  });
});

// =============================================================================
// registerWithOrchestrator
// =============================================================================

describe('registerWithOrchestrator', () => {
  it('should succeed when orchestrator is healthy and registration works', async () => {
    // Mock health check
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok' }),
      })
      // Mock server registration
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ success: true }),
      })
      // Mock verification
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          tools: [
            { name: 'holo_compile_nir' },
            { name: 'holo_compile_wgsl' },
            { name: 'holo_generate_spatial_training' },
            { name: 'holo_sparsity_check' },
            { name: 'holo_agent_create' },
          ],
        }),
      });

    const result = await registerWithOrchestrator({
      orchestratorUrl: 'http://localhost:5567',
      apiKey: 'test-key',
    });

    expect(result.success).toBe(true);
    expect(result.serverName).toBe('holoscript-tools');
    expect(result.toolsRegistered).toHaveLength(5);
    expect(result.errors).toHaveLength(0);

    // Verify fetch was called with correct URLs
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:5567/health');
    expect(mockFetch.mock.calls[1][0]).toBe('http://localhost:5567/servers/register');
  });

  it('should fail when health check fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

    const result = await registerWithOrchestrator({
      orchestratorUrl: 'http://localhost:9999',
    });

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('health check failed');
  });

  it('should fail when health check returns non-OK status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    });

    const result = await registerWithOrchestrator();

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('503');
  });

  it('should fail when registration request fails', async () => {
    // Health check succeeds
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200 })
      // Registration fails
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        statusText: 'Conflict',
        text: async () => 'Server already registered',
      });

    const result = await registerWithOrchestrator();

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('registration failed');
  });

  it('should fail when registration request throws', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockRejectedValueOnce(new Error('Network error'));

    const result = await registerWithOrchestrator();

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('registration request failed');
  });

  it('should succeed even if verification request fails', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200 }) // health
      .mockResolvedValueOnce({ ok: true, status: 201 }) // register
      .mockRejectedValueOnce(new Error('Timeout')); // verify fails

    const result = await registerWithOrchestrator();

    // Should still succeed since registration passed
    expect(result.success).toBe(true);
    // Should fall back to listing tool names from definitions
    expect(result.toolsRegistered).toHaveLength(5);
  });

  it('should send correct headers including API key', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: true, status: 201 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tools: [] }),
      });

    await registerWithOrchestrator({ apiKey: 'my-secret-key' });

    // Registration call should include API key header
    const registerCall = mockFetch.mock.calls[1];
    expect(registerCall[1].headers['x-mcp-api-key']).toBe('my-secret-key');
    expect(registerCall[1].headers['Content-Type']).toBe('application/json');
  });

  it('should use custom server name', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: true, status: 201 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tools: [] }),
      });

    const result = await registerWithOrchestrator({ serverName: 'custom-holo' });

    expect(result.serverName).toBe('custom-holo');

    // Verify the registration body includes the custom id
    const registerCall = mockFetch.mock.calls[1];
    const body = JSON.parse(registerCall[1].body);
    expect(body.id).toBe('custom-holo');
  });

  it('should include all 5 tools in registration body', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: true, status: 201 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tools: [] }),
      });

    await registerWithOrchestrator();

    const registerCall = mockFetch.mock.calls[1];
    const body = JSON.parse(registerCall[1].body);
    expect(body.tools).toHaveLength(5);

    // Tools are serialized as string names
    expect(body.tools).toEqual([
      'holo_compile_nir',
      'holo_compile_wgsl',
      'holo_generate_spatial_training',
      'holo_sparsity_check',
      'holo_agent_create',
    ]);
  });
});

// =============================================================================
// unregisterFromOrchestrator
// =============================================================================

describe('unregisterFromOrchestrator', () => {
  it('should succeed when DELETE request succeeds', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await unregisterFromOrchestrator({
      orchestratorUrl: 'http://localhost:5567',
      serverName: 'holoscript-tools',
      apiKey: 'test-key',
    });

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:5567/servers/holoscript-tools',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('should fail when DELETE request fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const result = await unregisterFromOrchestrator();

    expect(result.success).toBe(false);
    expect(result.error).toContain('404');
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await unregisterFromOrchestrator();

    expect(result.success).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });
});
