import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { ModelConfig, ModelWeights } from '../holotorch/holoTorchModel';
import {
  createHoloTorchShadowExecutor,
  deriveHoloTorchArtifactBindingSha256,
  fingerprintHoloTorchTensorSet,
  verifyHoloTorchShadowExecutionReceipt,
  type HoloTorchExecutionEnvironment,
  type HoloTorchShadowBinding,
  type HoloTorchShadowVerificationPolicy,
} from '../index';

const sha256 = (hex: string): `sha256:${string}` => `sha256:${hex.repeat(64)}`;

function sequence(length: number, offset = 0): Float32Array {
  return Float32Array.from({ length }, (_, index) => offset + (index + 1) / 100);
}

function fixtureWeights(): ModelWeights {
  const n = 2;
  return {
    wte: sequence(6, 0.1),
    wpe: sequence(8, 0.2),
    blocks: [
      {
        ln1g: sequence(n, 0.3),
        ln1b: sequence(n, 0.4),
        wqkv: sequence(n * 3 * n, 0.5),
        bqkv: sequence(3 * n, 0.6),
        wproj: sequence(n * n, 0.7),
        bproj: sequence(n, 0.8),
        ln2g: sequence(n, 0.9),
        ln2b: sequence(n, 1.0),
        wfc1: sequence(n * 4 * n, 1.1),
        bfc1: sequence(4 * n, 1.2),
        wfc2: sequence(4 * n * n, 1.3),
        bfc2: sequence(n, 1.4),
      },
    ],
    lnfg: sequence(n, 1.5),
    lnfb: sequence(n, 1.6),
  };
}

const config: ModelConfig = { nEmbd: 2, nHead: 1, vocab: 3 };

const environment: HoloTorchExecutionEnvironment = {
  available: true,
  runtime: { name: 'node-webgpu', version: 'test', hostOS: 'win32-x64' },
  adapter: {
    vendor: 'nvidia',
    architecture: 'ampere',
    device: 'rtx-3060',
    driver: 'fixture-driver',
    fingerprintSha256: sha256('f'),
  },
};

async function validBinding(weights: ModelWeights): Promise<HoloTorchShadowBinding> {
  const tensorSet = await fingerprintHoloTorchTensorSet(weights, config);
  const material = {
    model: 'holorunner-s0',
    architecture: 'holo-gpt2-v0' as const,
    config: {
      nLayer: weights.blocks.length,
      nEmbd: config.nEmbd,
      nHead: config.nHead,
      vocab: config.vocab,
      maxPosition: weights.wpe.length / config.nEmbd,
    },
    checkpointSha256: sha256('b'),
    tokenizerSha256: sha256('c'),
    expectedTensorSetSha256: tensorSet.tensorSetSha256,
    kernelSetSha256: sha256('d'),
    runtimeSha256: sha256('e'),
    sourceRevision: 'ac2311050',
  };
  return {
    ...material,
    artifactBindingSha256: await deriveHoloTorchArtifactBindingSha256(material),
  };
}

function verificationPolicy(binding: HoloTorchShadowBinding): HoloTorchShadowVerificationPolicy {
  return {
    artifactBindingSha256: binding.artifactBindingSha256,
    adapterFingerprintSha256: environment.adapter.fingerprintSha256,
    sourceRevision: binding.sourceRevision,
  };
}

describe('HoloTorch shadow execution admission', () => {
  it('executes exactly once and emits a self-verifying bound shadow receipt', async () => {
    const weights = fixtureWeights();
    const binding = await validBinding(weights);
    const run = vi.fn(async () => Float32Array.from([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]));
    const executor = await createHoloTorchShadowExecutor({
      model: { run },
      weights,
      config,
      binding,
      environment,
      clock: {
        nowIso: () => '2026-07-18T00:00:00.000Z',
        nowMs: vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(12.5),
      },
    });

    const result = await executor.execute(Uint32Array.from([0, 2]));
    expect(run).toHaveBeenCalledTimes(1);
    expect(result.receipt.authority).toBe('shadow-only');
    expect(result.receipt.status).toBe('observed');
    expect(result.receipt.trust).toEqual({
      executionEvidence: 'caller-observed',
      authentication: 'self-hash-only',
      executionClass: 'one-shot-audit',
    });
    expect(result.receipt.artifact.tensorSetSha256).toBe(binding.expectedTensorSetSha256);
    expect(result.receipt.output.shape).toEqual([2, 3]);
    expect(result.receipt.timing.durationMs).toBe(2.5);
    await expect(
      verifyHoloTorchShadowExecutionReceipt(result.receipt, verificationPolicy(binding))
    ).resolves.toEqual({ valid: true, errors: [] });
    await expect(executor.execute(Uint32Array.from([0]))).rejects.toThrow(/one-shot audit/);
  });

  it('rejects missing or malformed binding hashes before model execution', async () => {
    const weights = fixtureWeights();
    const binding = await validBinding(weights);
    const run = vi.fn();
    await expect(
      createHoloTorchShadowExecutor({
        model: { run },
        weights,
        config,
        binding: { ...binding, checkpointSha256: 'sha256:ABC' as `sha256:${string}` },
        environment,
      })
    ).rejects.toThrow(/checkpointSha256/);
    expect(run).not.toHaveBeenCalled();
  });

  it('binds the actual tensor bytes and rejects a mutated weight set', async () => {
    const weights = fixtureWeights();
    const binding = await validBinding(weights);
    weights.wte[0] += 1;
    const run = vi.fn();
    await expect(
      createHoloTorchShadowExecutor({ model: { run }, weights, config, binding, environment })
    ).rejects.toThrow(/tensor set/);
    expect(run).not.toHaveBeenCalled();
  });

  it('rejects a well-formed artifact hash that does not bind its component hashes', async () => {
    const weights = fixtureWeights();
    const binding = await validBinding(weights);
    const run = vi.fn();
    await expect(
      createHoloTorchShadowExecutor({
        model: { run },
        weights,
        config,
        binding: { ...binding, checkpointSha256: sha256('9') },
        environment,
      })
    ).rejects.toThrow(/does not bind the admitted artifact/);
    expect(run).not.toHaveBeenCalled();
  });

  it('binds the exact admitted architecture configuration', async () => {
    const weights = fixtureWeights();
    const binding = await validBinding(weights);
    const material = {
      ...binding,
      config: { ...binding.config, nHead: 2 },
    };
    const changedBinding = {
      ...material,
      artifactBindingSha256: await deriveHoloTorchArtifactBindingSha256(material),
    };
    await expect(
      createHoloTorchShadowExecutor({
        model: { run: vi.fn() },
        weights,
        config,
        binding: changedBinding,
        environment,
      })
    ).rejects.toThrow(/binding config/);
  });

  it('snapshots mutable weights, config, binding, environment, ids, and logits', async () => {
    const weights = fixtureWeights();
    const localConfig = { ...config };
    const binding = await validBinding(weights);
    const localEnvironment = structuredClone(environment);
    const admittedWeight = weights.wte[0];
    let modelOutput: Float32Array | undefined;
    const run = vi.fn(
      async (ids: Uint32Array, admittedWeights: ModelWeights, admittedConfig: ModelConfig) => {
        ids[0] = 2;
        modelOutput = Float32Array.from([
          admittedWeights.wte[0],
          admittedConfig.vocab,
          admittedWeights.wte[1],
        ]);
        return modelOutput;
      }
    );
    const executor = await createHoloTorchShadowExecutor({
      model: { run },
      weights,
      config: localConfig,
      binding,
      environment: localEnvironment,
    });
    weights.wte[0] = 888;
    localConfig.vocab = 99;
    binding.model = 'mutated-model';
    localEnvironment.adapter.vendor = 'mutated-vendor';
    const ids = Uint32Array.from([1]);
    const result = await executor.execute(ids);
    modelOutput![0] = 999;
    expect(ids[0]).toBe(1);
    expect(result.logits[0]).toBe(admittedWeight);
    expect(result.logits[1]).toBe(3);
    expect(result.receipt.model.name).toBe('holorunner-s0');
    expect(result.receipt.runtime.adapter.vendor).toBe('nvidia');
  });

  it('fails closed when the injected model mutates the admitted tensor snapshot', async () => {
    const weights = fixtureWeights();
    const binding = await validBinding(weights);
    const executor = await createHoloTorchShadowExecutor({
      model: {
        run: async (_ids, admittedWeights) => {
          admittedWeights.wte[0] += 1;
          return Float32Array.from([0.1, 0.2, 0.3]);
        },
      },
      weights,
      config,
      binding,
      environment,
    });
    await expect(executor.execute(Uint32Array.from([1]))).rejects.toThrow(/mutated/);
  });

  it('rejects unavailable hardware, empty or OOV input, and malformed output', async () => {
    const weights = fixtureWeights();
    const binding = await validBinding(weights);
    await expect(
      createHoloTorchShadowExecutor({
        model: null,
        weights,
        config,
        binding,
        environment: { ...environment, available: false },
      })
    ).rejects.toThrow(/hardware unavailable/);

    const run = vi.fn(async () => Float32Array.from([1, 2]));
    const executor = await createHoloTorchShadowExecutor({
      model: { run },
      weights,
      config,
      binding,
      environment,
    });
    await expect(executor.execute(new Uint32Array())).rejects.toThrow(/at least one token/);
    await expect(executor.execute(Uint32Array.from([3]))).rejects.toThrow(/out of vocabulary/);
    await expect(executor.execute(Uint32Array.from([1]))).rejects.toThrow(/output length/);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('rejects non-finite logits and never emits a success receipt on execution failure', async () => {
    const weights = fixtureWeights();
    const binding = await validBinding(weights);
    const nonFinite = await createHoloTorchShadowExecutor({
      model: { run: async () => Float32Array.from([0, Number.NaN, 0]) },
      weights,
      config,
      binding,
      environment,
    });
    await expect(nonFinite.execute(Uint32Array.from([1]))).rejects.toThrow(/non-finite/);

    const failed = await createHoloTorchShadowExecutor({
      model: {
        run: async () => {
          throw new Error('device lost');
        },
      },
      weights,
      config,
      binding,
      environment,
    });
    await expect(failed.execute(Uint32Array.from([1]))).rejects.toThrow('device lost');
  });

  it('invalidates the receipt when any bound field is changed', async () => {
    const weights = fixtureWeights();
    const binding = await validBinding(weights);
    const executor = await createHoloTorchShadowExecutor({
      model: { run: async () => Float32Array.from([0.1, 0.2, 0.3]) },
      weights,
      config,
      binding,
      environment,
    });
    const { receipt } = await executor.execute(Uint32Array.from([1]));
    const tampered = structuredClone(receipt);
    tampered.input.tokenIdsSha256 = sha256('9');
    const verification = await verifyHoloTorchShadowExecutionReceipt(
      tampered,
      verificationPolicy(binding)
    );
    expect(verification.valid).toBe(false);
    expect(verification.errors).toContain(
      'receiptSha256 does not match the canonical receipt payload'
    );
  });

  it('requires a trusted binding policy and rejects inherited or mismatched receipts', async () => {
    const weights = fixtureWeights();
    const binding = await validBinding(weights);
    const executor = await createHoloTorchShadowExecutor({
      model: { run: async () => Float32Array.from([0.1, 0.2, 0.3]) },
      weights,
      config,
      binding,
      environment,
    });
    const { receipt } = await executor.execute(Uint32Array.from([1]));
    const noPolicy = await verifyHoloTorchShadowExecutionReceipt(
      receipt,
      undefined as unknown as HoloTorchShadowVerificationPolicy
    );
    expect(noPolicy.valid).toBe(false);
    expect(noPolicy.errors).toContain('trusted verification policy is required');

    const mismatch = await verifyHoloTorchShadowExecutionReceipt(receipt, {
      ...verificationPolicy(binding),
      artifactBindingSha256: sha256('9'),
    });
    expect(mismatch.valid).toBe(false);
    expect(mismatch.errors).toContain(
      'artifactBindingSha256 does not match trusted verification policy'
    );

    const inherited = Object.create(receipt) as typeof receipt;
    Object.defineProperty(inherited, 'receiptSha256', {
      value: receipt.receiptSha256,
      enumerable: true,
    });
    const inheritedResult = await verifyHoloTorchShadowExecutionReceipt(
      inherited,
      verificationPolicy(binding)
    );
    expect(inheritedResult.valid).toBe(false);
    expect(inheritedResult.errors).toContain('receipt must be a plain object');
  });

  it('rejects the legacy unbound model parity receipt', async () => {
    const legacy = JSON.parse(
      readFileSync(
        new URL('../holotorch/receipts/model-e2e-parity.receipt.json', import.meta.url),
        'utf8'
      )
    );
    const verification = await verifyHoloTorchShadowExecutionReceipt(legacy, {
      artifactBindingSha256: sha256('a'),
      adapterFingerprintSha256: sha256('f'),
      sourceRevision: 'legacy',
    });
    expect(verification.valid).toBe(false);
    expect(verification.errors).toContain(
      'schema must be holoscript.holotorch-shadow-execution.v0.1.0'
    );
  });
});
