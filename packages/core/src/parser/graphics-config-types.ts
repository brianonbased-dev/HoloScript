/**
 * Graphics Configuration Types
 *
 * Type-only definitions for the graphics trait configuration shape consumed
 * by HololandGraphicsPipelineService. Extracted from the (now-deleted) decoy
 * `HoloScriptPlusParser.ts` at repo root, which was a narrow "Trait Annotation"
 * parser wrapping HoloScriptCodeParser — not the real grammar/directive parser
 * (see `parser/HoloScriptPlusParser.ts`, exported via `parser/index.ts`).
 *
 * This file carries ONLY the type shapes; it has no parsing logic and no
 * runtime behavior. Consumers that need the trait-annotation extraction
 * behavior itself (regex-based @material/@lighting/@rendering/@shader
 * scanning) should look for it in the real parser's grammar, not here.
 */

export interface MaterialTraitConfig {
  type?: string;
  pbr?: {
    baseColor?: { r: number; g: number; b: number };
    metallic?: number;
    roughness?: number;
    ambientOcclusion?: number;
    emission?: { r: number; g: number; b: number };
    emissionStrength?: number;
  };
  textures?: Array<{ path: string; channel: string }>;
  compression?: 'none' | 'dxt' | 'astc' | 'basis';
  instancing?: boolean;
  streaming?: boolean;
}

export interface LightingTraitConfig {
  preset?: 'studio' | 'outdoor' | 'interior' | 'night' | 'sunset';
  lights?: Array<{
    type: 'directional' | 'point' | 'spot' | 'area' | 'ambient';
    position?: [number, number, number];
    direction?: [number, number, number];
    color?: { r: number; g: number; b: number };
    intensity?: number;
    range?: number;
    shadows?: boolean;
  }>;
  globalIllumination?: {
    skyColor?: { r: number; g: number; b: number };
    groundColor?: { r: number; g: number; b: number };
    probes?: number;
  };
  shadows?: boolean;
  ao?: boolean;
}

export interface RenderingTraitConfig {
  quality?: 'low' | 'medium' | 'high' | 'ultra';
  platform?: 'mobile' | 'vr' | 'desktop';
  lod?: boolean;
  culling?: boolean;
  batching?: boolean;
  instancing?: boolean;
  maxTextureResolution?: number;
  compression?: 'none' | 'dxt' | 'astc' | 'basis';
  targetFPS?: number;
}

export interface ShaderTraitConfig {
  /** Preset shader name (hologram, forceField, dissolve) */
  preset?: string;
  /** Inline vertex shader GLSL */
  vertex?: string;
  /** Inline fragment shader GLSL */
  fragment?: string;
  /** Shader language (default: glsl) */
  language?: 'glsl' | 'hlsl' | 'wgsl';
  /** Uniform definitions */
  uniforms?: Record<string, { type: string; value: unknown; min?: number; max?: number }>;
  /** Include shader chunks (noise, hologram, fresnel, pbr, uv) */
  includes?: string[];
  /** Blend mode */
  blendMode?: 'opaque' | 'blend' | 'additive' | 'multiply';
  /** Depth testing */
  depthTest?: boolean;
  /** Depth writing */
  depthWrite?: boolean;
  /** Face culling */
  cullFace?: 'none' | 'front' | 'back';
}

export interface NetworkedTraitConfig {
  /** Sync mode */
  mode?: 'owner' | 'shared' | 'server';
  /** Properties to sync */
  syncProperties?: string[];
  /** Sync rate in Hz */
  syncRate?: number;
  /** Interpolation enabled */
  interpolation?: boolean;
  /** Network channel */
  channel?: string;
}

export interface RPCTraitConfig {
  /** RPC method name */
  method: string;
  /** Target (all, owner, server) */
  target?: 'all' | 'owner' | 'server';
  /** Reliable delivery */
  reliable?: boolean;
}

export interface JointTraitConfig {
  /** Joint type */
  jointType: 'fixed' | 'hinge' | 'ball' | 'slider' | 'spring';
  /** Connected body ID */
  connectedBody?: string;
  /** Anchor point */
  anchor?: [number, number, number];
  /** Axis of rotation/movement */
  axis?: [number, number, number];
  /** Limits */
  limits?: { min: number; max: number };
  /** Spring settings */
  spring?: { stiffness: number; damping: number };
  /** Break force */
  breakForce?: number;
}

export interface IKTraitConfig {
  /** IK chain name */
  chain: string;
  /** Target transform/object */
  target?: string;
  /** Pole target for elbow/knee direction */
  poleTarget?: string;
  /** Chain length (bones) */
  chainLength?: number;
  /** Iterations for solver */
  iterations?: number;
  /** Weight (0-1) */
  weight?: number;
}

export interface GraphicsConfiguration {
  material?: MaterialTraitConfig;
  lighting?: LightingTraitConfig;
  rendering?: RenderingTraitConfig;
  shader?: ShaderTraitConfig;
  networked?: NetworkedTraitConfig;
  rpc?: RPCTraitConfig;
  joint?: JointTraitConfig;
  ik?: IKTraitConfig;
}
