import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseHolo } from '../../../../../../core/src/parser/HoloCompositionParser';

import { FIRST_SCENE_PROOF, POST } from './route';

type QuickstartWorkflow = {
  name?: string;
  source?: string;
  endpoint?: string;
  panels?: string[];
  performance_receipt?: string;
};

type QuickstartBody = {
  first_scene: typeof FIRST_SCENE_PROOF;
  quickstart_workflows: QuickstartWorkflow[];
  hello_world: {
    compilation: {
      status?: string;
    };
  };
  api_endpoints: Record<string, string>;
};

const STARTER_SCENE_PATH = join(
  __dirname,
  '../../../../lib/studio/first-scene/unity-gap-starter.holo'
);

describe('/api/studio/quickstart first-scene proof', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('surfaces the native Studio/R3F/profiler proof chain when MCP is offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const response = await POST(makeRequest());
    const body = (await response.json()) as QuickstartBody;

    expect(response.status).toBe(200);
    expect(body.hello_world.compilation.status).toBe('mcp_offline');
    expect(body.first_scene.source_path).toBe(FIRST_SCENE_PROOF.source_path);
    expect(body.first_scene.wizard_component).toBe(
      'packages/studio/src/components/wizard/QuickStartWizard.tsx'
    );
    expect(body.first_scene.profiler_panel).toBe(
      'packages/studio/src/lib/studio/panels/profiler.holo'
    );
    expect(body.first_scene.asset_pack_endpoint).toBe('/api/asset-packs');
    expect(body.first_scene.r3f_performance_receipt).toBe(
      'packages/r3f-renderer/src/hooks/usePerformanceRegression.hsplus'
    );
    expect(body.first_scene.hologate_scope).toContain('docs umbrella');
    expect(body.first_scene.proof_markers).toContain('HoloKey custody');
    expect(body.first_scene.proof_markers).toContain('triad receipt');
    expect(body.api_endpoints.asset_packs).toBe('GET /api/asset-packs');
  });

  it('includes the first-scene workflow and native asset-pack loop', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const response = await POST(makeRequest());
    const body = (await response.json()) as QuickstartBody;
    const workflow = body.quickstart_workflows.find(({ name }) => name === 'First Scene Proof');

    expect(workflow).toBeDefined();
    expect(workflow?.source).toBe(FIRST_SCENE_PROOF.source_path);
    expect(workflow?.endpoint).toBe('/api/asset-packs');
    expect(workflow?.performance_receipt).toBe(FIRST_SCENE_PROOF.r3f_performance_receipt);
    expect(workflow?.panels).toEqual([
      'packages/studio/src/lib/studio/panels/profiler.holo',
      'packages/studio/src/lib/studio/panels/assetPack.holo',
    ]);
  });

  it('keeps the starter proof as parseable native HoloScript source', () => {
    const source = readFileSync(STARTER_SCENE_PATH, 'utf-8');
    const parsed = parseHolo(source);

    expect(parsed.success).toBe(true);
    expect(parsed.errors ?? []).toHaveLength(0);
    expect(source).toContain('HoloKey custody');
    expect(source).toContain('umbrella routing');
    expect(source).toContain('triad receipts');
    expect(source).toContain('packages/studio/src/lib/studio/panels/profiler.holo');
    expect(source).toContain('packages/r3f-renderer/src/hooks/usePerformanceRegression.hsplus');
    expect(source).toContain('/api/asset-packs');
  });
});

function makeRequest(): never {
  return new Request('http://localhost/api/studio/quickstart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }) as never;
}
