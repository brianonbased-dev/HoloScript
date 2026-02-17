import { describe, it, expect, beforeEach } from 'vitest';
import { portableHandler } from '../PortableTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, getEventCount, getLastEvent } from './traitTestHelpers';

describe('PortableTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    interoperable: true,
    export_formats: ['gltf' as const, 'glb' as const],
    metadata_standard: 'gltf_pbr' as const,
    cross_platform: true,
    version: '1.0',
    preserve_animations: true,
    preserve_physics: false,
    optimize_for_web: true,
  };

  beforeEach(() => {
    node = createMockNode('port');
    ctx = createMockContext();
    attachTrait(portableHandler, node, cfg, ctx);
  });

  it('initializes and analyzes portability on attach', () => {
    expect(getEventCount(ctx, 'portable_analysis_complete')).toBe(1);
    const s = (node as any).__portableState;
    expect(s.portabilityScore).toBeGreaterThan(0);
  });

  it('custom shader reduces portability score', () => {
    const n = createMockNode('port2');
    (n as any).customShader = true;
    const c = createMockContext();
    attachTrait(portableHandler, n, cfg, c);
    const s = (n as any).__portableState;
    expect(s.portabilityScore).toBeLessThan(1);
    expect(s.warnings.length).toBeGreaterThan(0);
  });

  it('preserve_physics adds warning', () => {
    const n = createMockNode('port3');
    const c = createMockContext();
    attachTrait(portableHandler, n, { ...cfg, preserve_physics: true }, c);
    const s = (n as any).__portableState;
    expect(s.warnings).toContain('Physics preservation is experimental');
  });

  it('portable_export allowed format triggers export', () => {
    sendEvent(portableHandler, node, cfg, ctx, { type: 'portable_export', format: 'gltf' });
    expect(getEventCount(ctx, 'portable_generate_export')).toBe(1);
  });

  it('portable_export disallowed format emits error', () => {
    sendEvent(portableHandler, node, cfg, ctx, { type: 'portable_export', format: 'fbx' });
    expect(getEventCount(ctx, 'on_portable_error')).toBe(1);
  });

  it('portable_export_complete marks format exported', () => {
    sendEvent(portableHandler, node, cfg, ctx, {
      type: 'portable_export_complete',
      format: 'gltf',
      size: 1024,
      url: '/export/model.gltf',
    });
    const s = (node as any).__portableState;
    expect(s.exportedFormats.has('gltf')).toBe(true);
    expect(s.isExportReady).toBe(true);
    expect(getEventCount(ctx, 'on_asset_ported')).toBe(1);
  });

  it('portable_import emits process', () => {
    sendEvent(portableHandler, node, cfg, ctx, {
      type: 'portable_import',
      data: new ArrayBuffer(10),
      format: 'glb',
    });
    expect(getEventCount(ctx, 'portable_process_import')).toBe(1);
  });

  it('portable_validate re-analyzes and emits result', () => {
    sendEvent(portableHandler, node, cfg, ctx, { type: 'portable_validate' });
    expect(getEventCount(ctx, 'portable_validation_result')).toBe(1);
  });

  it('portable_query emits info', () => {
    sendEvent(portableHandler, node, cfg, ctx, { type: 'portable_query', queryId: 'q1' });
    expect(getEventCount(ctx, 'portable_info')).toBe(1);
  });

  it('detach cleans up', () => {
    portableHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__portableState).toBeUndefined();
  });
});
