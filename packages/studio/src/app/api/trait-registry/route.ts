import { NextRequest } from 'next/server';

/**
 * GET /api/trait-registry
 * Returns the complete registry of built-in HoloScript @trait names
 * with parameter definitions, descriptions, and ready-to-insert snippets.
 */

export interface TraitParam {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'color' | 'vector3' | 'enum';
  description: string;
  default?: string | number | boolean;
  options?: string[];   // for enum type
  required?: boolean;
}

export interface TraitEntry {
  id: string;
  name: string;           // e.g. "@transform"
  category: 'core' | 'rendering' | 'physics' | 'audio' | 'animation' | 'ai' | 'xr' | 'performance';
  emoji: string;
  description: string;
  params: TraitParam[];
  snippet: string;
  since: string;
  tags: string[];
}

const REGISTRY: TraitEntry[] = [
  {
    id: 'transform', name: '@transform', category: 'core', emoji: '📐', since: 'v1.0',
    description: 'Defines position, rotation (euler degrees), and scale of an object in 3D space.',
    tags: ['position', 'rotation', 'scale', 'core'],
    params: [
      { name: 'position', type: 'vector3', description: '[x, y, z] in world units', default: '[0, 0, 0]' },
      { name: 'rotation', type: 'vector3', description: '[rx, ry, rz] Euler degrees', default: '[0, 0, 0]' },
      { name: 'scale', type: 'vector3', description: '[sx, sy, sz] multipliers', default: '[1, 1, 1]' },
    ],
    snippet: `  @transform {\n    position: [0, 0, 0]\n    rotation: [0, 0, 0]\n    scale: [1, 1, 1]\n  }`,
  },
  {
    id: 'material', name: '@material', category: 'rendering', emoji: '💎', since: 'v1.0',
    description: 'PBR material properties including albedo, metallic, roughness, emissive, and opacity.',
    tags: ['pbr', 'texture', 'color', 'rendering'],
    params: [
      { name: 'albedo', type: 'color', description: 'Base color hex string', default: '"#ffffff"' },
      { name: 'metallic', type: 'number', description: '0.0 (dielectric) to 1.0 (metal)', default: 0 },
      { name: 'roughness', type: 'number', description: '0.0 (mirror) to 1.0 (matte)', default: 0.5 },
      { name: 'emissive', type: 'color', description: 'Glow color hex', default: '"#000000"' },
      { name: 'emissiveIntensity', type: 'number', description: 'Glow multiplier', default: 0 },
      { name: 'opacity', type: 'number', description: '0.0 (transparent) to 1.0 (opaque)', default: 1 },
      { name: 'fragmentShader', type: 'string', description: 'Shader preset ID from /api/shader-presets' },
    ],
    snippet: `  @material {\n    albedo: "#ffffff"\n    metallic: 0.0\n    roughness: 0.5\n    opacity: 1.0\n  }`,
  },
  {
    id: 'physics', name: '@physics', category: 'physics', emoji: '⚙️', since: 'v1.0',
    description: 'Rigid-body physics simulation. Type static = immovable, dynamic = falls+collides, kinematic = script-driven.',
    tags: ['collision', 'gravity', 'rigid-body'],
    params: [
      { name: 'type', type: 'enum', description: 'Physics body type', options: ['static', 'dynamic', 'kinematic'], required: true },
      { name: 'mass', type: 'number', description: 'Mass in kg (dynamic only)', default: 1 },
      { name: 'restitution', type: 'number', description: 'Bounciness 0–1', default: 0.3 },
      { name: 'friction', type: 'number', description: 'Surface friction 0–1', default: 0.5 },
      { name: 'linearDamping', type: 'number', description: 'Air resistance 0–1', default: 0 },
    ],
    snippet: `  @physics {\n    type: dynamic\n    mass: 1\n    restitution: 0.3\n    friction: 0.5\n  }`,
  },
  {
    id: 'audio', name: '@audio', category: 'audio', emoji: '🔊', since: 'v1.0',
    description: 'Attach spatial or ambient audio to an object. Supports loop, volume, pitch, and 3D falloff.',
    tags: ['sound', 'spatial', 'loop', '3d-audio'],
    params: [
      { name: 'src', type: 'string', description: 'Audio file path (ogg/mp3)', required: true },
      { name: 'loop', type: 'boolean', description: 'Loop playback', default: false },
      { name: 'volume', type: 'number', description: '0.0–1.0', default: 1 },
      { name: 'spatial', type: 'boolean', description: 'Enable 3D positional audio', default: true },
      { name: 'maxDistance', type: 'number', description: 'Spatial falloff distance', default: 20 },
      { name: 'pitch', type: 'number', description: 'Pitch multiplier', default: 1 },
    ],
    snippet: `  @audio {\n    src: "sound.ogg"\n    loop: true\n    volume: 0.8\n    spatial: true\n    maxDistance: 20\n  }`,
  },
  {
    id: 'animation', name: '@animation', category: 'animation', emoji: '🎬', since: 'v1.1',
    description: 'Attach keyframe animations or procedural motions (rotate, float, pulse) to an object.',
    tags: ['keyframe', 'rotate', 'float', 'motion'],
    params: [
      { name: 'idle', type: 'string', description: 'Idle animation clip name' },
      { name: 'rotate', type: 'vector3', description: 'Continuous rotation speed [rx, ry, rz] deg/s' },
      { name: 'float', type: 'string', description: 'Floating motion: "{ amplitude: 0.3 frequency: 0.5 }"' },
      { name: 'loop', type: 'boolean', description: 'Loop animation', default: true },
      { name: 'speed', type: 'number', description: 'Animation playback speed multiplier', default: 1 },
    ],
    snippet: `  @animation {\n    rotate: [0, 45, 0]\n    loop: true\n    speed: 1.0\n  }`,
  },
  {
    id: 'particles', name: '@particles', category: 'rendering', emoji: '✨', since: 'v1.2',
    description: 'GPU particle emitter with configurable type, rate, lifetime, size, and color gradient.',
    tags: ['vfx', 'emitter', 'fire', 'sparkle'],
    params: [
      { name: 'type', type: 'enum', description: 'Particle preset', options: ['fire', 'smoke', 'sparkle', 'rain', 'snow', 'dust', 'debris', 'custom'] },
      { name: 'rate', type: 'number', description: 'Particles emitted per second', default: 30 },
      { name: 'lifetime', type: 'number', description: 'Particle lifetime in seconds', default: 1 },
      { name: 'size', type: 'number', description: 'Particle size in world units', default: 0.1 },
      { name: 'color', type: 'color', description: 'Base particle color hex' },
    ],
    snippet: `  @particles {\n    type: sparkle\n    rate: 20\n    lifetime: 1.5\n    size: 0.1\n    color: "#ffffff"\n  }`,
  },
  {
    id: 'lod', name: '@lod', category: 'performance', emoji: '📊', since: 'v1.2',
    description: 'Level of Detail distances. Objects swap to lower-poly meshes beyond each threshold distance.',
    tags: ['performance', 'culling', 'distance', 'optimization'],
    params: [
      { name: 'levels', type: 'string', description: 'Array of [high, medium, low] switch distances in world units', default: '[5, 20, 60]' },
      { name: 'cull', type: 'number', description: 'Distance beyond which object is culled entirely', default: 200 },
    ],
    snippet: `  @lod {\n    levels: [5, 20, 60]\n    cull: 200\n  }`,
  },
  {
    id: 'light', name: '@light', category: 'rendering', emoji: '💡', since: 'v1.0',
    description: 'Defines a light source. Supports point, spot, directional, and area types.',
    tags: ['illumination', 'shadow', 'point', 'spot'],
    params: [
      { name: 'type', type: 'enum', description: 'Light type', options: ['point', 'spot', 'directional', 'area'], required: true },
      { name: 'color', type: 'color', description: 'Light color hex', default: '"#ffffff"' },
      { name: 'intensity', type: 'number', description: 'Light intensity', default: 1 },
      { name: 'range', type: 'number', description: 'Falloff range in world units (point/spot)', default: 10 },
      { name: 'angle', type: 'number', description: 'Cone angle in degrees (spot)', default: 60 },
      { name: 'castShadow', type: 'boolean', description: 'Enable shadow casting', default: false },
    ],
    snippet: `  @light {\n    type: point\n    color: "#ffffff"\n    intensity: 1.0\n    range: 10\n    castShadow: false\n  }`,
  },
  {
    id: 'environment', name: '@environment', category: 'rendering', emoji: '🌅', since: 'v1.3',
    description: 'Scene-level environment: sky, fog, and ambient light. Applied once per scene.',
    tags: ['sky', 'fog', 'ambient', 'scene'],
    params: [
      { name: 'sky', type: 'enum', description: 'Sky type', options: ['procedural', 'hdri', 'solid'], default: 'procedural' },
      { name: 'fog', type: 'enum', description: 'Fog type', options: ['none', 'linear', 'exponential'], default: 'none' },
      { name: 'ambient', type: 'color', description: 'Ambient light color hex', default: '"#222222"' },
      { name: 'ambientIntensity', type: 'number', description: 'Ambient light multiplier', default: 0.5 },
    ],
    snippet: `  @environment {\n    sky: procedural\n    fog: none\n    ambient: "#222222"\n    ambientIntensity: 0.5\n  }`,
  },
  {
    id: 'xr', name: '@xr', category: 'xr', emoji: '🥽', since: 'v1.4',
    description: 'Spatial/XR behaviours: billboard mode, gaze tracking, hand attachment, interaction, lifespan.',
    tags: ['vr', 'ar', 'xr', 'spatial', 'billboard'],
    params: [
      { name: 'billboard', type: 'boolean', description: 'Always face the camera', default: false },
      { name: 'followGaze', type: 'boolean', description: 'Smoothly follow gaze direction', default: false },
      { name: 'attachTo', type: 'string', description: 'Bone/anchor to attach to (e.g. "leftWrist")' },
      { name: 'interactable', type: 'boolean', description: 'Enable grab/pinch interaction', default: false },
      { name: 'lifespan', type: 'number', description: 'Auto-destroy after N milliseconds' },
    ],
    snippet: `  @xr {\n    billboard: true\n    interactable: true\n  }`,
  },
  {
    id: 'camera', name: '@camera', category: 'core', emoji: '📷', since: 'v1.0',
    description: 'Marks an object as a camera. Controls perspective FOV, near/far clip planes.',
    tags: ['camera', 'perspective', 'clip'],
    params: [
      { name: 'fov', type: 'number', description: 'Vertical field of view in degrees', default: 60 },
      { name: 'near', type: 'number', description: 'Near clip plane distance', default: 0.01 },
      { name: 'far', type: 'number', description: 'Far clip plane distance', default: 1000 },
      { name: 'active', type: 'boolean', description: 'Set as the active scene camera', default: false },
    ],
    snippet: `  @camera {\n    fov: 60\n    near: 0.01\n    far: 1000\n    active: true\n  }`,
  },
  {
    id: 'ai', name: '@ai', category: 'ai', emoji: '🤖', since: 'v2.0',
    description: 'Attach AI behaviour to an NPC: pathfinding goal, behaviour tree root, perception radius.',
    tags: ['npc', 'pathfinding', 'behaviour', 'ai'],
    params: [
      { name: 'goal', type: 'enum', description: 'High-level AI goal', options: ['idle', 'patrol', 'follow', 'flee', 'wander', 'attack'], default: 'idle' },
      { name: 'speed', type: 'number', description: 'Movement speed in units/s', default: 2 },
      { name: 'perception', type: 'number', description: 'Perception radius in world units', default: 10 },
      { name: 'agent', type: 'string', description: 'NavMesh agent preset ID' },
    ],
    snippet: `  @ai {\n    goal: patrol\n    speed: 2.5\n    perception: 12\n  }`,
  },
];

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.toLowerCase() ?? '';
  const category = request.nextUrl.searchParams.get('category') ?? '';
  let results: TraitEntry[] = REGISTRY;
  if (category) results = results.filter((t) => t.category === category);
  if (q) results = results.filter((t) =>
    t.name.toLowerCase().includes(q) ||
    t.description.toLowerCase().includes(q) ||
    t.tags.some((tag) => tag.includes(q))
  );
  const categories = [...new Set(REGISTRY.map((t) => t.category))];
  return Response.json({ traits: results, total: results.length, categories });
}
