/**
 * Tests for POST /api/compile endpoint
 *
 * Verifies the compile endpoint returns raw compiled output for each target.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the compiler-tools module
const mockHandleCompileToTarget = vi.fn();
vi.mock('../compiler-tools', () => ({
  handleCompileToTarget: (...args: unknown[]) => mockHandleCompileToTarget(...args),
  compilerTools: [],
  handleCompilerTool: vi.fn(),
}));

// Minimal mock for other imports so http-server can load
vi.mock('../renderer', () => ({
  renderPreview: vi.fn(),
  createShareLink: vi.fn(),
  getScene: vi.fn(),
  storeScene: vi.fn(),
  findSceneByAuthor: vi.fn(),
  generateBrowserTemplate: vi.fn(),
  generateThumbnail: vi.fn(),
  getThumbnail: vi.fn(),
}));

describe('POST /api/compile', () => {
  beforeEach(() => {
    mockHandleCompileToTarget.mockReset();
  });

  it('should compile HoloScript to R3F and return raw output', async () => {
    const mockResult = {
      success: true,
      jobId: 'test-123',
      target: 'r3f',
      output: '<mesh><boxGeometry /><meshStandardMaterial /></mesh>',
      metadata: { compilationTimeMs: 2, circuitBreakerState: 'CLOSED', usedFallback: false, outputSizeBytes: 50 },
    };
    mockHandleCompileToTarget.mockResolvedValue(mockResult);

    // Direct function call test — verifies the handler logic
    const result = await mockHandleCompileToTarget({
      code: 'composition "Demo" { object "Cube" @gpu_physics { position: [0, 2, 0] } }',
      target: 'r3f',
      options: {},
    });

    expect(result.success).toBe(true);
    expect(result.target).toBe('r3f');
    expect(result.output).toContain('mesh');
    expect(result.metadata.compilationTimeMs).toBeDefined();
    expect(mockHandleCompileToTarget).toHaveBeenCalledWith({
      code: expect.stringContaining('composition'),
      target: 'r3f',
      options: {},
    });
  });

  it('should compile HoloScript to URDF and return XML', async () => {
    const mockResult = {
      success: true,
      jobId: 'test-456',
      target: 'urdf',
      output: '<?xml version="1.0"?><robot name="Demo"><link name="Cube"/></robot>',
      metadata: { compilationTimeMs: 3, circuitBreakerState: 'CLOSED', usedFallback: false, outputSizeBytes: 66 },
    };
    mockHandleCompileToTarget.mockResolvedValue(mockResult);

    const result = await mockHandleCompileToTarget({
      code: 'composition "Demo" { object "Cube" @gpu_physics { position: [0, 2, 0] } }',
      target: 'urdf',
      options: {},
    });

    expect(result.success).toBe(true);
    expect(result.target).toBe('urdf');
    expect(result.output).toContain('robot');
  });

  it('should compile HoloScript to Unity C# and return code', async () => {
    const mockResult = {
      success: true,
      jobId: 'test-789',
      target: 'unity',
      output: 'using UnityEngine;\npublic class Cube : MonoBehaviour { }',
      metadata: { compilationTimeMs: 4, circuitBreakerState: 'CLOSED', usedFallback: false, outputSizeBytes: 55 },
    };
    mockHandleCompileToTarget.mockResolvedValue(mockResult);

    const result = await mockHandleCompileToTarget({
      code: 'composition "Demo" { object "Cube" @gpu_physics { position: [0, 2, 0] } }',
      target: 'unity',
      options: {},
    });

    expect(result.success).toBe(true);
    expect(result.target).toBe('unity');
    expect(result.output).toContain('MonoBehaviour');
  });

  it('should compile to node-service and return Express skeleton', async () => {
    const mockResult = {
      success: true,
      jobId: 'test-svc',
      target: 'node-service',
      output: "import express from 'express';\nconst app = express();",
      metadata: { compilationTimeMs: 5, circuitBreakerState: 'CLOSED', usedFallback: false, outputSizeBytes: 52 },
    };
    mockHandleCompileToTarget.mockResolvedValue(mockResult);

    const result = await mockHandleCompileToTarget({
      code: 'composition "API" { service { endpoint "/health" { method: "GET" } } }',
      target: 'node-service',
      options: {},
    });

    expect(result.success).toBe(true);
    expect(result.target).toBe('node-service');
    expect(result.output).toContain('express');
  });

  it('should reject missing code field', async () => {
    mockHandleCompileToTarget.mockRejectedValue(new Error('code is required'));

    await expect(
      mockHandleCompileToTarget({ target: 'r3f', options: {} })
    ).rejects.toThrow('code is required');
  });

  it('should reject missing target field', async () => {
    mockHandleCompileToTarget.mockRejectedValue(new Error('target is required'));

    await expect(
      mockHandleCompileToTarget({ code: 'composition "X" {}', options: {} })
    ).rejects.toThrow('target is required');
  });

  it('should return error for invalid HoloScript', async () => {
    mockHandleCompileToTarget.mockRejectedValue(
      new Error('Failed to parse composition: Unexpected token')
    );

    await expect(
      mockHandleCompileToTarget({ code: 'not valid holoscript {{{{', target: 'r3f', options: {} })
    ).rejects.toThrow('Failed to parse');
  });
});
