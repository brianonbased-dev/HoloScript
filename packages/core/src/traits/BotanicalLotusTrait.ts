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
  /** Waxy retroreflective sheen on the petal surface (0-1). */
  sheen: number;
  /** Sheen lobe roughness (0-1). */
  sheen_roughness: number;
  /** Sheen tint (6-digit hex). */
  sheen_color: string;
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

export interface BotanicalLotusPlacement {
  surface_anchor_id?: string;
  surface_normal?: readonly [number, number, number];
  world_position?: readonly [number, number, number];
}

export interface BotanicalLotusLighting {
  reference_id?: string;
  estimated_lux?: number;
  color_temperature_k?: number;
  dominant_direction?: readonly [number, number, number];
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
    sheen: number;
    sheen_roughness: number;
    sheen_color: string;
  };
  colors: BotanicalLotusColors;
  stamen_filament_count: number;
  seed_pod_dot_pattern: string;
  reference_anchor_ids: readonly string[];
  renderer_requires: readonly string[];
  /** HoloMap surface anchor this lotus is bound to, if any */
  surface_anchor_id?: string;
  /** HoloMap lighting reference identifier, if any */
  lighting_reference?: string;
}

export interface BotanicalLotusValidationResult {
  ok: boolean;
  errors: readonly string[];
  config: BotanicalLotusConfig;
}

interface BotanicalLotusState {
  config: BotanicalLotusConfig;
  profile: BotanicalLotusRenderProfile;
  placement?: BotanicalLotusPlacement;
  lighting?: BotanicalLotusLighting;
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
    sheen: 0.5,
    sheen_roughness: 0.42,
    sheen_color: '#ffe8f2',
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
  addRangeError(errors, 'material.sheen', material.sheen, 0, 1);
  addRangeError(errors, 'material.sheen_roughness', material.sheen_roughness, 0, 1);
  if (!HEX_COLOR_PATTERN.test(material.sheen_color)) {
    errors.push('material.sheen_color must be a 6-digit hex color');
  }
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
  input: BotanicalLotusConfigInput = {},
  placement?: BotanicalLotusPlacement,
  lighting?: BotanicalLotusLighting
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
      sheen: config.material.sheen,
      sheen_roughness: config.material.sheen_roughness,
      sheen_color: config.material.sheen_color,
    },
    colors: config.colors,
    stamen_filament_count: config.geometry.stamen_filament_count,
    seed_pod_dot_pattern: config.geometry.seed_pod_dot_pattern,
    reference_anchor_ids: config.reference_anchors.map((anchor) => anchor.id),
    renderer_requires: config.renderer.requires,
    surface_anchor_id: placement?.surface_anchor_id,
    lighting_reference: lighting?.reference_id,
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

    if (event.type === 'botanical_lotus_reference_anchored') {
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
      state.profile = createBotanicalLotusRenderProfile(updatedConfig, state.placement, state.lighting);

      context.emit?.('botanical_lotus_reference_updated', {
        node,
        anchorId,
        anchorStatus: state.profile.anchor_status,
        walletSigned: state.profile.wallet_signed,
        referenceAnchorIds: state.profile.reference_anchor_ids,
      });
      return;
    }

    // HoloMap surface anchor placement
    if (event.type === 'holomap:surface_anchor_placed') {
      const payload = event.payload ?? {};
      const surfaceAnchorId = typeof payload.surfaceAnchorId === 'string' ? payload.surfaceAnchorId : undefined;
      const surfaceNormal = Array.isArray(payload.surfaceNormal) ? payload.surfaceNormal as [number, number, number] : undefined;
      const worldPosition = Array.isArray(payload.worldPosition) ? payload.worldPosition as [number, number, number] : undefined;
      if (!surfaceAnchorId) return;

      state.placement = {
        surface_anchor_id: surfaceAnchorId,
        surface_normal: surfaceNormal,
        world_position: worldPosition,
      };
      state.profile = createBotanicalLotusRenderProfile(state.config, state.placement, state.lighting);

      context.emit?.('botanical_lotus_surface_bound', {
        node,
        surfaceAnchorId,
        surfaceNormal,
        worldPosition,
      });
      return;
    }

    // HoloMap lighting update
    if (event.type === 'holomap:lighting_update') {
      const payload = event.payload ?? {};
      const referenceId = typeof payload.referenceId === 'string' ? payload.referenceId : undefined;
      const estimatedLux = typeof payload.estimatedLux === 'number' && Number.isFinite(payload.estimatedLux) ? payload.estimatedLux : undefined;
      const colorTemperatureK = typeof payload.colorTemperatureK === 'number' && Number.isFinite(payload.colorTemperatureK) ? payload.colorTemperatureK : undefined;
      const dominantDirection = Array.isArray(payload.dominantDirection) ? payload.dominantDirection as [number, number, number] : undefined;
      if (!referenceId) return;

      state.lighting = {
        reference_id: referenceId,
        estimated_lux: estimatedLux,
        color_temperature_k: colorTemperatureK,
        dominant_direction: dominantDirection,
      };
      state.profile = createBotanicalLotusRenderProfile(state.config, state.placement, state.lighting);

      context.emit?.('botanical_lotus_lighting_updated', {
        node,
        referenceId,
        estimatedLux,
        colorTemperatureK,
        dominantDirection,
      });
      return;
    }

    // HoloMap anchor state change (drift / reanchor)
    if (event.type === 'holomap:anchor_state_changed') {
      const payload = event.payload ?? {};
      const anchorFrameIndex = typeof payload.anchorFrameIndex === 'number' ? payload.anchorFrameIndex : undefined;
      if (state.placement?.surface_anchor_id && anchorFrameIndex !== undefined) {
        context.emit?.('botanical_lotus_anchor_drift', {
          node,
          surfaceAnchorId: state.placement.surface_anchor_id,
          anchorFrameIndex,
        });
      }
      return;
    }
  },
};

// =============================================================================
// SCENE COMPILER — .holo composition -> deterministic lotus scene
// =============================================================================
// The papers-program "proof flower" is AUTHORED as a HoloScript composition
// (examples/lotus-flower/garden.seedable.holo) and COMPILED to a render scene —
// it is not hand-authored in a renderer (F.099 show-don't-reference; the flower
// is the I.007 genesis proof, so it must itself be compiled HoloScript). This
// section is the native scene compiler: it consumes the parsed .holo objects +
// the botanical render profile and emits a deterministic LotusScene (petal
// placement, per-paper bloom, material, plus the GLSL petal render-kernel).
// Renderers (R3F today) consume LotusScene; they do NOT own the flower's
// structure or look. Pure function of (composition, profile); seed 0x0000DEAD.

export type LotusBloomState = 'sealed' | 'budding' | 'blooming' | 'full' | 'wilted';

/** Minimal duck-typed shape of a parseHolo() composition object (decoupled from the parser). */
export interface LotusCompositionObject {
  name?: string;
  properties?: ReadonlyArray<{ key: string; value: unknown }>;
  traits?: ReadonlyArray<{ name: string; config?: Record<string, unknown> }>;
}

export interface LotusSceneRing {
  ring: 1 | 2 | 3;
  count: number;
  radius: number;
  length: number;
  width: number;
  cup: number;
  gravity_sag: number;
  height: number;
}

export interface LotusScenePetal {
  /** Global continuous-spiral index (0..N-1), = composition declaration order. */
  index: number;
  ring: 1 | 2 | 3;
  ringIndex: number;
  /** Golden-angle spiral placement (radians) = index * golden_angle. */
  angle: number;
  radius: number;
  length: number;
  width: number;
  cup: number;
  gravitySag: number;
  height: number;
  /** Petal render color (botanical pink palette, by ring). */
  color: string;
  /** Per-paper bloom state, derived from the .holo @glowing encoding. */
  bloom: LotusBloomState;
  /** Short "P{ring}.{ringIndex}" label. */
  label: string;
  /** Full composition object name (paper / venue). */
  title: string;
}

export interface LotusScene {
  seed: string;
  golden_angle_deg: number;
  growth_seconds: number;
  rings: LotusSceneRing[];
  petals: LotusScenePetal[];
  material: BotanicalLotusRenderProfile['pbr_uniforms'];
  colors: BotanicalLotusColors;
  stamen_filament_count: number;
  seed_pod_dot_pattern: string;
}

export const LOTUS_GOLDEN_ANGLE_DEG = 137.50776;
export const LOTUS_GROWTH_SECONDS = 12.5;
export const LOTUS_GENESIS_SEED_PLACEHOLDER = '0x0000DEAD';

/** Per-ring presentation scaling layered on top of the profile rings (renderer proportions). */
export const LOTUS_RING_SCALING: Record<
  1 | 2 | 3,
  { radius: number; length: number; width: number; height: number }
> = {
  1: { radius: 1.25, length: 0.98, width: 1.65, height: 1.12 },
  2: { radius: 1.25, length: 0.94, width: 1.48, height: 0.98 },
  3: { radius: 1.25, length: 0.82, width: 1.35, height: 0.78 },
};

/** Outer-ring petal tone (sits between profile petal_mid and petal_rim). */
export const LOTUS_OUTER_PETAL_COLOR = '#d94b9a';

const LOTUS_PETAL_NAME_RE = /^Petal\s+P([123])\.(\d+)/;

/**
 * Map a petal's @glowing encoding in the .holo to a bloom state. The composition
 * encodes per-paper progress as glow intensity (+ pulse for the featured/full
 * petal): >=1.0 with pulse = full, >=0.7 = blooming, >=0.3 = budding, else sealed.
 */
export function deriveLotusBloomFromGlow(intensity: number, pulse: boolean): LotusBloomState {
  if (intensity >= 1.0 && pulse) return 'full';
  if (intensity >= 0.7) return 'blooming';
  if (intensity >= 0.3) return 'budding';
  return 'sealed';
}

/** Petal render color by ring (root petal uses the lightest base tone). */
export function lotusPetalRenderColor(
  ring: 1 | 2 | 3,
  isRoot: boolean,
  colors: BotanicalLotusColors
): string {
  if (isRoot) return colors.petal_base;
  if (ring === 1) return colors.petal_inner;
  if (ring === 2) return colors.petal_mid;
  return LOTUS_OUTER_PETAL_COLOR;
}

function lotusObjectTraitConfig(
  obj: LotusCompositionObject,
  name: string
): Record<string, unknown> | undefined {
  return obj.traits?.find((t) => t.name === name)?.config;
}

/**
 * Compile a parsed .holo composition's objects + the botanical render profile
 * into a deterministic LotusScene. Petal objects are matched by name
 * ("Petal P{ring}.{i}: ..."); declaration order is the continuous golden-angle
 * spiral index. Geometry/material come from the trait profile; per-paper bloom
 * comes from each petal's @glowing intensity. Deterministic and pure.
 */
export function buildLotusSceneFromComposition(
  objects: ReadonlyArray<LotusCompositionObject>,
  profile: BotanicalLotusRenderProfile = createBotanicalLotusRenderProfile(),
  options: { seed?: string } = {}
): LotusScene {
  const ringProfile = new Map<1 | 2 | 3, BotanicalLotusRenderPetalRing>();
  profile.petal_rings.forEach((r, i) => ringProfile.set((i + 1) as 1 | 2 | 3, r));
  const lastRing = profile.petal_rings[profile.petal_rings.length - 1];
  const goldenAngle = (LOTUS_GOLDEN_ANGLE_DEG * Math.PI) / 180;

  const petalObjs = objects.filter((o) => LOTUS_PETAL_NAME_RE.test(String(o.name ?? '')));
  const ringCounters: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };

  const petals: LotusScenePetal[] = petalObjs.map((obj, index) => {
    const match = LOTUS_PETAL_NAME_RE.exec(String(obj.name));
    const ring = Number(match?.[1] ?? 3) as 1 | 2 | 3;
    const ringIndex = ringCounters[ring]++;
    const glow = lotusObjectTraitConfig(obj, 'glowing') ?? {};
    const intensity = typeof glow.intensity === 'number' ? glow.intensity : 0.1;
    const pulse = glow.pulse === true;
    const isRoot = index === 0;
    const bloom: LotusBloomState = isRoot ? 'full' : deriveLotusBloomFromGlow(intensity, pulse);
    const base = ringProfile.get(ring) ?? lastRing;
    const scale = LOTUS_RING_SCALING[ring];
    return {
      index,
      ring,
      ringIndex,
      angle: index * goldenAngle,
      radius: base.radius * scale.radius,
      length: base.length * scale.length,
      width: base.width * scale.width,
      cup: base.cup,
      gravitySag: base.gravity_sag,
      height: scale.height,
      color: lotusPetalRenderColor(ring, isRoot, profile.colors),
      bloom,
      label: `P${ring}.${ringIndex}`,
      title: String(obj.name ?? `Petal P${ring}.${ringIndex}`),
    };
  });

  const rings: LotusSceneRing[] = ([1, 2, 3] as const).map((ring) => {
    const base = ringProfile.get(ring) ?? lastRing;
    const scale = LOTUS_RING_SCALING[ring];
    return {
      ring,
      count: base.count,
      radius: base.radius * scale.radius,
      length: base.length * scale.length,
      width: base.width * scale.width,
      cup: base.cup,
      gravity_sag: base.gravity_sag,
      height: scale.height,
    };
  });

  return {
    seed: options.seed ?? LOTUS_GENESIS_SEED_PLACEHOLDER,
    golden_angle_deg: LOTUS_GOLDEN_ANGLE_DEG,
    growth_seconds: LOTUS_GROWTH_SECONDS,
    rings,
    petals,
    material: profile.pbr_uniforms,
    colors: profile.colors,
    stamen_filament_count: profile.stamen_filament_count,
    seed_pod_dot_pattern: profile.seed_pod_dot_pattern,
  };
}

// =============================================================================
// PETAL RENDER-KERNEL — GLSL chunks (the trait owns the photoreal "look")
// =============================================================================
// The petal vein + subsurface-scattering shader is part of the botanical_lotus
// trait, not the renderer. Renderers inject these chunks into a physically-based
// material (three.js onBeforeCompile #include splice points). Pure GLSL strings:
// no three.js dependency here — the renderer wires uniforms + applies them.

export const LOTUS_PETAL_SHADER_CHUNKS = {
  /** Spliced after `#include <common>` in the vertex shader. */
  vertexHeader: `
attribute vec2 petalUv;
attribute float veinPhase;
varying vec2 vLotusPetalUv;
varying float vLotusVeinPhase;
varying vec3 vLotusWorldNormal;
varying vec3 vLotusViewDir;
`,
  /** Spliced after `#include <worldpos_vertex>`. */
  vertexWorld: `
vLotusPetalUv = petalUv;
vLotusVeinPhase = veinPhase;
vLotusWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
vLotusViewDir = normalize(cameraPosition - worldPosition.xyz);
`,
  /** Spliced after `#include <common>` in the fragment shader. */
  fragmentHeader: `
uniform vec3 uLotusBaseColor;
uniform vec3 uLotusMidColor;
uniform vec3 uLotusRimColor;
uniform vec3 uLotusShadowColor;
uniform vec3 uLotusSubsurfaceColor;
uniform float uLotusSSS;
uniform float uLotusTransmissionBase;
uniform float uLotusTransmissionEdge;
uniform float uLotusVeinIntensity;
uniform float uLotusGrowth;
uniform float uLotusBloom;
uniform float uLotusTime;
varying vec2 vLotusPetalUv;
varying float vLotusVeinPhase;
varying vec3 vLotusWorldNormal;
varying vec3 vLotusViewDir;

float lotusVeinField(vec2 uv, float phase) {
  float signedX = uv.x * 2.0 - 1.0;
  float major = pow(1.0 - abs(sin((signedX * 18.0 + uv.y * 6.0 + phase) * 3.14159265)), 20.0);
  float secondary = pow(1.0 - abs(sin((signedX * 34.0 - uv.y * 4.0 - phase * 0.7) * 3.14159265)), 32.0);
  float taper = (1.0 - smoothstep(0.82, 1.0, uv.y)) * (1.0 - abs(signedX) * 0.34);
  return clamp((major * 0.62 + secondary * 0.38) * taper, 0.0, 1.0);
}
`,
  /** Spliced after `#include <normal_fragment_maps>` — vein normal perturbation. */
  fragmentNormalInjection: `
float lotusNormalVein = lotusVeinField(vLotusPetalUv, vLotusVeinPhase);
float lotusVeinSide = sign(vLotusPetalUv.x - 0.5);
normal = normalize(normal + vec3(
  lotusNormalVein * lotusVeinSide * uLotusVeinIntensity * 1.7,
  lotusNormalVein * uLotusVeinIntensity * 0.6,
  0.0
));`,
  /** Spliced after `#include <color_fragment>` — petal profile gradient + veins. */
  fragmentColorInjection: `
float lotusEdge = abs(vLotusPetalUv.x * 2.0 - 1.0);
float lotusTip = smoothstep(0.78, 1.0, vLotusPetalUv.y);
vec3 lotusProfileColor = mix(uLotusBaseColor, uLotusMidColor, smoothstep(0.08, 0.72, vLotusPetalUv.y));
lotusProfileColor = mix(lotusProfileColor, uLotusRimColor, clamp(lotusEdge * lotusEdge * 0.42 + lotusTip * 0.35, 0.0, 0.82));
float lotusVeinColorField = lotusVeinField(vLotusPetalUv, vLotusVeinPhase);
vec3 lotusVeinColor = mix(uLotusShadowColor, uLotusRimColor, 0.58);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * lotusProfileColor, 0.62);
diffuseColor.rgb += lotusVeinColor * lotusVeinColorField * uLotusVeinIntensity * uLotusGrowth * 7.5;
diffuseColor.a *= mix(0.7, 1.0, uLotusGrowth);`,
  /** Spliced after `#include <emissivemap_fragment>` — backlit subsurface scatter. */
  fragmentEmissiveInjection: `
float lotusBacklight = pow(1.0 - abs(dot(normalize(vLotusWorldNormal), normalize(vLotusViewDir))), 2.15);
float lotusTranslucency = mix(uLotusTransmissionBase, uLotusTransmissionEdge, lotusEdge);
float lotusPulse = 0.92 + sin(uLotusTime * 0.65 + vLotusVeinPhase * 6.28318) * 0.08;
vec3 lotusScatter = uLotusSubsurfaceColor * lotusBacklight * lotusTranslucency * uLotusSSS * uLotusGrowth * lotusPulse;
totalEmissiveRadiance += lotusScatter * (0.28 + uLotusBloom * 0.72);`,
} as const;

// =============================================================================
// PROCEDURAL TEXTURE DATA (three-free, deterministic) — native surface detail
// =============================================================================
// Real normal + roughness maps are the highest-leverage realism gap, but binary
// texture assets would need provenance anchoring. Instead the botanical_lotus
// trait GENERATES them deterministically from noise. Core emits raw RGBA pixel
// data (NO three.js dependency — just a Uint8Array); the renderer wraps it in a
// DataTexture. This keeps texture synthesis a reusable, tested HoloScript core
// capability rather than renderer-local hand-code.

export interface ProceduralTextureData {
  width: number;
  height: number;
  /** RGBA8, row-major, length = width * height * 4. */
  data: Uint8Array;
}

export type BotanicalSurfacePattern = 'petal_veins' | 'leaf_radial' | 'stalk_fiber' | 'micro';

function botMix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function botHash(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1013904223)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function botValueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = botHash(ix, iy, seed);
  const b = botHash(ix + 1, iy, seed);
  const c = botHash(ix, iy + 1, seed);
  const d = botHash(ix + 1, iy + 1, seed);
  return botMix(botMix(a, b, ux), botMix(c, d, ux), uy);
}
function botFbm(x: number, y: number, seed: number, octaves = 4): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * botValueNoise(x * freq, y * freq, seed + i * 101);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** Height field in [0,1] for a botanical surface pattern; (u,v) in [0,1]. */
function botanicalSurfaceHeight(
  pattern: BotanicalSurfacePattern,
  u: number,
  v: number,
  seed: number
): number {
  const micro = botFbm(u * 26, v * 26, seed, 4);
  if (pattern === 'petal_veins') {
    // v = along the petal (base->tip), u = across the width. Central ridge +
    // lateral veins fanning toward the tip + fine micro-wrinkle.
    const sx = u * 2 - 1;
    const major = Math.pow(1 - Math.abs(Math.sin((sx * 9 + v * 3.2) * Math.PI)), 8);
    const secondary = Math.pow(1 - Math.abs(Math.sin((sx * 19 - v * 2) * Math.PI)), 16) * 0.5;
    const ridge = Math.max(0, 1 - Math.abs(sx) * 3) * (0.4 + v * 0.3);
    return micro * 0.28 + major * 0.46 + secondary * 0.2 + ridge * 0.4;
  }
  if (pattern === 'leaf_radial') {
    const cx = u * 2 - 1;
    const cy = v * 2 - 1;
    const ang = Math.atan2(cy, cx);
    const rad = Math.min(1, Math.sqrt(cx * cx + cy * cy));
    const veins = Math.pow(Math.abs(Math.sin(ang * 13.0)), 6) * (1 - rad);
    const rings = Math.pow(Math.abs(Math.sin(rad * 22.0)), 4) * 0.3;
    return micro * 0.34 + veins * 0.56 + rings;
  }
  if (pattern === 'stalk_fiber') {
    const fibers =
      Math.pow(Math.abs(Math.sin(u * Math.PI * 40)), 3) * 0.5 +
      Math.abs(Math.sin(u * Math.PI * 83)) * 0.18;
    const grain = botFbm(u * 12, v * 64, seed, 3);
    return micro * 0.2 + fibers * 0.5 + grain * 0.3;
  }
  return micro;
}

/**
 * Generate a tangent-space normal map (RGBA8) from a botanical surface height
 * field via finite differences. Deterministic from (pattern, seed). Reusable —
 * the renderer wraps the returned data in a three DataTexture.
 */
export function generateBotanicalNormalMap(opts: {
  size?: number;
  seed?: number;
  pattern: BotanicalSurfacePattern;
  strength?: number;
}): ProceduralTextureData {
  const size = opts.size ?? 256;
  const seed = (opts.seed ?? 0xdead) >>> 0;
  const strength = opts.strength ?? 1.6;
  const data = new Uint8Array(size * size * 4);
  const inv = 1 / size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x * inv;
      const v = y * inv;
      const hL = botanicalSurfaceHeight(opts.pattern, ((x - 1 + size) % size) * inv, v, seed);
      const hR = botanicalSurfaceHeight(opts.pattern, ((x + 1) % size) * inv, v, seed);
      const hD = botanicalSurfaceHeight(opts.pattern, u, ((y - 1 + size) % size) * inv, seed);
      const hU = botanicalSurfaceHeight(opts.pattern, u, ((y + 1) % size) * inv, seed);
      let nx = (hL - hR) * strength;
      let ny = (hD - hU) * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      const i = (y * size + x) * 4;
      data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((nz / len * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

/**
 * Generate a grayscale roughness map (RGBA8) from fbm noise — waxy/matte mottling
 * so surfaces aren't uniformly smooth. Deterministic. Sampled via .g by three.
 */
export function generateBotanicalRoughnessMap(opts: {
  size?: number;
  seed?: number;
  base?: number;
  variance?: number;
  scale?: number;
}): ProceduralTextureData {
  const size = opts.size ?? 256;
  const seed = (opts.seed ?? 0xb007) >>> 0;
  const base = opts.base ?? 0.6;
  const variance = opts.variance ?? 0.3;
  const scale = opts.scale ?? 10;
  const data = new Uint8Array(size * size * 4);
  const inv = 1 / size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const r = Math.min(
        1,
        Math.max(0, base + (botFbm(x * inv * scale, y * inv * scale, seed, 4) - 0.5) * 2 * variance)
      );
      const g = Math.round(r * 255);
      const i = (y * size + x) * 4;
      data[i] = g;
      data[i + 1] = g;
      data[i + 2] = g;
      data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}
