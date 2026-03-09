/**
 * BiofeedbackTrait — Production Tests
 */
import { describe, it, expect, vi } from 'vitest';
import { biofeedbackHandler } from '../BiofeedbackTrait';

function makeNode() {
  return {} as any;
}
function makeCtx(emitFn = vi.fn()) {
  return { emit: emitFn } as any;
}

describe('BiofeedbackTrait — defaultConfig', () => {
  it('sources=[heart_rate]', () =>
    expect(biofeedbackHandler.defaultConfig.sources).toEqual(['heart_rate']));
  it('sample_rate_hz=10', () => expect(biofeedbackHandler.defaultConfig.sample_rate_hz).toBe(10));
  it('normalize=true', () => expect(biofeedbackHandler.defaultConfig.normalize).toBe(true));
  it('emit_on_threshold=true', () =>
    expect(biofeedbackHandler.defaultConfig.emit_on_threshold).toBe(true));
  it('thresholds={}', () => expect(biofeedbackHandler.defaultConfig.thresholds).toEqual({}));
});

describe('BiofeedbackTrait — onAttach', () => {
  it('emits biofeedback_connect with sources', () => {
    const node = makeNode();
    const emit = vi.fn();
    biofeedbackHandler.onAttach!(node, biofeedbackHandler.defaultConfig, makeCtx(emit));
    expect(emit).toHaveBeenCalledWith(
      'biofeedback_connect',
      expect.objectContaining({
        sources: ['heart_rate'],
        sampleRateHz: 10,
      })
    );
  });
  it('state: isConnected=false, samples empty', () => {
    const node = makeNode();
    biofeedbackHandler.onAttach!(node, biofeedbackHandler.defaultConfig, makeCtx());
    const st = (node as any).__biofeedbackState;
    expect(st.isConnected).toBe(false);
    expect(st.samples.size).toBe(0);
  });
  it('multi-source config forwarded', () => {
    const node = makeNode();
    const emit = vi.fn();
    const cfg = {
      ...biofeedbackHandler.defaultConfig,
      sources: ['heart_rate', 'gsr', 'pupil'] as any,
    };
    biofeedbackHandler.onAttach!(node, cfg, makeCtx(emit));
    expect(emit).toHaveBeenCalledWith(
      'biofeedback_connect',
      expect.objectContaining({
        sources: ['heart_rate', 'gsr', 'pupil'],
      })
    );
  });
});

describe('BiofeedbackTrait — onDetach', () => {
  it('removes state', () => {
    const node = makeNode();
    biofeedbackHandler.onAttach!(node, biofeedbackHandler.defaultConfig, makeCtx());
    biofeedbackHandler.onDetach!(node, biofeedbackHandler.defaultConfig, makeCtx());
    expect((node as any).__biofeedbackState).toBeUndefined();
  });
  it('emits biofeedback_disconnect when connected', () => {
    const node = makeNode();
    const emit = vi.fn();
    biofeedbackHandler.onAttach!(node, biofeedbackHandler.defaultConfig, makeCtx());
    (node as any).__biofeedbackState.isConnected = true;
    biofeedbackHandler.onDetach!(node, biofeedbackHandler.defaultConfig, makeCtx(emit));
    expect(emit).toHaveBeenCalledWith('biofeedback_disconnect', expect.anything());
  });
  it('no disconnect emit when not connected', () => {
    const node = makeNode();
    const emit = vi.fn();
    biofeedbackHandler.onAttach!(node, biofeedbackHandler.defaultConfig, makeCtx());
    biofeedbackHandler.onDetach!(node, biofeedbackHandler.defaultConfig, makeCtx(emit));
    expect(emit).not.toHaveBeenCalledWith('biofeedback_disconnect', expect.anything());
  });
});

describe('BiofeedbackTrait — onEvent: device connect/disconnect', () => {
  it('biofeedback_device_connected → isConnected=true, emits on_biofeedback_ready', () => {
    const node = makeNode();
    const emit = vi.fn();
    biofeedbackHandler.onAttach!(node, biofeedbackHandler.defaultConfig, makeCtx());
    biofeedbackHandler.onEvent!(node, biofeedbackHandler.defaultConfig, makeCtx(emit), {
      type: 'biofeedback_device_connected',
    });
    expect((node as any).__biofeedbackState.isConnected).toBe(true);
    expect(emit).toHaveBeenCalledWith('on_biofeedback_ready', expect.anything());
  });
  it('biofeedback_device_disconnected → isConnected=false, emits on_biofeedback_lost', () => {
    const node = makeNode();
    const emit = vi.fn();
    biofeedbackHandler.onAttach!(node, biofeedbackHandler.defaultConfig, makeCtx());
    (node as any).__biofeedbackState.isConnected = true;
    biofeedbackHandler.onEvent!(node, biofeedbackHandler.defaultConfig, makeCtx(emit), {
      type: 'biofeedback_device_disconnected',
    });
    expect((node as any).__biofeedbackState.isConnected).toBe(false);
    expect(emit).toHaveBeenCalledWith('on_biofeedback_lost', expect.anything());
  });
});

describe('BiofeedbackTrait — onEvent: biofeedback_sample', () => {
  it('stores sample in samples map', () => {
    const node = makeNode();
    biofeedbackHandler.onAttach!(node, biofeedbackHandler.defaultConfig, makeCtx());
    biofeedbackHandler.onEvent!(node, biofeedbackHandler.defaultConfig, makeCtx(), {
      type: 'biofeedback_sample',
      source: 'heart_rate',
      value: 80,
    });
    const sample = (node as any).__biofeedbackState.samples.get('heart_rate');
    expect(sample).toBeDefined();
    expect(sample.raw).toBe(80);
  });
  it('normalizes heart_rate 80bpm to ~0.25 (range 40-200)', () => {
    const node = makeNode();
    biofeedbackHandler.onAttach!(node, biofeedbackHandler.defaultConfig, makeCtx());
    biofeedbackHandler.onEvent!(node, biofeedbackHandler.defaultConfig, makeCtx(), {
      type: 'biofeedback_sample',
      source: 'heart_rate',
      value: 80,
    });
    const sample = (node as any).__biofeedbackState.samples.get('heart_rate');
    // (80-40)/(200-40) = 40/160 = 0.25
    expect(sample.normalized).toBeCloseTo(0.25, 2);
  });
  it('normalized value clamped to [0,1] for out-of-range raw', () => {
    const node = makeNode();
    biofeedbackHandler.onAttach!(node, biofeedbackHandler.defaultConfig, makeCtx());
    biofeedbackHandler.onEvent!(node, biofeedbackHandler.defaultConfig, makeCtx(), {
      type: 'biofeedback_sample',
      source: 'heart_rate',
      value: 300,
    }); // above max 200
    const sample = (node as any).__biofeedbackState.samples.get('heart_rate');
    expect(sample.normalized).toBe(1);
  });
  it('normalize=false stores raw as normalized', () => {
    const node = makeNode();
    const cfg = { ...biofeedbackHandler.defaultConfig, normalize: false };
    biofeedbackHandler.onAttach!(node, cfg, makeCtx());
    biofeedbackHandler.onEvent!(node, cfg, makeCtx(), {
      type: 'biofeedback_sample',
      source: 'heart_rate',
      value: 75,
    });
    const sample = (node as any).__biofeedbackState.samples.get('heart_rate');
    expect(sample.normalized).toBe(75);
  });
  it('emits biofeedback_reading', () => {
    const node = makeNode();
    const emit = vi.fn();
    biofeedbackHandler.onAttach!(node, biofeedbackHandler.defaultConfig, makeCtx());
    biofeedbackHandler.onEvent!(node, biofeedbackHandler.defaultConfig, makeCtx(emit), {
      type: 'biofeedback_sample',
      source: 'heart_rate',
      value: 90,
    });
    expect(emit).toHaveBeenCalledWith(
      'biofeedback_reading',
      expect.objectContaining({ source: 'heart_rate', raw: 90 })
    );
  });
  it('ignores samples from unlisted sources', () => {
    const node = makeNode();
    const emit = vi.fn();
    biofeedbackHandler.onAttach!(node, biofeedbackHandler.defaultConfig, makeCtx()); // sources=['heart_rate']
    biofeedbackHandler.onEvent!(node, biofeedbackHandler.defaultConfig, makeCtx(emit), {
      type: 'biofeedback_sample',
      source: 'gsr',
      value: 5,
    });
    expect((node as any).__biofeedbackState.samples.has('gsr')).toBe(false);
    expect(emit).not.toHaveBeenCalledWith('biofeedback_reading', expect.anything());
  });
  it('uses custom range when provided', () => {
    const node = makeNode();
    const cfg = {
      ...biofeedbackHandler.defaultConfig,
      ranges: { heart_rate: { min: 0, max: 100 } } as any,
    };
    biofeedbackHandler.onAttach!(node, cfg, makeCtx());
    biofeedbackHandler.onEvent!(node, cfg, makeCtx(), {
      type: 'biofeedback_sample',
      source: 'heart_rate',
      value: 50,
    });
    // (50-0)/(100-0) = 0.5
    expect((node as any).__biofeedbackState.samples.get('heart_rate')?.normalized).toBeCloseTo(
      0.5,
      2
    );
  });
});

describe('BiofeedbackTrait — threshold edge detection', () => {
  const cfg = {
    ...biofeedbackHandler.defaultConfig,
    emit_on_threshold: true,
    thresholds: { heart_rate: { low: 50, high: 150 } } as any,
  };

  it('crossing into low zone emits biofeedback_threshold_crossed (low)', () => {
    const node = makeNode();
    const emit = vi.fn();
    biofeedbackHandler.onAttach!(node, cfg, makeCtx());
    biofeedbackHandler.onEvent!(node, cfg, makeCtx(emit), {
      type: 'biofeedback_sample',
      source: 'heart_rate',
      value: 45,
    }); // below 50
    expect(emit).toHaveBeenCalledWith(
      'biofeedback_threshold_crossed',
      expect.objectContaining({
        source: 'heart_rate',
        direction: 'low',
        value: 45,
      })
    );
  });
  it('crossing into high zone emits biofeedback_threshold_crossed (high)', () => {
    const node = makeNode();
    const emit = vi.fn();
    biofeedbackHandler.onAttach!(node, cfg, makeCtx());
    biofeedbackHandler.onEvent!(node, cfg, makeCtx(emit), {
      type: 'biofeedback_sample',
      source: 'heart_rate',
      value: 160,
    }); // above 150
    expect(emit).toHaveBeenCalledWith(
      'biofeedback_threshold_crossed',
      expect.objectContaining({ direction: 'high' })
    );
  });
  it('staying in normal range: no threshold event', () => {
    const node = makeNode();
    const emit = vi.fn();
    biofeedbackHandler.onAttach!(node, cfg, makeCtx());
    biofeedbackHandler.onEvent!(node, cfg, makeCtx(emit), {
      type: 'biofeedback_sample',
      source: 'heart_rate',
      value: 80,
    }); // normal
    expect(emit).not.toHaveBeenCalledWith('biofeedback_threshold_crossed', expect.anything());
  });
  it('same edge twice → no duplicate event (edge detection)', () => {
    const node = makeNode();
    const emit = vi.fn();
    biofeedbackHandler.onAttach!(node, cfg, makeCtx());
    biofeedbackHandler.onEvent!(node, cfg, makeCtx(emit), {
      type: 'biofeedback_sample',
      source: 'heart_rate',
      value: 45,
    }); // → low
    biofeedbackHandler.onEvent!(node, cfg, makeCtx(emit), {
      type: 'biofeedback_sample',
      source: 'heart_rate',
      value: 40,
    }); // still low
    const crossings = emit.mock.calls.filter(([e]) => e === 'biofeedback_threshold_crossed');
    expect(crossings).toHaveLength(1); // only once
  });
  it('low → normal: emits crossing back to normal', () => {
    const node = makeNode();
    const emit = vi.fn();
    biofeedbackHandler.onAttach!(node, cfg, makeCtx());
    biofeedbackHandler.onEvent!(node, cfg, makeCtx(emit), {
      type: 'biofeedback_sample',
      source: 'heart_rate',
      value: 45,
    }); // → low
    biofeedbackHandler.onEvent!(node, cfg, makeCtx(emit), {
      type: 'biofeedback_sample',
      source: 'heart_rate',
      value: 80,
    }); // → normal
    const crossings = emit.mock.calls.filter(([e]) => e === 'biofeedback_threshold_crossed');
    expect(crossings).toHaveLength(2);
    expect(crossings[1][1].direction).toBe('normal');
  });
  it('emit_on_threshold=false: no threshold events even when crossing', () => {
    const node = makeNode();
    const emit = vi.fn();
    const noCfg = { ...cfg, emit_on_threshold: false };
    biofeedbackHandler.onAttach!(node, noCfg, makeCtx());
    biofeedbackHandler.onEvent!(node, noCfg, makeCtx(emit), {
      type: 'biofeedback_sample',
      source: 'heart_rate',
      value: 30,
    });
    expect(emit).not.toHaveBeenCalledWith('biofeedback_threshold_crossed', expect.anything());
  });
});

describe('BiofeedbackTrait — onEvent: query and calibrate', () => {
  it('biofeedback_query for specific source → biofeedback_response with sample', () => {
    const node = makeNode();
    const emit = vi.fn();
    biofeedbackHandler.onAttach!(node, biofeedbackHandler.defaultConfig, makeCtx());
    biofeedbackHandler.onEvent!(node, biofeedbackHandler.defaultConfig, makeCtx(), {
      type: 'biofeedback_sample',
      source: 'heart_rate',
      value: 72,
    });
    biofeedbackHandler.onEvent!(node, biofeedbackHandler.defaultConfig, makeCtx(emit), {
      type: 'biofeedback_query',
      queryId: 'bq1',
      source: 'heart_rate',
    });
    expect(emit).toHaveBeenCalledWith(
      'biofeedback_response',
      expect.objectContaining({
        queryId: 'bq1',
        source: 'heart_rate',
      })
    );
  });
  it('biofeedback_query for unknown source → sample=null', () => {
    const node = makeNode();
    const emit = vi.fn();
    biofeedbackHandler.onAttach!(node, biofeedbackHandler.defaultConfig, makeCtx());
    biofeedbackHandler.onEvent!(node, biofeedbackHandler.defaultConfig, makeCtx(emit), {
      type: 'biofeedback_query',
      queryId: 'bq2',
      source: 'heart_rate',
    });
    expect(emit).toHaveBeenCalledWith(
      'biofeedback_response',
      expect.objectContaining({ sample: null })
    );
  });
  it('biofeedback_calibrate clears samples', () => {
    const node = makeNode();
    biofeedbackHandler.onAttach!(node, biofeedbackHandler.defaultConfig, makeCtx());
    biofeedbackHandler.onEvent!(node, biofeedbackHandler.defaultConfig, makeCtx(), {
      type: 'biofeedback_sample',
      source: 'heart_rate',
      value: 75,
    });
    expect((node as any).__biofeedbackState.samples.size).toBe(1);
    biofeedbackHandler.onEvent!(node, biofeedbackHandler.defaultConfig, makeCtx(), {
      type: 'biofeedback_calibrate',
    });
    expect((node as any).__biofeedbackState.samples.size).toBe(0);
  });
});

describe('BiofeedbackTrait — multi-source independence', () => {
  it('multiple sources stored independently', () => {
    const node = makeNode();
    const cfg = {
      ...biofeedbackHandler.defaultConfig,
      sources: ['heart_rate', 'gsr'] as any,
    };
    biofeedbackHandler.onAttach!(node, cfg, makeCtx());
    biofeedbackHandler.onEvent!(node, cfg, makeCtx(), {
      type: 'biofeedback_sample',
      source: 'heart_rate',
      value: 75,
    });
    biofeedbackHandler.onEvent!(node, cfg, makeCtx(), {
      type: 'biofeedback_sample',
      source: 'gsr',
      value: 5,
    });
    const st = (node as any).__biofeedbackState;
    expect(st.samples.size).toBe(2);
    expect(st.samples.get('heart_rate').raw).toBe(75);
    expect(st.samples.get('gsr').raw).toBe(5);
  });
});
