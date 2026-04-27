/**
 * @holoscript/core/traits/engines — motion-matching engine surface
 *
 * Lightweight barrel exporting only the engines (no plugin imports, no
 * compiler dependencies). Lets downstream packages — @holoscript/runtime,
 * @holoscript/r3f-renderer, third-party engines — import the inference
 * surface without dragging the full traits barrel through their bundler.
 *
 * idea-run-3 BUILD-1 scaffolding (founder ruling 2026-04-26).
 */

export * from './motion-matching';
export * from './synthetic-walk-cycle';
export * from './onnx-adapter';
export * from './motion-data-schema';
export * from './cloth-verlet';
export * from './noise';
