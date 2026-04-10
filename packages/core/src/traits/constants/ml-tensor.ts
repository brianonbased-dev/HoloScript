/**
 * ML / Tensor Ops Traits
 * model_load, inference, embedding already in VR_TRAITS — only new names here
 * @version 1.0.0
 */
export const ML_TENSOR_TRAITS = [
  'tensor_op', // Tensor creation and manipulation
  'onnx_runtime', // ONNX model execution
  'training_loop', // On-device training loop
] as const;

export type MlTensorTraitName = (typeof ML_TENSOR_TRAITS)[number];
