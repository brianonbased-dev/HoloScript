/**
 * holoTorchModel.ts — full holo-arch (GPT-2-family) forward pass on WebGPU.
 *
 *   x = embed(ids) = wte[ids] + wpe[:T]
 *   for each of nLayer blocks: x = decoderBlock(x)
 *   x = LayerNorm_f(x)
 *   logits = x @ wteᵀ          (weight-tied LM head, no bias)
 *
 * Returns [T, vocab] logits. Weight-tied head: head.weight === wte, so
 * logits[t,v] = Σ_d x[t,d]·wte[v,d]. Weight convention [in,out] as in decoderBlock;
 * the checkpoint adapter maps real PyTorch weights (incl. the Conv1D transpose)
 * into this convention. v0 is correctness-first (host-side reshape/transpose).
 */
import { createGemmKernel, type GemmKernel } from '../gemmKernel';
import { createLayerNormKernel, type LayerNormKernel } from '../layerNormKernel';
import { createEmbeddingGatherKernel, type EmbeddingGatherKernel } from '../embeddingGatherKernel';
import { createHoloTorchBlock, type HoloTorchBlock, type BlockWeights } from './decoderBlock';

export interface ModelWeights {
  wte: Float32Array; // [vocab, nEmbd] token embedding (also the tied LM head)
  wpe: Float32Array; // [maxPos, nEmbd] learned positional embedding
  blocks: BlockWeights[]; // nLayer blocks
  lnfg: Float32Array; // [nEmbd] final LayerNorm gamma
  lnfb: Float32Array; // [nEmbd] final LayerNorm beta
}

export interface ModelConfig {
  nEmbd: number;
  nHead: number;
  vocab: number;
}

/** [rows, cols] -> [cols, rows]. */
function transpose(m: Float32Array, rows: number, cols: number): Float32Array {
  const out = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) out[c * rows + r] = m[r * cols + c];
  }
  return out;
}

export interface HoloTorchModel {
  /** ids: [T] token ids → [T, vocab] logits. */
  run(ids: Uint32Array, w: ModelWeights, cfg: ModelConfig): Promise<Float32Array>;
}

export function createHoloTorchModel(device: GPUDevice): HoloTorchModel {
  const embed: EmbeddingGatherKernel = createEmbeddingGatherKernel(device);
  const block: HoloTorchBlock = createHoloTorchBlock(device);
  const layerNorm: LayerNormKernel = createLayerNormKernel(device);
  const gemm: GemmKernel = createGemmKernel(device);

  return {
    async run(ids: Uint32Array, w: ModelWeights, cfg: ModelConfig): Promise<Float32Array> {
      const { nEmbd, nHead, vocab } = cfg;
      const T = ids.length;
      if (w.wpe.length < T * nEmbd)
        throw new Error(`holoTorchModel: wpe too small for seqLen=${T}`);

      const wpeSlice = w.wpe.slice(0, T * nEmbd);
      let x = await embed.run(ids, w.wte, wpeSlice, T, nEmbd, vocab);
      for (const bw of w.blocks) x = await block.run(x, bw, { seqLen: T, nEmbd, nHead });
      x = await layerNorm.run(x, w.lnfg, w.lnfb);

      // Weight-tied head: logits = x @ wteᵀ. wte is [vocab, nEmbd]; wteᵀ is [nEmbd, vocab].
      const wteT = transpose(w.wte, vocab, nEmbd);
      return gemm.run(x, wteT, T, vocab, nEmbd);
    },
  };
}
