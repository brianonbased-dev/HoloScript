/**
 * Runtime types and interfaces
 */

export interface SceneGraph {
  name: string;
  objects: SceneNode[];
  environment: EnvironmentConfig;
}

export interface SceneNode {
  id: string;
  name: string;
  type: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number] | number;
  properties: Record<string, unknown>;
  traits: string[];
  children: SceneNode[];
}

export interface EnvironmentConfig {
  skybox?: string;
  ambientLight?: number;
  fog?: FogConfig;
  gravity?: { x: number; y: number; z: number };
}

export interface FogConfig {
  color: string;
  near: number;
  far: number;
}

export interface ParsedAST {
  type: string;
  body: unknown[];
  source?: string;
}
