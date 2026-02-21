/**
 * Earthquake Demo - Complete System
 *
 * Exports all earthquake demonstration components for easy integration.
 *
 * @module demos/earthquake
 */

// Building generation
export { ProceduralBuilding, type BuildingConfig, type BuildingStructure, type StructuralElement, type WeakPoint } from './ProceduralBuilding.js';

// Fracture physics
export { FracturePhysics, type EarthquakeConfig, type DebrisParticle, type CollapseEvent } from './FracturePhysics.js';

// GPU integration
export { EarthquakeSimulation, createEarthquakeSimulation, type EarthquakeSimulationConfig, type SimulationState } from './EarthquakeSimulation.js';

// Camera effects
export { CameraController, type CameraShakeConfig, type CameraMode, type CameraPreset } from './CameraEffects.js';

// Demo scene
export { EarthquakeDemoScene, type DemoControls, type DemoUI } from './EarthquakeDemoScene.js';

// Runtime executor
export { EarthquakeRuntimeExecutor, type EarthquakeRuntimeConfig, type EarthquakeRuntimeStatistics } from './EarthquakeRuntimeExecutor';
