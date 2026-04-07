function createNoopClass() {
  return class NoopProxy {
    constructor() {
      return new Proxy(this, {
        get(target, prop) {
          if (prop === 'then') return undefined;
          if (prop === 'constructor') return target.constructor;
          if (prop === 'length') return 0;
          return new Proxy(() => {}, {
            get(t, p) {
              if (p === 'then') return undefined;
              return () => {};
            },
            apply() {
              return {}; // Return dummy object for chained calls
            }
          });
        }
      });
    }
  };
}

export const Easing = new Proxy({}, { get: () => () => 1 });
export const Timeline = createNoopClass();
export const TerrainSystem = createNoopClass();
export type TerrainConfig = any;
export type TerrainLayer = any;
export const AnimationEngine = createNoopClass();
export const AudioEngine = createNoopClass();
export const CameraController = createNoopClass();
export const CombatManager = createNoopClass();
export const CultureRuntime = createNoopClass();
export const DialogueGraph = createNoopClass();
export const InputManager = createNoopClass();
export const InventorySystem = createNoopClass();
export const LODManager = createNoopClass();
export const LightingModel = createNoopClass();
export const ParticleSystem = createNoopClass();
export const NavMesh = createNoopClass();
export const AStarPathfinder = createNoopClass();
export const TileMap = createNoopClass();
export const TileFlags = { SOLID: 1, WATER: 2 };
export const SceneManager = createNoopClass();
