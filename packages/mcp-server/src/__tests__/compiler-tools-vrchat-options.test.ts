import { describe, expect, it, vi } from 'vitest';

const coreMocks = vi.hoisted(() => ({
  exportMock: vi.fn(),
  getMetricsMock: vi.fn(() => ({ state: 'closed' })),
}));

vi.mock('@holoscript/core', () => ({
  CircuitState: { CLOSED: 'closed', OPEN: 'open' },
  TraitCompositionCompiler: class {},
  compileEducationBlock: vi.fn(),
  compileHealthcareBlock: vi.fn(),
  compileIoTBlock: vi.fn(),
  compileMusicBlock: vi.fn(),
  compileRoboticsBlock: vi.fn(),
  generateControllersYaml: vi.fn(),
  generateROS2LaunchFile: vi.fn(),
  getExportManager: vi.fn(() => ({
    export: coreMocks.exportMock,
    getMetrics: coreMocks.getMetricsMock,
  })),
  parseHolo: vi.fn(() => ({
    success: true,
    ast: { name: 'Robot', objects: [] },
    warnings: [],
  })),
  selectModality: vi.fn(),
  selectModalityForAll: vi.fn(),
}));

vi.mock('../schema-mapper', () => ({
  handleMapCsvHeaders: vi.fn(),
  handleMapSchema: vi.fn(),
}));

vi.mock('../audit-tools', () => ({
  auditTools: [],
  handleAuditNumbers: vi.fn(),
}));

vi.mock('../alphafold-tools', () => ({
  alphafoldTools: [],
  handleFetchStructure: vi.fn(),
}));

describe('compiler tools VRChat options', () => {
  it('maps top-level VRChat output options into compilerOptions', async () => {
    coreMocks.exportMock.mockResolvedValue({
      success: true,
      output: 'legacy-vrchat-output',
      usedFallback: false,
    });

    const { handleCompilerTool } = await import('../compiler-tools');

    const result = (await handleCompilerTool('compile_to_vrchat', {
      code: 'composition "Robot" {}',
      options: {
        outputFormat: 'udon-bytecode',
        useUdonSharp: false,
      },
    })) as { success?: boolean };

    expect(result.success).toBe(true);
    expect(coreMocks.exportMock).toHaveBeenCalledWith(
      'vrchat',
      expect.objectContaining({ name: 'Robot' }),
      expect.objectContaining({
        compilerOptions: expect.objectContaining({
          outputFormat: 'udon-bytecode',
          useUdonSharp: false,
        }),
      })
    );
  });
});
