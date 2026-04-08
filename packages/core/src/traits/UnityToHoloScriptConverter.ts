// @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
import type { Trait, HSPlusNode, TraitContext, TraitEvent, TraitHandler } from './TraitTypes';
/**
 * UnityToHoloScriptConverter
 *
 * Converts Unity scene data (C# MonoBehaviour attributes, materials, prefabs)
 * into HoloScript DSL and trait configurations.
 *
 * This is the primary migration path for Unity developers moving to HoloScript.
 * See: docs/UNITY_MIGRATION_GUIDE.md
 *
 * @version 4.0.0
 * @milestone HoloLand Platform Strategy — Unity Developer Migration
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UnityGameObject {
  name: string;
  tag?: string;
  layer?: number;
  isActive?: boolean;
  position?: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  scale?: { x: number; y: number; z: number };
  components?: UnityComponent[];
  children?: UnityGameObject[];
}

export interface UnityComponent {
  type: string; // e.g. 'MeshRenderer', 'Rigidbody', 'BoxCollider', 'Camera'
  enabled?: boolean;
  properties?: Record<string, unknown>;
}

export interface UnityMaterial {
  name: string;
  shader: string; // e.g. 'Standard', 'Universal Render Pipeline/Lit'
  properties?: {
    _Color?: { r: number; g: number; b: number; a: number };
    _Metallic?: number;
    _Glossiness?: number;
    _EmissionColor?: { r: number; g: number; b: number; a: number };
    _MainTex?: string;
    [key: string]: unknown;
  };
}

export interface UnityScene {
  name: string;
  gameObjects: UnityGameObject[];
  materials?: Record<string, UnityMaterial>;
  settings?: {
    ambientColor?: { r: number; g: number; b: number };
    fog?: boolean;
    fogColor?: { r: number; g: number; b: number };
    fogDensity?: number;
    skybox?: string;
  };
}

export interface ConversionResult {
  dsl: string;
  traits: string[];
  warnings: string[];
  unsupportedComponents: string[];
  materialMap: Record<string, string>;
}

// ─── Component Mapping ────────────────────────────────────────────────────────

const COMPONENT_TRAIT_MAP: Record<string, string> = {
  Rigidbody: 'PhysicsTrait',
  BoxCollider: 'ColliderTrait',
  SphereCollider: 'ColliderTrait',
  CapsuleCollider: 'ColliderTrait',
  MeshCollider: 'ColliderTrait',
  CharacterController: 'CharacterTrait',
  NavMeshAgent: 'PatrolTrait',
  Animator: 'AnimationTrait',
  AudioSource: 'AudioTrait',
  Light: 'LightTrait',
  Camera: 'CameraTrait',
  ParticleSystem: 'ParticleTrait',
  Canvas: 'UITrait',
  NetworkIdentity: 'MultiplayerTrait',
};

const SHADER_TYPE_MAP: Record<string, 'pbr' | 'unlit' | 'toon' | 'holographic'> = {
  Standard: 'pbr',
  'Universal Render Pipeline/Lit': 'pbr',
  'Universal Render Pipeline/Unlit': 'unlit',
  'Unlit/Color': 'unlit',
  'Unlit/Texture': 'unlit',
  'Sprites/Diffuse': 'unlit',
  'Toon/Lit': 'toon',
  'Holographic/Additive': 'holographic',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function vec3ToString(
  v: { x: number; y: number; z: number } | undefined,
  def = { x: 0, y: 0, z: 0 }
): string {
  const { x, y, z } = v ?? def;
  return `[${x}, ${y}, ${z}]`;
}

function colorToHex(c: { r: number; g: number; b: number } | undefined): string {
  if (!c) return '#ffffff';
  const r = Math.round(c.r * 255)
    .toString(16)
    .padStart(2, '0');
  const g = Math.round(c.g * 255)
    .toString(16)
    .padStart(2, '0');
  const b = Math.round(c.b * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${r}${g}${b}`;
}

function sanitizeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
}

// ─── Material Converter ───────────────────────────────────────────────────────

export function convertUnityMaterial(mat: UnityMaterial): { id: string; dsl: string } {
  const id = sanitizeId(mat.name);
  const shaderType = SHADER_TYPE_MAP[mat.shader] ?? 'pbr';
  const p = mat.properties ?? {};

  const color = p._Color ? colorToHex(p._Color as { r: number; g: number; b: number }) : '#cccccc';
  const metalness = typeof p._Metallic === 'number' ? p._Metallic : 0;
  const roughness = typeof p._Glossiness === 'number' ? 1 - (p._Glossiness as number) : 0.5;

  const emissive = p._EmissionColor ? colorToHex(p._EmissionColor as { r: number; g: number; b: number }) : undefined;

  const lines: string[] = [
    `  material ${id} : ${shaderType} {`,
    `    color: "${color}"`,
    `    metalness: ${metalness.toFixed(2)}`,
    `    roughness: ${roughness.toFixed(2)}`,
  ];

  if (emissive && emissive !== '#000000') {
    lines.push(`    emissive: "${emissive}" @ 1.0`);
  }

  lines.push(`  }`);

  return { id, dsl: lines.join('\n') };
}

// ─── GameObject Converter ─────────────────────────────────────────────────────

export function convertGameObject(
  go: UnityGameObject,
  indent = 1,
  result: ConversionResult
): string {
  const pad = '  '.repeat(indent);
  const id = sanitizeId(go.name);
  const components = go.components ?? [];

  const traits: string[] = [];
  const unsupported: string[] = [];

  // Determine geometry from mesh component
  const meshFilter = components.find((c) => c.type === 'MeshFilter');
  const geometry = (meshFilter?.properties?.mesh as string) ?? 'box';
  const geometryId = sanitizeId(geometry.replace(/(Mesh|Prefab)/g, '').toLowerCase() || 'box');

  // Map Unity components → traits
  for (const comp of components) {
    if (comp.type === 'MeshFilter' || comp.type === 'MeshRenderer' || comp.type === 'Transform')
      continue;
    const trait = COMPONENT_TRAIT_MAP[comp.type];
    if (trait) {
      if (!traits.includes(trait)) traits.push(trait);
    } else {
      const alreadyWarned = result.unsupportedComponents.includes(comp.type);
      if (!alreadyWarned) {
        result.unsupportedComponents.push(comp.type);
        result.warnings.push(`Component '${comp.type}' has no HoloScript equivalent — skipped`);
      }
    }
  }

  // Resolve material
  const meshRenderer = components.find((c) => c.type === 'MeshRenderer');
  const materialName = (meshRenderer?.properties?.material as string) ?? 'default';
  const materialId = result.materialMap[materialName] ?? sanitizeId(materialName);

  // Build DSL block
  const pos = vec3ToString(go.position);
  const rot = vec3ToString(go.rotation);
  const scale = vec3ToString(go.scale, { x: 1, y: 1, z: 1 });

  const lines: string[] = [
    `${pad}object ${id} : ${geometryId} {`,
    `${pad}  type: mesh`,
    `${pad}  position: ${pos}`,
    `${pad}  rotation: ${rot}`,
    `${pad}  scale: ${scale}`,
    `${pad}  material: ${materialId}`,
  ];

  if (traits.length > 0) {
    lines.push(`${pad}  traits: [${traits.map((t) => `"${t}"`).join(', ')}]`);
    for (const t of traits) {
      if (!result.traits.includes(t)) result.traits.push(t);
    }
  }

  // Recurse into children
  if (go.children?.length) {
    lines.push(`${pad}  children {`);
    for (const child of go.children) {
      lines.push(convertGameObject(child, indent + 2, result));
    }
    lines.push(`${pad}  }`);
  }

  lines.push(`${pad}}`);
  return lines.join('\n');
}

// ─── Scene Converter ──────────────────────────────────────────────────────────

export function convertUnityScene(scene: UnityScene): ConversionResult {
  const result: ConversionResult = {
    dsl: '',
    traits: [],
    warnings: [],
    unsupportedComponents: [],
    materialMap: {},
  };

  const lines: string[] = [
    `// HoloScript Scene — converted from Unity: ${scene.name}`,
    `// Generated by UnityToHoloScriptConverter v4.0`,
    `// See: UNITY_MIGRATION_GUIDE.md`,
    ``,
    `scene ${sanitizeId(scene.name)} {`,
  ];

  // Environment
  const settings = scene.settings;
  lines.push(`  environment {`);
  lines.push(`    skybox: "${settings?.skybox ?? 'default_sky'}"`);
  lines.push(`    ambient: "${colorToHex(settings?.ambientColor)}" @ 0.5`);
  if (settings?.fog) {
    lines.push(`    fog_density: ${settings.fogDensity ?? 0.02}`);
    lines.push(`    fog_color: "${colorToHex(settings.fogColor)}"`);
  }
  lines.push(`  }`);
  lines.push(``);

  // Materials
  if (scene.materials) {
    for (const [key, mat] of Object.entries(scene.materials)) {
      const { id, dsl } = convertUnityMaterial(mat);
      result.materialMap[key] = id;
      result.materialMap[mat.name] = id;
      lines.push(dsl);
      lines.push(``);
    }
  }

  // GameObjects
  for (const go of scene.gameObjects) {
    if (!go.isActive && go.isActive !== undefined) {
      result.warnings.push(`GameObject '${go.name}' is inactive — included but disabled`);
    }
    lines.push(convertGameObject(go, 1, result));
    lines.push(``);
  }

  lines.push(`}`);
  result.dsl = lines.join('\n');
  return result;
}

// ─── HoloScript Trait Wrapper ─────────────────────────────────────────────────

export interface UnityConverterConfig {
  /** Whether to include disabled GameObjects */
  include_inactive: boolean;
  /** Emit warnings for unsupported components */
  warn_unsupported: boolean;
  /** Auto-generate ColliderTrait for all mesh objects */
  auto_colliders: boolean;
}

const DEFAULT_CONVERTER_CONFIG: UnityConverterConfig = {
  include_inactive: false,
  warn_unsupported: true,
  auto_colliders: false,
};

export const unityConverterHandler = {
  defaultConfig: DEFAULT_CONVERTER_CONFIG,

  onAttach(node: HSPlusNode, _config: UnityConverterConfig, ctx: TraitContext): void {
    node.__unityConverterState = { totalConverted: 0, totalWarnings: 0 };
    ctx.emit('unity_converter_ready', { node });
  },

  onDetach(node: HSPlusNode, _config: UnityConverterConfig, ctx: TraitContext): void {
    if (!node.__unityConverterState) return;
    ctx.emit('unity_converter_stopped', { node, ...node.__unityConverterState });
    delete node.__unityConverterState;
  },

  onEvent(node: HSPlusNode, config: UnityConverterConfig, ctx: TraitContext, event: TraitEvent): void {
    const state = node.__unityConverterState;
    if (!state) return;

    if (event.type === 'unity_convert_scene') {
      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      const scene: UnityScene = event.payload?.scene;
      if (!scene) {
        ctx.emit('unity_converter_error', { node, error: 'No scene provided' });
        return;
      }

      try {
        // Filter inactive objects if configured
        const filtered: UnityScene = {
          ...scene,
          gameObjects: config.include_inactive
            ? scene.gameObjects
            : scene.gameObjects.filter((go) => go.isActive !== false),
        };

        const result = convertUnityScene(filtered);
        // @ts-expect-error
        state.totalConverted++;
        // @ts-expect-error
        state.totalWarnings += result.warnings.length;

        ctx.emit('unity_scene_converted', {
          node,
          requestId: event.payload?.requestId,
          dsl: result.dsl,
          traits: result.traits,
          warnings: result.warnings,
          unsupportedComponents: result.unsupportedComponents,
        });
      } catch (err: unknown) {
        // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
        ctx.emit('unity_converter_error', { node, error: err.message, scene: scene.name });
      }
    }

    if (event.type === 'unity_convert_material') {
      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      const mat: UnityMaterial = event.payload?.material;
      if (!mat) return;
      const { id, dsl } = convertUnityMaterial(mat);
      ctx.emit('unity_material_converted', { node, id, dsl });
    }

    if (event.type === 'unity_converter_stats') {
      ctx.emit('unity_converter_stats', { node, ...state });
    }
  },

  onUpdate(_n: HSPlusNode, _c: unknown, _ctx: TraitContext, _dt: number): void {
    /* sync only */
  },
} as const;
