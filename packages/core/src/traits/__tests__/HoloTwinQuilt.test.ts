import { describe, it, expect, vi } from 'vitest';
import { recompileQuilt } from '../HoloTwinTrait';

const captureCtx = () => {
  const emit = vi.fn();
  return { emit: (event: string, data: unknown) => emit(event, data), _emit: emit };
};
const minimalState = () => ({ sensorData: {}, pendingRecompile: true }) as never;
const minimalConfig = () => ({ display_device: 'go', physical_id: 'lamp-1' }) as never;

describe('HoloTwinTrait recompileQuilt — honest abstention (no fabricated quilt)', () => {
  it('dispatches the compile request, then abstains with holo_twin_quilt_error (no fake compiled/url)', async () => {
    const ctx = captureCtx();
    await recompileQuilt({}, minimalState(), minimalConfig(), ctx);

    // Honest dispatch to the (real) external compiler stays.
    expect(ctx._emit).toHaveBeenCalledWith(
      'holo_twin_compile_quilt',
      expect.objectContaining({ device: 'go' })
    );

    // The fabricated success is GONE — never a holo_twin_quilt_compiled with a placeholder url.
    expect(ctx._emit).not.toHaveBeenCalledWith('holo_twin_quilt_compiled', expect.anything());

    // Honest abstention instead.
    expect(ctx._emit).toHaveBeenCalledWith(
      'holo_twin_quilt_error',
      expect.objectContaining({
        ok: false,
        error: 'not_implemented',
        capability: 'holo_twin_quilt',
      })
    );
  });

  it('never emits a studio.holoscript.net url (the old fake hosted path)', async () => {
    const ctx = captureCtx();
    await recompileQuilt({}, minimalState(), minimalConfig(), ctx);
    for (const call of ctx._emit.mock.calls) {
      expect(JSON.stringify(call[1] ?? {})).not.toContain('studio.holoscript.net');
    }
  });
});
