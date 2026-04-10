export * from './ParticleSystem';
export * from './ParticleAffectors';
export { ParticlePresets } from './ParticlePresets';

export {
  ParticleAttractorSystem,
  type Attractor,
  type AttractorShape,
  type Particle as AttractorParticle,
} from './ParticleAttractor';

export {
  ParticleEmitter,
  type IVector3 as EmitterVector3,
  type IColor,
  type CurveKeyframe,
  type EmissionShape,
  type EmitterConfig as EmitterSourceConfig,
  type Particle as EmitterParticle,
  type EmitterState,
} from './ParticleEmitter';

export {
  ParticleCollisionSystem,
  type CollisionPlane,
  type CollisionSphere,
  type CollidableParticle,
  type SubEmitCallback,
} from './ParticleCollision';

export {
  ParticleForceSystem,
  type ForceType,
  type ForceFieldConfig,
  type ForceField,
} from './ParticleForces';

export { ParticleTurbulence, type TurbulenceConfig } from './ParticleTurbulence';

export {
  particleTraitHandler,
  getNodeParticleSystem,
  type HSPlusNode,
  type TraitHandler,
  type ParticleTraitConfig,
} from './ParticleTrait';
