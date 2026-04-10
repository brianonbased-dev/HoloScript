/**
 * DiagnosticProvider.ts
 *
 * Provides diagnostics (errors, warnings, hints) for HoloScript+ source code.
 * Validates: directive usage, property types, node structure, trait compatibility,
 * domain block properties, simulation construct requirements, and all v4.2
 * perception/simulation layer blocks.
 *
 * @version 4.2.1
 */

export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint';

export interface Diagnostic {
  severity: DiagnosticSeverity;
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  source: string;
  code?: string;
}

export interface DiagnosticRule {
  id: string;
  check: (context: DiagnosticContext) => Diagnostic[];
}

export interface DiagnosticContext {
  /** Parsed nodes */
  nodes: Array<{
    type: string;
    name?: string;
    directives?: Array<{ name: string; args?: unknown }>;
    properties?: Record<string, any>;
    loc?: { start: { line: number; column: number }; end: { line: number; column: number } };
    children?: unknown[];
    domain?: string;
    keyword?: string;
    /** Collider shape (box, sphere, capsule, mesh, convex, cylinder, heightfield) */
    shape?: string;
    /** Sub-blocks/modules within this block */
    subBlocks?: Array<{ keyword: string; name?: string; properties?: Record<string, any> }>;
  }>;
  /** Known trait names */
  knownTraits: Set<string>;
}

// =============================================================================
// BUILT-IN RULES
// =============================================================================

const KNOWN_DIRECTIVES = new Set([
  'version',
  'author',
  'description',
  'tags',
  'license',
  'deprecated',
  'if',
  'each',
  'slot',
  'switch',
  'case',
  'default',
  'for',
  'on',
  'emit',
  'once',
  'watch',
  'computed',
  'effect',
  // Simulation traits (v4.2)
  'physics',
  'collidable',
  'networked',
  'pbr',
  'spatial',
  'hrtf',
  'looping',
  'dynamic',
  'lod',
  'obstacle_avoidance',
  'safety_rated',
  'telemetry',
  'animated',
  'encoder',
  'revolute',
  'seed',
  // Material & rendering traits (v4.2)
  'transparent',
  'double_sided',
  'unlit',
  // Interaction traits
  'grabbable',
  'scrollable',
  'keyboard',
]);

const unknownDirectiveRule: DiagnosticRule = {
  id: 'HS001',
  check(ctx: DiagnosticContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const node of ctx.nodes) {
      if (!node.directives) continue;
      for (const d of node.directives) {
        if (!KNOWN_DIRECTIVES.has(d.name) && !ctx.knownTraits.has(d.name)) {
          diagnostics.push({
            severity: 'warning',
            message: `Unknown directive '@${d.name}' — may be a custom trait`,
            line: node.loc?.start.line || 0,
            column: node.loc?.start.column || 0,
            source: 'holoscript',
            code: 'HS001',
          });
        }
      }
    }
    return diagnostics;
  },
};

const emptyChildrenWarning: DiagnosticRule = {
  id: 'HS002',
  check(ctx: DiagnosticContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const node of ctx.nodes) {
      if (node.type === 'group' && (!node.children || node.children.length === 0)) {
        diagnostics.push({
          severity: 'warning',
          message: `Empty group '${node.name || 'unnamed'}' has no children`,
          line: node.loc?.start.line || 0,
          column: node.loc?.start.column || 0,
          source: 'holoscript',
          code: 'HS002',
        });
      }
    }
    return diagnostics;
  },
};

const deprecatedDirectiveHint: DiagnosticRule = {
  id: 'HS003',
  check(ctx: DiagnosticContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const node of ctx.nodes) {
      if (!node.directives) continue;
      for (const d of node.directives) {
        if (d.name === 'deprecated') {
          diagnostics.push({
            severity: 'hint',
            message: `Node '${node.name || node.type}' is marked as deprecated`,
            line: node.loc?.start.line || 0,
            column: node.loc?.start.column || 0,
            source: 'holoscript',
            code: 'HS003',
          });
        }
      }
    }
    return diagnostics;
  },
};

// Required properties per domain/simulation block keyword
const REQUIRED_PROPERTIES: Record<string, string[]> = {
  // Material system
  material: ['baseColor'],
  pbr_material: ['baseColor'],
  toon_material: ['baseColor'],
  glass_material: ['ior'],
  subsurface_material: ['baseColor', 'subsurface_color'],
  // Physics
  rigidbody: ['mass'],
  collider: [], // shape is required but comes as a separate field, not a property
  // Audio
  audio_source: ['clip'],
  sound_emitter: ['clip'],
  ambience: ['clip'],
  reverb_zone: ['decay_time'],
  // Navigation
  navmesh: ['agent_radius', 'agent_height'],
  nav_agent: ['speed'],
  // IoT
  sensor: ['type'],
  device: ['protocol'],
  // Articulation
  articulation: [], // needs at least one joint sub-block (checked separately)
  // Scatter / procedural
  scatter: ['count'],
};

const domainBlockValidation: DiagnosticRule = {
  id: 'HS004',
  check(ctx: DiagnosticContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const node of ctx.nodes) {
      if (node.type !== 'DomainBlock' || !node.keyword) continue;
      const required = REQUIRED_PROPERTIES[node.keyword];
      if (!required) continue;
      for (const prop of required) {
        if (!node.properties || !(prop in node.properties)) {
          diagnostics.push({
            severity: 'warning',
            message: `'${node.keyword}' block '${node.name || 'unnamed'}' is missing recommended property '${prop}'`,
            line: node.loc?.start.line || 0,
            column: node.loc?.start.column || 0,
            source: 'holoscript',
            code: 'HS004',
          });
        }
      }
    }
    return diagnostics;
  },
};

const materialTextureHint: DiagnosticRule = {
  id: 'HS005',
  check(ctx: DiagnosticContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const node of ctx.nodes) {
      if (node.keyword !== 'pbr_material' && node.keyword !== 'material') continue;
      const props = node.properties || {};
      const hasTexture = Object.keys(props).some((k) => k.endsWith('_map'));
      if (!hasTexture && props['roughness'] !== undefined) {
        diagnostics.push({
          severity: 'info',
          message: `Material '${node.name || 'unnamed'}' has no texture maps — consider adding albedo_map for better visual quality`,
          line: node.loc?.start.line || 0,
          column: node.loc?.start.column || 0,
          source: 'holoscript',
          code: 'HS005',
        });
      }
    }
    return diagnostics;
  },
};

// =============================================================================
// v4.2 EXPANDED VALIDATION RULES
// =============================================================================

// ── HS006: Collider shape validation ────────────────────────────────────────
const VALID_COLLIDER_SHAPES = new Set([
  'box',
  'sphere',
  'capsule',
  'mesh',
  'convex',
  'cylinder',
  'heightfield',
]);

const colliderShapeValidation: DiagnosticRule = {
  id: 'HS006',
  check(ctx: DiagnosticContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const node of ctx.nodes) {
      if (node.type !== 'DomainBlock') continue;
      if (node.keyword !== 'collider' && node.keyword !== 'trigger') continue;
      if (node.shape && !VALID_COLLIDER_SHAPES.has(node.shape)) {
        diagnostics.push({
          severity: 'error',
          message: `Invalid collider shape '${node.shape}' — expected one of: box, sphere, capsule, mesh, convex, cylinder, heightfield`,
          line: node.loc?.start.line || 0,
          column: node.loc?.start.column || 0,
          source: 'holoscript',
          code: 'HS006',
        });
      }
    }
    return diagnostics;
  },
};

// ── HS007: Numeric range validation ─────────────────────────────────────────
// Validates that properties with known ranges have valid values
const RANGE_CONSTRAINTS: Record<string, Record<string, [number, number]>> = {
  material: {
    roughness: [0, 1],
    metallic: [0, 1],
    opacity: [0, 1],
    clearcoat: [0, 1],
    sheen: [0, 1],
    anisotropy: [0, 1],
  },
  pbr_material: { roughness: [0, 1], metallic: [0, 1], opacity: [0, 1] },
  glass_material: { opacity: [0, 1], transmission: [0, 1], ior: [1, 2.5] },
  toon_material: { shading_steps: [1, 10] },
  subsurface_material: { roughness: [0, 1], thickness: [0, 10] },
  rigidbody: { mass: [0, Infinity], linear_damping: [0, 1], angular_damping: [0, 1] },
  audio_source: {
    volume: [0, 1],
    pitch: [0.5, 3],
    min_distance: [0, Infinity],
    max_distance: [0, Infinity],
    spread: [0, 360],
    doppler_level: [0, 5],
  },
  reverb_zone: {
    decay_time: [0.1, 20],
    room_size: [0, 1],
    diffusion: [0, 1],
    high_freq_damping: [0, 1],
  },
  force_field: { strength: [-Infinity, Infinity] },
  wind_zone: { turbulence: [0, 1] },
  buoyancy_zone: { density: [0, Infinity], drag: [0, Infinity] },
  navmesh: {
    agent_radius: [0.01, Infinity],
    agent_height: [0.1, Infinity],
    max_slope: [0, 90],
    step_height: [0, Infinity],
  },
  nav_agent: { speed: [0, Infinity], stopping_distance: [0, Infinity] },
  input: { deadzone: [0, 1], sensitivity: [0, Infinity] },
};

const numericRangeValidation: DiagnosticRule = {
  id: 'HS007',
  check(ctx: DiagnosticContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const node of ctx.nodes) {
      if (node.type !== 'DomainBlock' || !node.keyword || !node.properties) continue;
      const constraints = RANGE_CONSTRAINTS[node.keyword];
      if (!constraints) continue;
      for (const [prop, [min, max]] of Object.entries(constraints)) {
        const val = node.properties[prop];
        if (val === undefined || typeof val !== 'number') continue;
        if (val < min || val > max) {
          diagnostics.push({
            severity: 'warning',
            message: `Property '${prop}' value ${val} is outside expected range [${min}, ${max}] in '${node.keyword}' block '${node.name || 'unnamed'}'`,
            line: node.loc?.start.line || 0,
            column: node.loc?.start.column || 0,
            source: 'holoscript',
            code: 'HS007',
          });
        }
      }
    }
    return diagnostics;
  },
};

// ── HS008: Force field type validation ──────────────────────────────────────
const VALID_FORCE_FIELD_TYPES = new Set([
  'force_field',
  'gravity_zone',
  'wind_zone',
  'buoyancy_zone',
  'magnetic_field',
  'drag_zone',
]);

const forceFieldValidation: DiagnosticRule = {
  id: 'HS008',
  check(ctx: DiagnosticContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const node of ctx.nodes) {
      if (node.type !== 'DomainBlock') continue;
      if (!VALID_FORCE_FIELD_TYPES.has(node.keyword || '')) continue;
      const props = node.properties || {};
      // Force fields should have at least strength or a primary property
      const keyword = node.keyword || '';
      const hasRequiredProp =
        keyword === 'force_field'
          ? 'strength' in props || 'direction' in props
          : keyword === 'gravity_zone'
            ? 'gravity' in props
            : keyword === 'wind_zone'
              ? 'direction' in props || 'strength' in props
              : keyword === 'buoyancy_zone'
                ? 'density' in props
                : keyword === 'magnetic_field'
                  ? 'strength' in props
                  : keyword === 'drag_zone'
                    ? 'linear_drag' in props || 'angular_drag' in props
                    : true;
      if (!hasRequiredProp) {
        diagnostics.push({
          severity: 'info',
          message: `'${keyword}' block '${node.name || 'unnamed'}' has no force parameters — consider adding strength or direction`,
          line: node.loc?.start.line || 0,
          column: node.loc?.start.column || 0,
          source: 'holoscript',
          code: 'HS008',
        });
      }
    }
    return diagnostics;
  },
};

// ── HS009: Joint type validation ────────────────────────────────────────────
const VALID_JOINT_TYPES = new Set([
  'joint',
  'hinge',
  'slider',
  'ball_socket',
  'fixed_joint',
  'd6_joint',
  'spring_joint',
  'prismatic',
]);

const jointValidation: DiagnosticRule = {
  id: 'HS009',
  check(ctx: DiagnosticContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const node of ctx.nodes) {
      if (node.type !== 'DomainBlock') continue;
      if (!VALID_JOINT_TYPES.has(node.keyword || '')) continue;
      const props = node.properties || {};
      const keyword = node.keyword || '';
      // Hinge and slider require axis
      if (
        (keyword === 'hinge' || keyword === 'slider' || keyword === 'prismatic') &&
        !('axis' in props)
      ) {
        diagnostics.push({
          severity: 'warning',
          message: `'${keyword}' joint '${node.name || 'unnamed'}' is missing required 'axis' property`,
          line: node.loc?.start.line || 0,
          column: node.loc?.start.column || 0,
          source: 'holoscript',
          code: 'HS009',
        });
      }
      // Spring joint requires stiffness
      if (keyword === 'spring_joint' && !('stiffness' in props)) {
        diagnostics.push({
          severity: 'warning',
          message: `spring_joint '${node.name || 'unnamed'}' is missing recommended 'stiffness' property`,
          line: node.loc?.start.line || 0,
          column: node.loc?.start.column || 0,
          source: 'holoscript',
          code: 'HS009',
        });
      }
    }
    return diagnostics;
  },
};

// ── HS010: Particle system validation ───────────────────────────────────────
const VALID_PARTICLE_MODULES = new Set([
  'emission',
  'lifetime',
  'velocity',
  'force',
  'color_over_life',
  'size_over_life',
  'noise',
  'collision',
  'sub_emitter',
  'shape',
  'renderer',
  'rotation_over_life',
  'trails',
  'texture_sheet',
  'inherit_velocity',
]);

const particleSystemValidation: DiagnosticRule = {
  id: 'HS010',
  check(ctx: DiagnosticContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const node of ctx.nodes) {
      if (node.type !== 'DomainBlock') continue;
      if (
        node.keyword !== 'particles' &&
        node.keyword !== 'particle_system' &&
        node.keyword !== 'emitter'
      )
        continue;
      const props = node.properties || {};
      // Particle systems should define max_particles or have an emission module
      const hasEmission = node.subBlocks?.some((b) => b.keyword === 'emission');
      if (!('max_particles' in props) && !hasEmission && node.keyword !== 'emitter') {
        diagnostics.push({
          severity: 'info',
          message: `Particle system '${node.name || 'unnamed'}' has no max_particles or emission module — particles may be unbounded`,
          line: node.loc?.start.line || 0,
          column: node.loc?.start.column || 0,
          source: 'holoscript',
          code: 'HS010',
        });
      }
      // Validate sub-block keywords
      if (node.subBlocks) {
        for (const sub of node.subBlocks) {
          if (!VALID_PARTICLE_MODULES.has(sub.keyword)) {
            diagnostics.push({
              severity: 'warning',
              message: `Unknown particle module '${sub.keyword}' in '${node.name || 'unnamed'}' — valid modules: emission, lifetime, velocity, force, color_over_life, size_over_life, noise, collision, sub_emitter, shape, renderer, rotation_over_life, trails, texture_sheet, inherit_velocity`,
              line: node.loc?.start.line || 0,
              column: node.loc?.start.column || 0,
              source: 'holoscript',
              code: 'HS010',
            });
          }
        }
      }
    }
    return diagnostics;
  },
};

// ── HS011: Post-processing effect validation ────────────────────────────────
const VALID_POST_EFFECTS = new Set([
  'bloom',
  'ambient_occlusion',
  'ssao',
  'color_grading',
  'tone_mapping',
  'depth_of_field',
  'motion_blur',
  'vignette',
  'chromatic_aberration',
  'fog',
  'volumetric_fog',
  'screen_space_reflections',
  'ssr',
  'anti_aliasing',
  'fxaa',
  'smaa',
  'taa',
  'film_grain',
  'lens_flare',
  'god_rays',
  'outline',
  'pixelate',
]);

const postProcessingValidation: DiagnosticRule = {
  id: 'HS011',
  check(ctx: DiagnosticContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const node of ctx.nodes) {
      if (node.type !== 'DomainBlock') continue;
      if (
        node.keyword !== 'post_processing' &&
        node.keyword !== 'post_fx' &&
        node.keyword !== 'render_pipeline'
      )
        continue;
      // Validate sub-block keywords are valid effects
      if (node.subBlocks) {
        for (const sub of node.subBlocks) {
          if (!VALID_POST_EFFECTS.has(sub.keyword)) {
            diagnostics.push({
              severity: 'warning',
              message: `Unknown post-processing effect '${sub.keyword}' in '${node.name || 'unnamed'}'`,
              line: node.loc?.start.line || 0,
              column: node.loc?.start.column || 0,
              source: 'holoscript',
              code: 'HS011',
            });
          }
        }
        // Warn about redundant AA settings
        const aaEffects = node.subBlocks.filter((b) =>
          ['anti_aliasing', 'fxaa', 'smaa', 'taa'].includes(b.keyword)
        );
        if (aaEffects.length > 1) {
          diagnostics.push({
            severity: 'warning',
            message: `Post-processing '${node.name || 'unnamed'}' has ${aaEffects.length} anti-aliasing effects (${aaEffects.map((a) => a.keyword).join(', ')}) — only one should be active`,
            line: node.loc?.start.line || 0,
            column: node.loc?.start.column || 0,
            source: 'holoscript',
            code: 'HS011',
          });
        }
      }
    }
    return diagnostics;
  },
};

// ── HS012: Weather layer validation ─────────────────────────────────────────
const VALID_WEATHER_LAYERS = new Set([
  'rain',
  'snow',
  'wind',
  'lightning',
  'clouds',
  'hail',
  'time_of_day',
  'sun',
  'moon',
  'fog_layer',
  'aurora',
  'dust_storm',
  'humidity',
  'temperature',
]);

const weatherValidation: DiagnosticRule = {
  id: 'HS012',
  check(ctx: DiagnosticContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const node of ctx.nodes) {
      if (node.type !== 'DomainBlock') continue;
      if (node.keyword !== 'weather' && node.keyword !== 'climate' && node.keyword !== 'atmosphere')
        continue;
      if (node.subBlocks) {
        for (const sub of node.subBlocks) {
          if (!VALID_WEATHER_LAYERS.has(sub.keyword)) {
            diagnostics.push({
              severity: 'warning',
              message: `Unknown weather layer '${sub.keyword}' in '${node.name || 'unnamed'}'`,
              line: node.loc?.start.line || 0,
              column: node.loc?.start.column || 0,
              source: 'holoscript',
              code: 'HS012',
            });
          }
        }
      }
    }
    return diagnostics;
  },
};

// ── HS013: Procedural noise function validation ─────────────────────────────
const VALID_NOISE_FUNCTIONS = new Set([
  'perlin',
  'simplex',
  'voronoi',
  'worley',
  'fbm',
  'ridged',
  'cellular',
  'white_noise',
  'curl',
  'domain_warp',
]);

const proceduralValidation: DiagnosticRule = {
  id: 'HS013',
  check(ctx: DiagnosticContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const node of ctx.nodes) {
      if (node.type !== 'DomainBlock') continue;
      if (node.keyword !== 'procedural' && node.keyword !== 'generate') continue;
      if (node.subBlocks) {
        for (const sub of node.subBlocks) {
          // Allow noise functions and biome rules
          if (sub.keyword !== 'biome' && !VALID_NOISE_FUNCTIONS.has(sub.keyword)) {
            diagnostics.push({
              severity: 'warning',
              message: `Unknown procedural function '${sub.keyword}' in '${node.name || 'unnamed'}' — expected noise function (perlin, simplex, voronoi, etc.) or biome rule`,
              line: node.loc?.start.line || 0,
              column: node.loc?.start.column || 0,
              source: 'holoscript',
              code: 'HS013',
            });
          }
        }
      }
    }
    return diagnostics;
  },
};

// ── HS014: Behavior tree node validation ────────────────────────────────────
const VALID_BT_NODES = new Set([
  'selector',
  'sequence',
  'condition',
  'leaf',
  'parallel',
  'decorator',
  'inverter',
  'repeater',
  'cooldown',
  'guard',
]);

const behaviorTreeValidation: DiagnosticRule = {
  id: 'HS014',
  check(ctx: DiagnosticContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const node of ctx.nodes) {
      if (node.type !== 'DomainBlock') continue;
      if (node.keyword !== 'behavior_tree') continue;
      // Behavior tree should have at least one child node
      if (!node.subBlocks || node.subBlocks.length === 0) {
        diagnostics.push({
          severity: 'warning',
          message: `Behavior tree '${node.name || 'unnamed'}' has no child nodes — add selector, sequence, or leaf nodes`,
          line: node.loc?.start.line || 0,
          column: node.loc?.start.column || 0,
          source: 'holoscript',
          code: 'HS014',
        });
      }
      if (node.subBlocks) {
        for (const sub of node.subBlocks) {
          if (!VALID_BT_NODES.has(sub.keyword)) {
            diagnostics.push({
              severity: 'warning',
              message: `Unknown behavior tree node type '${sub.keyword}' in '${node.name || 'unnamed'}'`,
              line: node.loc?.start.line || 0,
              column: node.loc?.start.column || 0,
              source: 'holoscript',
              code: 'HS014',
            });
          }
        }
      }
    }
    return diagnostics;
  },
};

// ── HS015: LOD distance ordering ────────────────────────────────────────────
const lodDistanceValidation: DiagnosticRule = {
  id: 'HS015',
  check(ctx: DiagnosticContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const node of ctx.nodes) {
      if (node.type !== 'DomainBlock' || node.keyword !== 'lod') continue;
      if (!node.subBlocks || node.subBlocks.length < 2) continue;
      // Check LOD levels are in ascending distance order
      const distances = node.subBlocks
        .filter((b) => b.keyword === 'level' || b.keyword === 'lod')
        .map((b) => b.properties?.['distance'] as number | undefined)
        .filter((d): d is number => typeof d === 'number');
      for (let i = 1; i < distances.length; i++) {
        if (distances[i] <= distances[i - 1]) {
          diagnostics.push({
            severity: 'warning',
            message: `LOD levels in '${node.name || 'unnamed'}' should have ascending distances — level ${i} distance ${distances[i]} <= previous ${distances[i - 1]}`,
            line: node.loc?.start.line || 0,
            column: node.loc?.start.column || 0,
            source: 'holoscript',
            code: 'HS015',
          });
          break;
        }
      }
    }
    return diagnostics;
  },
};

// ── HS016: Audio spatialization consistency ──────────────────────────────────
const audioSpatializationValidation: DiagnosticRule = {
  id: 'HS016',
  check(ctx: DiagnosticContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const node of ctx.nodes) {
      if (node.type !== 'DomainBlock') continue;
      if (node.keyword !== 'audio_source' && node.keyword !== 'sound_emitter') continue;
      const props = node.properties || {};
      const directives = node.directives || [];
      const hasSpatialTrait = directives.some((d) => d.name === 'spatial' || d.name === 'hrtf');
      const hasHrtfProp = props['spatialization'] === 'hrtf';
      // If @hrtf trait but spatialization property says "stereo"
      if (directives.some((d) => d.name === 'hrtf') && props['spatialization'] === 'stereo') {
        diagnostics.push({
          severity: 'warning',
          message: `Audio source '${node.name || 'unnamed'}' has @hrtf trait but spatialization is set to "stereo" — these conflict`,
          line: node.loc?.start.line || 0,
          column: node.loc?.start.column || 0,
          source: 'holoscript',
          code: 'HS016',
        });
      }
      // If min_distance > max_distance
      if (typeof props['min_distance'] === 'number' && typeof props['max_distance'] === 'number') {
        if (props['min_distance'] > props['max_distance']) {
          diagnostics.push({
            severity: 'error',
            message: `Audio source '${node.name || 'unnamed'}' has min_distance (${props['min_distance']}) > max_distance (${props['max_distance']})`,
            line: node.loc?.start.line || 0,
            column: node.loc?.start.column || 0,
            source: 'holoscript',
            code: 'HS016',
          });
        }
      }
    }
    return diagnostics;
  },
};

// ── HS017: Material shader pass validation ──────────────────────────────────
const shaderPassValidation: DiagnosticRule = {
  id: 'HS017',
  check(ctx: DiagnosticContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const node of ctx.nodes) {
      if (node.type !== 'DomainBlock') continue;
      if (node.keyword !== 'shader') continue;
      if (node.subBlocks) {
        for (const sub of node.subBlocks) {
          if (sub.keyword !== 'pass') continue;
          const props = sub.properties || {};
          // Shader pass should have vertex and fragment
          if (!('vertex' in props) && !('fragment' in props) && !('compute' in props)) {
            diagnostics.push({
              severity: 'warning',
              message: `Shader pass '${sub.name || 'unnamed'}' in '${node.name || 'unnamed'}' has no vertex, fragment, or compute shader defined`,
              line: node.loc?.start.line || 0,
              column: node.loc?.start.column || 0,
              source: 'holoscript',
              code: 'HS017',
            });
          }
        }
      }
    }
    return diagnostics;
  },
};

// ── HS018: Input binding validation ─────────────────────────────────────────
const KNOWN_INPUT_BINDINGS = new Set([
  'left_stick',
  'right_stick',
  'button_a',
  'button_b',
  'button_x',
  'button_y',
  'trigger_left',
  'trigger_right',
  'grip_left',
  'grip_right',
  'dpad_up',
  'dpad_down',
  'dpad_left',
  'dpad_right',
  'button_menu',
  'button_start',
  'button_select',
  'thumbstick_left',
  'thumbstick_right',
  'mouse_left',
  'mouse_right',
  'mouse_middle',
  'keyboard',
  'touch',
  'gaze',
]);

const inputBindingValidation: DiagnosticRule = {
  id: 'HS018',
  check(ctx: DiagnosticContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const node of ctx.nodes) {
      if (node.type !== 'DomainBlock') continue;
      if (node.keyword !== 'input' && node.keyword !== 'controller_map') continue;
      const props = node.properties || {};
      for (const [key, val] of Object.entries(props)) {
        if (typeof val === 'string' && !KNOWN_INPUT_BINDINGS.has(val)) {
          diagnostics.push({
            severity: 'info',
            message: `Input binding '${val}' for '${key}' in '${node.name || 'unnamed'}' is not a standard binding — ensure platform support`,
            line: node.loc?.start.line || 0,
            column: node.loc?.start.column || 0,
            source: 'holoscript',
            code: 'HS018',
          });
        }
      }
    }
    return diagnostics;
  },
};

// =============================================================================
// DIAGNOSTIC PROVIDER
// =============================================================================

export class DiagnosticProvider {
  private rules: DiagnosticRule[] = [
    // Core rules (HS001-HS005)
    unknownDirectiveRule,
    emptyChildrenWarning,
    deprecatedDirectiveHint,
    domainBlockValidation,
    materialTextureHint,
    // v4.2 expanded rules (HS006-HS018)
    colliderShapeValidation,
    numericRangeValidation,
    forceFieldValidation,
    jointValidation,
    particleSystemValidation,
    postProcessingValidation,
    weatherValidation,
    proceduralValidation,
    behaviorTreeValidation,
    lodDistanceValidation,
    audioSpatializationValidation,
    shaderPassValidation,
    inputBindingValidation,
  ];

  /** Add a custom diagnostic rule. */
  addRule(rule: DiagnosticRule): void {
    this.rules.push(rule);
  }

  /** Run all rules against the context. */
  diagnose(context: DiagnosticContext): Diagnostic[] {
    const all: Diagnostic[] = [];
    for (const rule of this.rules) {
      all.push(...rule.check(context));
    }
    all.sort((a, b) => a.line - b.line || a.column - b.column);
    return all;
  }

  /** Get count of registered rules. */
  get ruleCount(): number {
    return this.rules.length;
  }
}
