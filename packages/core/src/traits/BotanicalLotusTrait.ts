/**
 * Botanical Lotus Trait
 *
 * Grounded visual-material contract for a realistic lotus asset. This trait
 * carries the photo-derived material, color, geometry, and reference-anchor
 * metadata that renderer surfaces consume when compiling a lotus into 3D/XR.
 *
 * The key rule is provenance first: pending conversation references are valid
 * as staging anchors, but renderers can tell whether a flower is merely
 * reference-guided, content-hashed, or wallet-signed.
 *
 * Determinism:
 *   - Pure mapping from config -> render profile.
 *   - No Math.random, no wall-clock, no hardware-specific branching.
 *   - Reference anchoring arrives through explicit events.
 *
 * Trait name: botanical_lotus
 * Category: botanical / provenance-grounded visual asset
 *
 * @version 0.1.0
 * @cites I.007, W.137, Dumb Glass P3-CENTER, CAEL Attention P1-0c
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type BotanicalLotusAnchorStatus =
  | 'pending_media_ingest'
  | 'hashed'
  | 'wallet_signed';

export type BotanicalLotusAnchorRole =
  | 'material'
  | 'silhouette'
  | 'stamen_detail'
  | 'leaf_context'
  | 'lighting_reference'
  | (string & {});

export interface BotanicalLotusReferenceAnchor {
  id: string;
  label: string;
  uri: string;
  role: BotanicalLotusAnchorRole;
  status: BotanicalLotusAnchorStatus;
  content_hash?: string;
  wallet_signature?: string;
  mime_type?: string;
  width?: number;
  height?: number;
}

export interface BotanicalLotusMaterial {
  subsurface_scattering: number;
  subsurface_radius_rgb: readonly [number, number, number];
  petal_translucency_base: number;
  petal_translucency_edge: number;
  roughness: number;
  ior: number;
  vein_normal_intensity: number;
  edge_curl_intensity: number;
  gravity_sag_outer: number;
}

export interface BotanicalLotusColors {
  petal_base: string;
  petal_mid: string;
  petal_inner: string;
  petal_rim: string;
  petal_shadow: string;
  seed_pod: string;
  seed_pod_rim: string;
  stamen: string;
  stamen_tip: string;
  leaf: string;
  leaf_dark: string;
  water: string;
}

export interface BotanicalLotusPetalRing {
  name: 'inner' | 'mid' | 'outer' | (string & {});
  count: number;
  cup: number;
  gravity_sag: number;
}

export interface BotanicalLotusGeometry {
  petal_rings: readonly BotanicalLotusPetalRing[];
  petal_shape: string;
  stamen_filament_count: number;
  seed_pod_dot_pattern: string;
}

export interface BotanicalLotusSource {
  kind: string;
  count: number;
  content_hash_status: BotanicalLotusAnchorStatus;
  wallet_signature_status: 'pending_cael_anchor' | 'wallet_signed';
  note: string;
}

export interface BotanicalLotusRendererHints {
  requires: readonly string[];
  lod: {
    close: string;
    mid: string;
    far: string;
  };
  material_model: string;
}

export interface BotanicalLotusConfig {
  schema: 'holoscript.trait.botanical_lotus.v0';
  status: 'visual_seed' | 'content_hashed' | 'wallet_signed';
  source: BotanicalLotusSource;
  reference_anchors: readonly BotanicalLotusReferenceAnchor[];
  material: BotanicalLotusMaterial;
  colors: BotanicalLotusColors;
  geometry: BotanicalLotusGeometry;
  renderer: BotanicalLotusRendererHints;
}

export type BotanicalLotusConfigInput = Partial<
  Omit<BotanicalLotusConfig, 'source' | 'material' | 'colors' | 'geometry' | 'renderer'>
> & {
  source?: Partial<BotanicalLotusSource>;
  material?: Partial<BotanicalLotusMaterial>;
  colors?: Partial<BotanicalLotusColors>;
  geometry?: Partial<Omit<BotanicalLotusGeometry, 'petal_rings'>> & {
    petal_rings?: readonly BotanicalLotusPetalRing[];
  };
  renderer?: Partial<BotanicalLotusRendererHints>;
};

export interface BotanicalLotusRenderPetalRing {
  name: string;
  count: number;
  radius: number;
  length: number;
  width: number;
  cup: number;
  gravity_sag: number;
  pitch_degrees: number;
}

export interface BotanicalLotusRenderProfile {
  trait: 'botanical_lotus';
  anchor_status: BotanicalLotusAnchorStatus;
  wallet_signed: boolean;
  petal_count: number;
  petal_rings: readonly BotanicalLotusRenderPetalRing[];
  pbr_uniforms: {
    subsurface_scattering: number;
    subsurface_radius_rgb: readonly [number, number, number];
    transmission: number;
    thickness: number;
    roughness: number;
    ior: number;
    vein_normal_intensity: number;
  };
  colors: BotanicalLotusColors;
  stamen_filament_count: number;
  seed_pod_dot_pattern: string;
  reference_anchor_ids: readonly string[];
  renderer_requires: readonly string[];
}

export interface BotanicalLotusValidationResult {
  ok: boolean;
  errors: readonly string[];
  config: BotanicalLotusConfig;
}

interface BotanicalLotusState {
  config: BotanicalLotusConfig;
  profile: BotanicalLotusRenderProfile;
}

// =============================================================================
// DEFAULT PHOTO-GROUNDED CONTRACT
// =============================================================================

export const DEFAULT_BOTANICAL_LOTUS_CONFIG: BotanicalLotusConfig = {
  schema: 'holoscript.trait.botanical_lotus.v0',
  status: 'visual_seed',
  source: {
    kind: 'conversation_reference_images',
    count: 3,
    content_hash_status: 'pending_media_ingest',
    wallet_signature_status: 'pending_cael_anchor',
    note:
      'Derived from three pink lotus reference images provided in-thread; raw media ingest is pending.',
  },
  reference_anchors: [
    {
      id: 'lotus-reference-2026-05-06-01',
      label: 'open pink lotus close-up',
      uri: 'conversation://2026-05-06/lotus-reference-01',
      role: 'material',
      status: 'pending_media_ingest',
    },
    {
      id: 'lotus-reference-2026-05-06-02',
      label: 'upright pink lotus silhouette',
      uri: 'conversation://2026-05-06/lotus-reference-02',
      role: 'silhouette',
      status: 'pending_media_ingest',
    },
    {
      id: 'lotus-reference-2026-05-06-03',
      label: 'pink lotus with leaves and water context',
      uri: 'conversation://2026-05-06/lotus-reference-03',
      role: 'leaf_context',
      status: 'pending_media_ingest',
    },
  ],
  material: {
    subsurface_scattering: 0.74,
    subsurface_radius_rgb: [0.9, 0.32, 0.72],
    petal_translucency_base: 0.68,
    petal_translucency_edge: 0.36,
    roughness: 0.72,
    ior: 1.36,
    vein_normal_intensity: 0.045,
    edge_curl_intensity: 0.58,
    gravity_sag_outer: 0.3,
  },
  colors: {
    petal_base: '#fff1f6',
    petal_mid: '#f47ab7',
    petal_inner: '#ff9ecf',
    petal_rim: '#c42a86',
    petal_shadow: '#84205f',
    seed_pod: '#f4d74a',
    seed_pod_rim: '#b7c66b',
    stamen: '#f59e0b',
    stamen_tip: '#fff4bd',
    leaf: '#235f4f',
    leaf_dark: '#102f28',
    water: '#07140f',
  },
  geometry: {
    petal_rings: [
      { name: 'inner', count: 8, cup: 0.86, gravity_sag: 0.02 },
      { name: 'mid', count: 13, cup: 0.5, gravity_sag: 0.12 },
      { name: 'outer', count: 21, cup: 0.24, gravity_sag: 0.3 },
    ],
    petal_shape: 'broad_elliptic_pointed_tip_with_center_ridge',
    stamen_filament_count: 58,
    seed_pod_dot_pattern: '1_center_7_12_18_radial',
  },
  renderer: {
    requires: ['sss_render', 'instanced_filaments', 'water_surface'],
    lod: {
      close: 'full_filaments',
      mid: 'simplified_filaments',
      far: 'petal_billboard',
    },
    material_model: 'thin_tissue_mesh_physical_material',
  },
};

const SHA256_HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

const RING_RENDER_DEFAULTS: Record<
  string,
  Pick<BotanicalLotusRenderPetalRing, 'radius' | 'length' | 'width' | 'pitch_degrees'>
> = {
  inner: { radius: 0.32, length: 0.82, width: 0.34, pitch_degrees: 74 },
  mid: { radius: 0.58, length: 1.15, width: 0.46, pitch_degrees: 42 },
  outer: { radius: 0.92, length: 1.52, width: 0.58, pitch_degrees: 18 },
};

// =============================================================================
// PURE HELPERS
// =============================================================================

function cloneDefaultConfig(): BotanicalLotusConfig {
  const d = DEFAULT_BOTANICAL_LOTUS_CONFIG;
  return {
    ...d,
    source: { ...d.source },
    reference_anchors: d.reference_anchors.map((a) => ({ ...a })),
    material: {
      ...d.material,
      subsurface_radius_rgb: [...d.material.subsurface_radius_rgb] as [number, number, number],
    },
    colors: { ...d.colors },
    geometry: {
      ...d.geometry,
      petal_rings: d.geometry.petal_rings.map((r) => ({ ...r })),
    },
    renderer: {
      ...d.renderer,
      requires: [...d.renderer.requires],
      lod: { ...d.renderer.lod },
    },
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function addRangeError(
  errors: string[],
  label: string,
  value: unknown,
  min: number,
  max: number
): void {
  if (!isFiniteNumber(value) || value < min || value > max) {
    errors.push(`${label} must be a finite number in [${min}, ${max}]`);
  }
}

function validateHexColors(errors: string[], colors: BotanicalLotusColors): void {
  for (const [key, value] of Object.entries(colors)) {
    if (!HEX_COLOR_PATTERN.test(value)) {
      errors.push(`colors.${key} must be a 6-digit hex color`);
    }
  }
}

function validateReferenceAnchor(
  errors: string[],
  anchor: BotanicalLotusReferenceAnchor,
  index: number
): void {
  const prefix = `reference_anchors[${index}]`;
  if (!anchor.id || typeof anchor.id !== 'string') {
    errors.push(`${prefix}.id is required`);
  }
  if (!anchor.uri || typeof anchor.uri !== 'string') {
    errors.push(`${prefix}.uri is required`);
  }
  if (
    anchor.status !== 'pending_media_ingest' &&
    anchor.status !== 'hashed' &&
    anchor.status !== 'wallet_signed'
  ) {
    errors.push(`${prefix}.status must be pending_media_ingest, hashed, or wallet_signed`);
  }
  if (anchor.status !== 'pending_media_ingest') {
    if (!anchor.content_hash || !SHA256_HASH_PATTERN.test(anchor.content_hash)) {
      errors.push(`${prefix}.content_hash must be sha256:<64 lowercase hex chars>`);
    }
  }
  if (anchor.status === 'wallet_signed' && !anchor.wallet_signature) {
    errors.push(`${prefix}.wallet_signature is required when status is wallet_signed`);
  }
  if (anchor.width !== undefined && (!Number.isInteger(anchor.width) || anchor.width <= 0)) {
    errors.push(`${prefix}.width must be a positive integer when present`);
  }
  if (anchor.height !== undefined && (!Number.isInteger(anchor.height) || anchor.height <= 0)) {
    errors.push(`${prefix}.height must be a positive integer when present`);
  }
}

export function normalizeBotanicalLotusConfig(
  input: BotanicalLotusConfigInput = {}
): BotanicalLotusConfig {
  const d = cloneDefaultConfig();
  const inputGeometry = input.geometry ?? {};
  const inputRenderer = input.renderer ?? {};
  const petalRings = Array.isArray(inputGeometry.petal_rings)
    ? inputGeometry.petal_rings.map((r) => ({ ...r }))
    : d.geometry.petal_rings.map((r) => ({ ...r }));

  return {
    schema: input.schema ?? d.schema,
    status: input.status ?? d.status,
    source: {
      ...d.source,
      ...(input.source ?? {}),
    },
    reference_anchors: Array.isArray(input.reference_anchors)
      ? input.reference_anchors.map((a) => ({ ...a }))
      : d.reference_anchors,
    material: {
      ...d.material,
      ...(input.material ?? {}),
      subsurface_radius_rgb: [
        ...(input.material?.subsurface_radius_rgb ?? d.material.subsurface_radius_rgb),
      ] as [number, number, number],
    },
    colors: {
      ...d.colors,
      ...(input.colors ?? {}),
    },
    geometry: {
      ...d.geometry,
      ...inputGeometry,
      petal_rings: petalRings,
    },
    renderer: {
      ...d.renderer,
      ...inputRenderer,
      requires: [...(inputRenderer.requires ?? d.renderer.requires)],
      lod: {
        ...d.renderer.lod,
        ...(inputRenderer.lod ?? {}),
      },
    },
  };
}

export function validateBotanicalLotusConfig(
  input: BotanicalLotusConfigInput = {}
): BotanicalLotusValidationResult {
  const config = normalizeBotanicalLotusConfig(input);
  const errors: string[] = [];
  const { material, geometry } = config;

  if (config.schema !== 'holoscript.trait.botanical_lotus.v0') {
    errors.push('schema must be holoscript.trait.botanical_lotus.v0');
  }
  if (
    config.status !== 'visual_seed' &&
    config.status !== 'content_hashed' &&
    config.status !== 'wallet_signed'
  ) {
    errors.push('status must be visual_seed, content_hashed, or wallet_signed');
  }
  if (config.reference_anchors.length === 0) {
    errors.push('reference_anchors must include at least one anchor');
  }
  config.reference_anchors.forEach((anchor, index) =>
    validateReferenceAnchor(errors, anchor, index)
  );

  addRangeError(errors, 'material.subsurface_scattering', material.subsurface_scattering, 0, 1);
  if (material.subsurface_radius_rgb.length !== 3) {
    errors.push('material.subsurface_radius_rgb must contain exactly three values');
  }
  material.subsurface_radius_rgb.forEach((value, index) =>
    addRangeError(errors, `material.subsurface_radius_rgb[${index}]`, value, 0, 2)
  );
  addRangeError(
    errors,
    'material.petal_translucency_base',
    material.petal_translucency_base,
    0,
    1
  );
  addRangeError(
    errors,
    'material.petal_translucency_edge',
    material.petal_translucency_edge,
    0,
    1
  );
  addRangeError(errors, 'material.roughness', material.roughness, 0, 1);
  addRangeError(errors, 'material.ior', material.ior, 1, 2.5);
  addRangeError(
    errors,
    'material.vein_normal_intensity',
    material.vein_normal_intensity,
    0,
    0.25
  );
  addRangeError(errors, 'material.edge_curl_intensity', material.edge_curl_intensity, 0, 1);
  addRangeError(errors, 'material.gravity_sag_outer', material.gravity_sag_outer, 0, 1);
  validateHexColors(errors, config.colors);

  if (geometry.petal_rings.length === 0) {
    errors.push('geometry.petal_rings must include at least one ring');
  }
  geometry.petal_rings.forEach((ring, index) => {
    if (!ring.name) {
      errors.push(`geometry.petal_rings[${index}].name is required`);
    }
    if (!Number.isInteger(ring.count) || ring.count <= 0) {
      errors.push(`geometry.petal_rings[${index}].count must be a positive integer`);
    }
    addRangeError(errors, `geometry.petal_rings[${index}].cup`, ring.cup, 0, 1);
    addRangeError(
      errors,
      `geometry.petal_rings[${index}].gravity_sag`,
      ring.gravity_sag,
      0,
      1
    );
  });
  if (!Number.isInteger(geometry.stamen_filament_count) || geometry.stamen_filament_count <= 0) {
    errors.push('geometry.stamen_filament_count must be a positive integer');
  }
  if (config.renderer.requires.length === 0) {
    errors.push('renderer.requires must include at least one render capability');
  }

  return {
    ok: errors.length === 0,
    errors,
    config,
  };
}

export function assertBotanicalLotusConfig(
  input: BotanicalLotusConfigInput = {}
): BotanicalLotusConfig {
  const result = validateBotanicalLotusConfig(input);
  if (!result.ok) {
    throw new Error(`Invalid botanical_lotus config: ${result.errors.join('; ')}`);
  }
  return result.config;
}

export function deriveBotanicalLotusAnchorStatus(
  anchors: readonly BotanicalLotusReferenceAnchor[]
): BotanicalLotusAnchorStatus {
  if (anchors.length > 0 && anchors.every((anchor) => anchor.status === 'wallet_signed')) {
    return 'wallet_signed';
  }
  if (
    anchors.length > 0 &&
    anchors.every((anchor) => anchor.status === 'hashed' || anchor.status === 'wallet_signed')
  ) {
    return 'hashed';
  }
  return 'pending_media_ingest';
}

export function getBotanicalLotusPetalCount(
  input: BotanicalLotusConfigInput = {}
): number {
  const config = normalizeBotanicalLotusConfig(input);
  return config.geometry.petal_rings.reduce((sum, ring) => sum + ring.count, 0);
}

export function createBotanicalLotusRenderProfile(
  input: BotanicalLotusConfigInput = {}
): BotanicalLotusRenderProfile {
  const config = assertBotanicalLotusConfig(input);
  const anchorStatus = deriveBotanicalLotusAnchorStatus(config.reference_anchors);
  const petalRings = config.geometry.petal_rings.map((ring, index) => {
    const base =
      RING_RENDER_DEFAULTS[ring.name] ??
      ({
        radius: 0.42 + index * 0.24,
        length: 0.82 + index * 0.2,
        width: 0.34 + index * 0.08,
        pitch_degrees: Math.max(12, 70 - index * 18),
      } satisfies Pick<
        BotanicalLotusRenderPetalRing,
        'radius' | 'length' | 'width' | 'pitch_degrees'
      >);
    return {
      name: ring.name,
      count: ring.count,
      radius: base.radius,
      length: base.length,
      width: base.width,
      cup: ring.cup,
      gravity_sag: ring.gravity_sag,
      pitch_degrees: base.pitch_degrees,
    };
  });

  return {
    trait: 'botanical_lotus',
    anchor_status: anchorStatus,
    wallet_signed: anchorStatus === 'wallet_signed',
    petal_count: petalRings.reduce((sum, ring) => sum + ring.count, 0),
    petal_rings: petalRings,
    pbr_uniforms: {
      subsurface_scattering: config.material.subsurface_scattering,
      subsurface_radius_rgb: config.material.subsurface_radius_rgb,
      transmission: config.material.petal_translucency_base,
      thickness: config.material.petal_translucency_edge,
      roughness: config.material.roughness,
      ior: config.material.ior,
      vein_normal_intensity: config.material.vein_normal_intensity,
    },
    colors: config.colors,
    stamen_filament_count: config.geometry.stamen_filament_count,
    seed_pod_dot_pattern: config.geometry.seed_pod_dot_pattern,
    reference_anchor_ids: config.reference_anchors.map((anchor) => anchor.id),
    renderer_requires: config.renderer.requires,
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export const botanicalLotusHandler: TraitHandler<BotanicalLotusConfigInput> = {
  name: 'botanical_lotus',

  defaultConfig: DEFAULT_BOTANICAL_LOTUS_CONFIG,

  validate: validateBotanicalLotusConfig,
  toRenderProfile: createBotanicalLotusRenderProfile,

  onAttach(node, config, context) {
    const normalized = assertBotanicalLotusConfig(config);
    const profile = createBotanicalLotusRenderProfile(normalized);
    const state: BotanicalLotusState = { config: normalized, profile };
    (node as unknown as Record<string, unknown>).__botanicalLotusState = state;

    const nodeId = String((node as unknown as Record<string, unknown>).id ?? 'unknown');
    context.setState?.({
      [`botanical_lotus.${nodeId}.anchor_status`]: profile.anchor_status,
      [`botanical_lotus.${nodeId}.petal_count`]: profile.petal_count,
    });
    context.emit?.('botanical_lotus_attached', {
      node,
      anchorStatus: profile.anchor_status,
      walletSigned: profile.wallet_signed,
      petalCount: profile.petal_count,
      referenceAnchorIds: profile.reference_anchor_ids,
      rendererRequires: profile.renderer_requires,
    });
  },

  onDetach(node, _config, context) {
    context.emit?.('botanical_lotus_detached', { node });
    delete (node as unknown as Record<string, unknown>).__botanicalLotusState;
  },

  onUpdate(_node, _config, _context, _delta) {
    // Rendering surfaces own per-frame petal motion, SSS uniforms, and gravity
    // sag animation. Core only carries the deterministic material contract.
  },

  onEvent(node, _config, context, event) {
    const state = (node as unknown as Record<string, unknown>).__botanicalLotusState as
      | BotanicalLotusState
      | undefined;
    if (!state) return;

    if (event.type === 'botanical_lotus_query') {
      context.emit?.('botanical_lotus_response', {
        queryId: event.queryId,
        node,
        config: state.config,
        profile: state.profile,
      });
      return;
    }

    if (event.type !== 'botanical_lotus_reference_anchored') return;

    const anchorId = String(event.anchorId ?? '');
    const contentHash = typeof event.contentHash === 'string' ? event.contentHash : undefined;
    const walletSignature =
      typeof event.walletSignature === 'string' ? event.walletSignature : undefined;
    if (!anchorId || !contentHash) return;

    const updatedAnchors = state.config.reference_anchors.map((anchor) => {
      if (anchor.id !== anchorId) return anchor;
      return {
        ...anchor,
        content_hash: contentHash,
        wallet_signature: walletSignature,
        status: walletSignature ? 'wallet_signed' : 'hashed',
      } satisfies BotanicalLotusReferenceAnchor;
    });
    const updatedConfig = assertBotanicalLotusConfig({
      ...state.config,
      status: updatedAnchors.every((anchor) => anchor.status === 'wallet_signed')
        ? 'wallet_signed'
        : 'content_hashed',
      source: {
        ...state.config.source,
        content_hash_status: deriveBotanicalLotusAnchorStatus(updatedAnchors),
        wallet_signature_status: updatedAnchors.every(
          (anchor) => anchor.status === 'wallet_signed'
        )
          ? 'wallet_signed'
          : 'pending_cael_anchor',
      },
      reference_anchors: updatedAnchors,
    });
    state.config = updatedConfig;
    state.profile = createBotanicalLotusRenderProfile(updatedConfig);

    context.emit?.('botanical_lotus_reference_updated', {
      node,
      anchorId,
      anchorStatus: state.profile.anchor_status,
      walletSigned: state.profile.wallet_signed,
      referenceAnchorIds: state.profile.reference_anchor_ids,
    });
  },
};
