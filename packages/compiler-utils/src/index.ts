/**
 * @holoscript/compiler-utils — Shared Compiler Utilities
 *
 * Domain block compilation (materials, physics, particles, post-fx, audio, weather)
 * and target-specific codegen helpers (R3F, Unity, USD, URDF, glTF).
 *
 * Used by 17+ compile targets across the HoloScript ecosystem.
 */

export {
  // Types
  type CompiledMaterial,
  type CompiledPhysics,
  type CompiledCollider,
  type CompiledRigidbody,
  type CompiledForceField,
  type CompiledJoint,
  type CompiledParticleSystem,
  type CompiledParticleModule,
  type CompiledPostEffect,
  type CompiledPostProcessing,
  type CompiledAudioSource,
  type CompiledWeatherLayer,
  type CompiledWeather,
  type TierContext,
  // Compile functions
  compileMaterialBlock,
  compilePhysicsBlock,
  compileParticleBlock,
  compilePostProcessingBlock,
  compileAudioSourceBlock,
  compileWeatherBlock,
  // Target-specific codegen
  particlesToR3F,
  postProcessingToR3F,
  audioSourceToR3F,
  weatherToUSD,
  materialToR3F,
  materialToUSD,
  materialToGLTF,
  physicsToURDF,
  materialToUnity,
  physicsToUnity,
  particlesToUnity,
  // Domain block dispatch
  compileDomainBlocks,
} from '@holoscript/core/compiler/domain-block-utils';
