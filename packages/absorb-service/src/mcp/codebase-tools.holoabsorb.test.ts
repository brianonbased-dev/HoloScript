import { describe, expect, it } from 'vitest';
import { codebaseTools, handleCodebaseTool } from './codebase-tools';

describe('holo_absorb_manifest', () => {
  it('is discoverable on the codebase MCP surface', () => {
    const tool = codebaseTools.find((entry) => entry.name === 'holo_absorb_manifest');

    expect(tool).toBeDefined();
    expect(tool?.description).toContain('official HoloAbsorb product manifest');
  });

  it('returns the manifest and a passing self-audit without loading a graph', async () => {
    const result = (await handleCodebaseTool('holo_absorb_manifest', {})) as {
      manifest: { productName: string; officialMcpTool: string };
      audit: { status: string };
    };

    expect(result.manifest).toMatchObject({
      productName: 'HoloAbsorb',
      officialMcpTool: 'holo_absorb_manifest',
    });
    expect(result.audit.status).toBe('pass');
  });

  it('allows compact manifest-only discovery', async () => {
    const result = (await handleCodebaseTool('holo_absorb_manifest', {
      audit: false,
    })) as Record<string, unknown>;

    expect(result.manifest).toBeDefined();
    expect(result.audit).toBeUndefined();
  });
});
