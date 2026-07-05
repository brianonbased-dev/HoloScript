import { describe, expect, it, vi } from 'vitest';

import {
  reducedOrderModelHandler,
  stepReducedOrderModel,
  type ReducedOrderModelConfig,
} from '../ReducedOrderModelTrait';
import type { TraitContext } from '../TraitTypes';

function makeContext() {
  return {
    emit: vi.fn(),
  } as unknown as TraitContext;
}

function makeConfig(): ReducedOrderModelConfig {
  return {
    model_id: 'rom-thermal-plate',
    input_names: ['heat', 'ambient'],
    output_names: ['maxTemperature'],
    coefficients: {
      maxTemperature: {
        intercept: 2,
        weights: {
          heat: 3,
          ambient: 1,
        },
      },
    },
    error_bounds: {
      maxTemperature: 0.25,
    },
    training_trace_hashes: ['cael-abcd1234'],
    cael_receipt_hash: 'rom-cael-1234',
    deployment_target: 'wasm-edge',
  };
}

describe('reducedOrderModelHandler', () => {
  it('executes a deployed ROM step from affine coefficients', () => {
    const config = makeConfig();
    const outputs = stepReducedOrderModel(config, { heat: 4, ambient: 20 });

    expect(outputs).toEqual({ maxTemperature: 34 });
  });

  it('stores model state and emits step output with provenance bounds', () => {
    const node = { id: 'rom-node' };
    const context = makeContext();
    const config = makeConfig();

    reducedOrderModelHandler.onAttach?.(node, config, context);
    reducedOrderModelHandler.onEvent?.(node, config, context, {
      type: 'rom_step',
      payload: { inputs: { heat: 4, ambient: 20 } },
    });

    expect(context.emit).toHaveBeenCalledWith(
      'rom_output',
      expect.objectContaining({
        modelId: 'rom-thermal-plate',
        outputs: { maxTemperature: 34 },
        errorBounds: { maxTemperature: 0.25 },
        caelReceiptHash: 'rom-cael-1234',
      })
    );
  });

  it('validates the most recent ROM step against configured error bounds', () => {
    const node = { id: 'rom-node' };
    const context = makeContext();
    const config = makeConfig();

    reducedOrderModelHandler.onAttach?.(node, config, context);
    reducedOrderModelHandler.onEvent?.(node, config, context, {
      type: 'rom_step',
      payload: { inputs: { heat: 4, ambient: 20 } },
    });
    reducedOrderModelHandler.onEvent?.(node, config, context, {
      type: 'rom_validate',
      payload: { actualOutputs: { maxTemperature: 34.1 } },
    });

    expect(context.emit).toHaveBeenCalledWith(
      'rom_validation_result',
      expect.objectContaining({
        modelId: 'rom-thermal-plate',
        passed: true,
        errors: { maxTemperature: expect.closeTo(0.1) },
      })
    );
  });
});
