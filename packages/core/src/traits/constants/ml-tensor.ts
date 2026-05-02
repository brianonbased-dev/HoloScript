/**
 * ML / Tensor Ops Traits
 * model_load, inference, embedding already in VR_TRAITS — only new names here
 *
 * Contract note: `onnx_runtime` is RUNTIME-ONLY — it has no compiler surface
 * beyond EffectInference resource effects. The trait uses an adapter pattern
 * (InferenceAdapter) where the execution backend is injected at runtime.
 * Adding a compiler mapping for it would contradict the adapter pattern.
 * See OnnxRuntimeTrait.ts JSDoc for full rationale.
 *
 * @version 1.1.0
 */
export const ML_TENSOR_TRAITS = [
  'tensor_op', // Tensor creation and manipulation
  'onnx_runtime', // ONNX model execution (RUNTIME-ONLY, no compiler surface)
  'training_loop', // On-device training loop
] as const;

export type MlTensorTraitName = (typeof ML_TENSOR_TRAITS)[number];
