
// Stubs for @holoscript/engine modules used by @holoscript/core
// This breaks circular dependencies during testing.

// Orbital
export const calculatePosition = () => [0, 0, 0];
export class TimeManager {
  static getInstance() { return new TimeManager(); }
  getJulianDate() { return 2460000; }
}
export class AttentionEngine {
  static getTopKEntities() { return []; }
}

// Runtime — matches the real singleton surface in runtime/StateMachineInterpreter.ts
// (plus legacy interpret() shim for any pre-refactor caller)
export const stateMachineInterpreter = {
  setHookExecutor(_executor: (code: string, ctx: Record<string, unknown>) => unknown) {},
  setGuardEvaluator(_evaluator: (expr: string, ctx: Record<string, unknown>) => unknown) {},
  createInstance(_id: string, _definition: unknown, _context: Record<string, unknown>) {
    return { definition: _definition, currentState: '', context: _context };
  },
  sendEvent(_id: string, _event: string) { return false; },
  transitionTo(_id: string, _target: string) {},
  getInstance(_id: string): undefined { return undefined; },
  removeInstance(_id: string) {},
  interpret() { return {}; },
};
export class BaseVoiceSynthesizer {}
export function registerVoiceSynthesizer() {}
export class LocalEmotionDetector {}
export function registerEmotionDetector() {}
export class MockSpeechRecognizer {}
export function registerSpeechRecognizer() {}
export const MethodMemoize = () => (target: any) => target;
export class ObjectPool {
  acquire() { return {}; }
  release() { }
}

// Scene
export class SceneNode {}
export class SceneManager {}
export class SceneSerializer {}
export class SceneDeserializer {}

// Rendering
export class ShaderGraph {}
export const SHADER_NODES = {};
export class SkyRenderer {}
export class LightingModel {}

// Animation
export class SkeletalBlender {}
export class SpringAnimator {}
export class Timeline {}
export const Easing = {};

// Spatial
export class TransformGraph {}
export class OctreeSystem {}
export class FrustumCuller {}

// Audio
export class SpatialAudioZoneSystem {}
export const REVERB_PRESETS = {};

// Camera
export class CameraController {}
export class CameraEffects {}
export class CameraShake {}

// Gameplay
export class InventorySystem {}

// Environment
export class TerrainSystem {}

// World
export class LODManager {}
export class WorldStreamer {}

// Input
export class InputManager {}

// VR
export class HandTracker {}
export class VRLocomotion {}
export class HapticFeedback {}

// Dialogue
export class DialogueGraph {}
export class DialogueRunner {}

// Physics
export class PhysicsEngine {}
export class SoftBodySolver {}
export class TriggerZoneSystem {}
export class VehicleSystem {}

// Procedural
export class WaveFunction {}

// ECS
export class World {}
export class EntityRegistry {}
export class ComponentStore {}
export class SystemScheduler {}
export const ComponentRegistry = {};

// Terrain
export class TerrainBrush {}
export class ErosionSim {}
export class TerrainTexturing {}
export class TerrainLOD {}
export class TerrainPaintLayer {}
export class ErosionBrush {}

// Runtime
export class CultureRuntime {}
export class NeuralVoiceAdapter {}

// GPU
export class GPUDeviceManager {}
export class GPUBufferManager {}
export class GPUComputePipeline {}
export const GPU_WORKGROUP_SIZE = [16, 16, 1];

// Navigation
export function getNavigationEngine() { return {}; }

// Framework
export class X402Facilitator {}
export class InvisibleWalletStub {}
export class SwarmManager {}
export class AgentExtension {}
