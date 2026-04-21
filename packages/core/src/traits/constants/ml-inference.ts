/**
 * ML / Inference Traits
 *
 * Machine learning and AI inference primitives — model loading,
 * inference execution, embedding generation, fine-tuning jobs,
 * vector search, and prompt template management.
 *
 * @version 1.0.0
 */
export const ML_INFERENCE_TRAITS = [
  // ─── Model Lifecycle ──────────────────────────────────────────────
  'model_load', // Load / unload ML model with warmup
  'fine_tune', // Fine-tuning job management

  // ─── Execution ────────────────────────────────────────────────────
  'inference', // Run inference (text, image, structured)
  'embedding', // Generate vector embeddings

  // ─── Retrieval ────────────────────────────────────────────────────
  'vector_search', // Nearest-neighbor similarity search
  'prompt_template', // Template management with variable substitution

  // ─── Vision / Depth ───────────────────────────────────────────────
  'depth_estimation', // Monocular depth from 2D image/video (Depth Anything V2)
] as const;

export type MLInferenceTraitName = (typeof ML_INFERENCE_TRAITS)[number];
