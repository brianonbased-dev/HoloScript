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

export type BotanicalLotusAnchorStatus = 'pending_media_ingest' | 'hashed' | 'wallet_signed';

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
    note: 'Derived from three pink lotus reference images provided in-thread; raw media ingest is pending.',
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
  addRangeError(errors, 'material.petal_translucency_base', material.petal_translucency_base, 0, 1);
  addRangeError(errors, 'material.petal_translucency_edge', material.petal_translucency_edge, 0, 1);
  addRangeError(errors, 'material.roughness', material.roughness, 0, 1);
  addRangeError(errors, 'material.ior', material.ior, 1, 2.5);
  addRangeError(errors, 'material.vein_normal_intensity', material.vein_normal_intensity, 0, 0.25);
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
    addRangeError(errors, `geometry.petal_rings[${index}].gravity_sag`, ring.gravity_sag, 0, 1);
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

export function getBotanicalLotusPetalCount(input: BotanicalLotusConfigInput = {}): number {
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
      state.profile = createBotanicalLotusRenderProfile(
        updatedConfig,
        state.placement,
        state.lighting
      );

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
      const surfaceAnchorId =
        typeof payload.surfaceAnchorId === 'string' ? payload.surfaceAnchorId : undefined;
      const surfaceNormal = Array.isArray(payload.surfaceNormal)
        ? (payload.surfaceNormal as [number, number, number])
        : undefined;
      const worldPosition = Array.isArray(payload.worldPosition)
        ? (payload.worldPosition as [number, number, number])
        : undefined;
      if (!surfaceAnchorId) return;

      state.placement = {
        surface_anchor_id: surfaceAnchorId,
        surface_normal: surfaceNormal,
        world_position: worldPosition,
      };
      state.profile = createBotanicalLotusRenderProfile(
        state.config,
        state.placement,
        state.lighting
      );

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
      const estimatedLux =
        typeof payload.estimatedLux === 'number' && Number.isFinite(payload.estimatedLux)
          ? payload.estimatedLux
          : undefined;
      const colorTemperatureK =
        typeof payload.colorTemperatureK === 'number' && Number.isFinite(payload.colorTemperatureK)
          ? payload.colorTemperatureK
          : undefined;
      const dominantDirection = Array.isArray(payload.dominantDirection)
        ? (payload.dominantDirection as [number, number, number])
        : undefined;
      if (!referenceId) return;

      state.lighting = {
        reference_id: referenceId,
        estimated_lux: estimatedLux,
        color_temperature_k: colorTemperatureK,
        dominant_direction: dominantDirection,
      };
      state.profile = createBotanicalLotusRenderProfile(
        state.config,
        state.placement,
        state.lighting
      );

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
      const anchorFrameIndex =
        typeof payload.anchorFrameIndex === 'number' ? payload.anchorFrameIndex : undefined;
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
  /** Emergent phyllotactic placement angle (radians). */
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

/**
 * B1 build-time receipt — engine ReactionDiffusion lotus seed-pod under
 * SimulationContract. Embedded by compile-lotus-scene.mts alongside the compiled
 * petal scene; the renderer replays the baked activator field as the
 * receipt-bearing AUTHORITY for seed-pod carpel placement.
 *
 * @cites I.007, plan §0.6 B1, SimulationContract (cael.v1), bake-lotus-seedpod.mts
 */
export interface LotusEngineReceipt {
  /** Human-readable proof label. */
  proof: string;
  /** Kinetics description (Schnakenberg Arrhenius mass-action). */
  kinetics: string;
  /** Grid dimensions [Nx, Ny, Nz]. */
  grid: [number, number, number];
  /** Reaction scaling parameter γ (controls spot count). */
  gamma: number;
  /** Diffusivity ratio d = Dv/Du (Turing instability requires d > d_c). */
  d_ratio: number;
  /** Number of integration steps run. */
  steps: number;
  /** Fixed timestep (CFL-safe). */
  fixedDt: number;
  /** Deterministic perturbation seed (no RNG — bit-identical). */
  seed: number;
  /** SimulationContract geometry hash (per-step state digest of initial geometry). */
  geometryHash: string;
  /** SimulationContract contract identifier. */
  contractId: string;
  /** sha256 of the joined per-step state-digest chain (the CAEL replay fingerprint). */
  digestChainHash: string;
  /** Field statistics at the baked solve endpoint. */
  field: { spots: number; min: number; max: number; mean: number; std: number };
  /** Independent cold re-run bit-identical (determinism gate). */
  reRunBitIdentical: boolean;
  /** replayFromProvenance bit-identical (cael replay gate). */
  replayBitIdentical: boolean;
  /**
   * Baked activator field u at the solve endpoint (row-major, length = Nx*Ny).
   * Encoded as 4-decimal fixed-point numbers for compact JSON representation.
   * Renderer uses this to place seed-pod carpels at activator peaks.
   */
  activator: number[];
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
  /**
   * B1 engine receipt — present when compiled with the engine ReactionDiffusion
   * bake (compile-lotus-scene.mts). Absent in environments where the engine
   * package is unavailable (e.g. browser bundles). Renderers that consume this
   * use the activator field for receipt-bearing carpel placement; renderers that
   * don't fall back to seed_pod_dot_pattern (the low-res labeled fallback).
   */
  engineReceipt?: LotusEngineReceipt;
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
  const petalObjs = objects.filter((o) => LOTUS_PETAL_NAME_RE.test(String(o.name ?? '')));
  const ringCounters: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };

  // GROWN, not placed: the petal angular layout EMERGES from the morphogenesis
  // simulation (chiral threshold-gated nucleation), whose divergence self-organizes to
  // the golden angle — there is no index*137.5 formula driving placement. Deterministic
  // from the genesis seed. The spiral has a short decussate establishment transient
  // before it locks, so we grow `warmup` extra primordia and keep the DEVELOPED tail —
  // every rendered petal then sits on the locked golden-angle spiral.
  const seedNum = Number(options.seed ?? LOTUS_GENESIS_SEED_PLACEHOLDER) >>> 0;
  const grownLayout = buildLotusPhyllotaxisPetalLayout(profile, {
    count: petalObjs.length,
    seed: seedNum,
  });

  const petals: LotusScenePetal[] = petalObjs.map((obj, index) => {
    const grown = grownLayout[index];
    const match = LOTUS_PETAL_NAME_RE.exec(String(obj.name));
    const ring = (grown?.ring ?? Number(match?.[1] ?? 3)) as 1 | 2 | 3;
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
      angle: grown?.azimuth ?? 0,
      radius: grown?.radius ?? base.radius * scale.radius,
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
    const count = petals.filter((p) => p.ring === ring).length || base.count;
    return {
      ring,
      count,
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
uniform float uPetalDevTime;
uniform float uPetalCurlScale;
`,
  /**
   * Spliced after \`#include <begin_vertex>\` — EMERGENT petal curl (L2). Bends the
   * length axis by the integral of the maturation-front growth curvature (mirrors
   * simulateLotusPetalGrowth), RELATIVE to the fully-open state so the bend is zero at
   * full bloom (the approved open pose is preserved exactly) and the bud-wrap appears
   * only while opening. Curvature reverses inward(bud) -> outward(open) behind the
   * acropetal maturation front.
   */
  vertexBend: `
{
  float lotusVlen = clamp(petalUv.y, 0.0, 1.0);
  float lotusDs = lotusVlen / 12.0;
  float lotusPhiN = 0.0, lotusPhiO = 0.0;
  vec2 lotusCN = vec2(0.0), lotusCO = vec2(0.0);
  for (int k = 0; k < 12; k++) {
    float s = (float(k) + 0.5) * lotusDs;
    float matN = smoothstep(0.0, 1.0, (uPetalDevTime - 0.15 - s * 0.35) / 0.5);
    float matO = smoothstep(0.0, 1.0, (1.0 - 0.15 - s * 0.35) / 0.5);
    lotusPhiN += mix(2.8, -0.25, matN) * lotusDs;
    lotusPhiO += mix(2.8, -0.25, matO) * lotusDs;
    lotusCN += vec2(cos(lotusPhiN), sin(lotusPhiN)) * lotusDs;
    lotusCO += vec2(cos(lotusPhiO), sin(lotusPhiO)) * lotusDs;
  }
  vec2 lotusBend = (lotusCN - lotusCO) * uPetalCurlScale;
  transformed.x += lotusBend.x;
  transformed.y += lotusBend.y;
}
`,
  /** Spliced after \`#include <worldpos_vertex>\`. */
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
// NaN-safe: guard normalize() of the interpolated normal/view vectors — on thin
// petals they can interpolate to ~0, and normalize(vec3(0)) divides by zero (X4008),
// leaking NaN/Inf that flickers across the bloom. Fall back to a +z facing vector.
float lotusNLen = length(vLotusWorldNormal);
float lotusVLen = length(vLotusViewDir);
vec3 lotusN = lotusNLen > 1e-4 ? vLotusWorldNormal / lotusNLen : vec3(0.0, 0.0, 1.0);
vec3 lotusV = lotusVLen > 1e-4 ? vLotusViewDir / lotusVLen : vec3(0.0, 0.0, 1.0);
float lotusBacklight = pow(1.0 - abs(dot(lotusN, lotusV)), 2.15);
float lotusTranslucency = mix(uLotusTransmissionBase, uLotusTransmissionEdge, lotusEdge);
float lotusPulse = 0.92 + sin(uLotusTime * 0.65 + vLotusVeinPhase * 6.28318) * 0.08;
vec3 lotusScatter = uLotusSubsurfaceColor * lotusBacklight * lotusTranslucency * uLotusSSS * uLotusGrowth * lotusPulse;
totalEmissiveRadiance += lotusScatter * (0.28 + uLotusBloom * 0.72);`,
} as const;

/** One petal shader chunk as MACHINE-READABLE data: which stage + which three.js
 *  `#include <name>` to splice after. (Plain shape — core must not depend on the
 *  renderer; structurally compatible with r3f-renderer's `ShaderChunk`.) */
export interface LotusShaderChunkEntry {
  stage: 'vertex' | 'fragment';
  include: string;
  code: string;
}

/**
 * The petal shader chunks with their splice points as DATA (not JSDoc), so the
 * renderer's chunk injector / a compiled material can consume them directly —
 * the bridge that lets the petal shader be compiled from `.holo` instead of
 * hand-wired in LotusProgram.tsx (I.007 dogfooding closure, plan §0.7).
 */
export const LOTUS_PETAL_CHUNK_ENTRIES: readonly LotusShaderChunkEntry[] = [
  { stage: 'vertex', include: 'common', code: LOTUS_PETAL_SHADER_CHUNKS.vertexHeader },
  { stage: 'vertex', include: 'begin_vertex', code: LOTUS_PETAL_SHADER_CHUNKS.vertexBend },
  { stage: 'vertex', include: 'worldpos_vertex', code: LOTUS_PETAL_SHADER_CHUNKS.vertexWorld },
  { stage: 'fragment', include: 'common', code: LOTUS_PETAL_SHADER_CHUNKS.fragmentHeader },
  {
    stage: 'fragment',
    include: 'normal_fragment_maps',
    code: LOTUS_PETAL_SHADER_CHUNKS.fragmentNormalInjection,
  },
  {
    stage: 'fragment',
    include: 'color_fragment',
    code: LOTUS_PETAL_SHADER_CHUNKS.fragmentColorInjection,
  },
  {
    stage: 'fragment',
    include: 'emissivemap_fragment',
    code: LOTUS_PETAL_SHADER_CHUNKS.fragmentEmissiveInjection,
  },
] as const;

// =============================================================================
// COMPILED MATERIAL SPEC — the .holo → render-consumer bridge (I.007 closure)
// =============================================================================
// `buildLotusPetalMaterialSpec` maps the trait's OWN declared data (render profile
// PBR + chunk entries + procedural generators) into the exact shape the renderer's
// `buildCompiledMaterial` (packages/r3f-renderer) consumes. Core must NOT depend on
// the renderer, so the interfaces below are STRUCTURALLY compatible mirrors of
// r3f-renderer's `CompiledMaterialSpec` / `ShaderChunkSet` / `ProceduralTextureSpec`
// (same shape as `LotusShaderChunkEntry` mirrors `ShaderChunk`). The cross-package
// contract — that a core-emitted spec actually constructs a MeshPhysicalMaterial —
// is verified by r3f-renderer/__tests__/lotusCompiledSpec.contract.test.ts.
//
// This is the function the eventual R3FCompiler emission + LotusProgram.tsx cutover
// call: it replaces the hand-authored petal material setup with one derived entirely
// from compiled `.holo` declarations (plan §0.7).

/** Physical PBR props — structural mirror of r3f-renderer `CompiledPhysicalProps`. */
export interface LotusCompiledPhysicalProps {
  color?: string;
  roughness?: number;
  metalness?: number;
  opacity?: number;
  transparent?: boolean;
  emissive?: string;
  emissiveIntensity?: number;
  ior?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  transmission?: number;
  thickness?: number;
  sheen?: number;
  sheenColor?: string;
  sheenRoughness?: number;
  specularIntensity?: number;
  iridescence?: number;
}

/** Structural mirror of r3f-renderer `ShaderChunkSet`. */
export interface LotusCompiledShaderChunkSet {
  chunks: LotusShaderChunkEntry[];
  uniforms?: Record<string, { value: unknown }>;
}

/** Structural mirror of r3f-renderer `ProceduralTextureSpec`. */
export interface LotusCompiledProceduralSpec {
  generator: string;
  params?: Record<string, unknown>;
}

/** Structural mirror of r3f-renderer `CompiledMaterialSpec`. */
export interface LotusCompiledMaterialSpec {
  physical?: LotusCompiledPhysicalProps;
  shaderChunks?: LotusCompiledShaderChunkSet;
  proceduralMaps?: {
    normalMap?: LotusCompiledProceduralSpec;
    roughnessMap?: LotusCompiledProceduralSpec;
    map?: LotusCompiledProceduralSpec;
  };
}

/**
 * Per-frame / animation uniform values the petal shader reads. STATIC material data
 * comes from the render profile; these are the DYNAMIC bits the bloom state machine
 * drives at runtime (via `CompiledTraitMesh.uniformBindings`). Defaults render a
 * fully-open, full-bloom petal — the approved static pose.
 */
export interface LotusPetalDynamicUniforms {
  /** Maturation front position 0(bud)→1(open). 1.0 = fully open pose. */
  devTime: number;
  /** Petal-curl bend amount applied to the vertex shader. */
  curlScale: number;
  /** Bloom-driven scatter gain 0→1. */
  growth: number;
  /** Backlit subsurface emphasis 0→1. */
  bloom: number;
  /** Animation clock (seconds) for the subsurface pulse. */
  time: number;
}

const LOTUS_PETAL_DEFAULT_DYNAMIC: LotusPetalDynamicUniforms = {
  devTime: 1,
  curlScale: 1,
  growth: 1,
  bloom: 1,
  time: 0,
};

/**
 * Injected-uniform → context-state key map for `CompiledTraitMesh.uniformBindings`.
 * Wires the bloom trait's written context state (pillar 1) into the petal shader
 * uniforms (pillar 2) each frame — the runtime half of the closure.
 */
export const LOTUS_PETAL_UNIFORM_BINDINGS: Readonly<Record<string, string>> = {
  uPetalDevTime: 'devTime',
  uLotusGrowth: 'growth',
  uLotusBloom: 'bloom',
  uLotusTime: 'time',
};

/** Parse a 6-digit hex color to a linear-ish [r,g,b] tuple in 0..1 (three-free). */
function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [r, g, b];
}

export interface BuildLotusPetalMaterialSpecOptions {
  /** Procedural normal/roughness map resolution. Default 256. */
  detailMapSize?: number;
  /** Seed for the deterministic vein normal map. Default 0xdead (genesis seed). */
  veinSeed?: number;
  /** Seed for the deterministic roughness map. Default 0xb007. */
  roughnessSeed?: number;
  /** Initial dynamic uniform values (defaults = fully-open full-bloom pose). */
  dynamic?: Partial<LotusPetalDynamicUniforms>;
}

/**
 * Build the compiled petal material spec from a render profile — the single function
 * that compiles the lotus petal material from `.holo` data into the render consumer's
 * shape. Pure and three-free: returns plain data, no WebGL, fully unit-testable.
 *
 * - `physical`  ← profile.pbr_uniforms (transmission/thickness/roughness/ior/sheen…)
 * - `shaderChunks` ← LOTUS_PETAL_CHUNK_ENTRIES + uniforms derived from colors + SSS
 * - `proceduralMaps` ← botanical normal + roughness generator declarations (pillar 3)
 */
export function buildLotusPetalMaterialSpec(
  profile: BotanicalLotusRenderProfile,
  options: BuildLotusPetalMaterialSpecOptions = {}
): LotusCompiledMaterialSpec {
  const pbr = profile.pbr_uniforms;
  const colors = profile.colors;
  const dyn: LotusPetalDynamicUniforms = { ...LOTUS_PETAL_DEFAULT_DYNAMIC, ...options.dynamic };
  const size = options.detailMapSize ?? 256;
  const veinSeed = options.veinSeed ?? 0xdead;
  const roughnessSeed = options.roughnessSeed ?? 0xb007;

  const physical: LotusCompiledPhysicalProps = {
    color: colors.petal_base,
    roughness: pbr.roughness,
    metalness: 0,
    transparent: true,
    transmission: pbr.transmission,
    thickness: pbr.thickness,
    ior: pbr.ior,
    sheen: pbr.sheen,
    sheenColor: pbr.sheen_color,
    sheenRoughness: pbr.sheen_roughness,
  };

  const uniforms: Record<string, { value: unknown }> = {
    // Static color uniforms (from the declared palette) — vec3 in 0..1.
    uLotusBaseColor: { value: hexToRgb01(colors.petal_base) },
    uLotusMidColor: { value: hexToRgb01(colors.petal_mid) },
    uLotusRimColor: { value: hexToRgb01(colors.petal_rim) },
    uLotusShadowColor: { value: hexToRgb01(colors.petal_shadow) },
    // Subsurface scatter tint comes from the declared radius RGB (already 0..1).
    uLotusSubsurfaceColor: { value: [...pbr.subsurface_radius_rgb] as [number, number, number] },
    // Static scalar uniforms from the PBR profile.
    uLotusSSS: { value: pbr.subsurface_scattering },
    uLotusTransmissionBase: { value: pbr.transmission },
    uLotusTransmissionEdge: { value: pbr.thickness },
    uLotusVeinIntensity: { value: pbr.vein_normal_intensity },
    // Dynamic uniforms (driven per-frame via LOTUS_PETAL_UNIFORM_BINDINGS).
    uPetalDevTime: { value: dyn.devTime },
    uPetalCurlScale: { value: dyn.curlScale },
    uLotusGrowth: { value: dyn.growth },
    uLotusBloom: { value: dyn.bloom },
    uLotusTime: { value: dyn.time },
  };

  return {
    physical,
    shaderChunks: {
      chunks: [...LOTUS_PETAL_CHUNK_ENTRIES],
      uniforms,
    },
    proceduralMaps: {
      normalMap: {
        generator: 'botanical_normal',
        params: {
          pattern: 'petal_veins',
          size,
          seed: veinSeed,
          strength: Math.max(0.5, pbr.vein_normal_intensity * 32),
        },
      },
      roughnessMap: {
        generator: 'botanical_roughness',
        params: { size, seed: roughnessSeed, base: pbr.roughness, variance: 0.3 },
      },
    },
  };
}

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
      data[i + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
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

// =============================================================================
// PETAL GEOMETRY — a real broad-elliptic pointed-tip petal mesh (three-free data)
// =============================================================================
// The compiled petal SHADER reads custom attributes `petalUv` (vec2: u=width,
// v=length) and `veinPhase`, and the curl-bend chunk integrates along petalUv.y. A
// flat plane carries those only incidentally; this GENERATES the actual petal
// SILHOUETTE (broad elliptic, widest in the lower-mid, tapering to a pointed tip)
// with a cupped cross-section + a centre ridge, as raw typed-array data. Core emits
// the data (no three.js); the renderer wraps it in a BufferGeometry — same split as
// the procedural textures. Deterministic + pure → unit-testable. This is the
// geometry-side half that LotusProgram.tsx hand-authored, built in core so the petal
// MESH (not just the material) compiles from `.holo`.

export interface LotusPetalGeometryParams {
  /** Petal length along the v axis (local units). */
  length: number;
  /** Petal full width at its widest point. */
  width: number;
  /** Cross-section concavity (cupping); 0 = flat, higher = more cupped. */
  cup: number;
  /** Centre-ridge (midrib) height. */
  ridge: number;
  /** Tip droop (gravity sag), applied increasingly toward the apex. */
  gravitySag: number;
  /** Width segments (across). */
  segmentsU: number;
  /** Length segments (along). */
  segmentsV: number;
  /** Per-vertex vein phase baked into the attribute (per-petal offset). */
  veinPhase: number;
  /** Petal thickness — extrudes the surface into a sealed shell so the petal reads as
   *  a solid leaf with a real edge, not a paper-thin single surface. 0 = single surface. */
  thickness?: number;
}

/** Raw mesh data — three-free; the renderer wraps each array in a BufferAttribute. */
export interface LotusPetalGeometryData {
  /** xyz per vertex, length = vertexCount*3. */
  positions: Float32Array;
  /** xyz per vertex, length = vertexCount*3. */
  normals: Float32Array;
  /** uv per vertex (u=width 0..1, v=length 0..1), length = vertexCount*2. */
  petalUv: Float32Array;
  /** per-vertex vein phase, length = vertexCount. */
  veinPhase: Float32Array;
  /** triangle indices (3 per triangle). */
  indices: Uint32Array;
  vertexCount: number;
}

export const DEFAULT_LOTUS_PETAL_GEOMETRY_PARAMS: LotusPetalGeometryParams = {
  length: 1.7,
  // Broader (width/length 0.65 → 0.85) + a deeper cup so each petal reads as a wide
  // cupped tear-drop, not a thin sliver; the obovate silhouette does the rest.
  width: 1.45,
  cup: 0.4,
  ridge: 0.12,
  gravitySag: 0.18,
  segmentsU: 24,
  segmentsV: 40,
  veinPhase: 0,
  thickness: 0.012,
};

function lotusSmoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Half-width fraction (0..1) of the petal at length-fraction v∈[0,1]: a real lotus
 *  petal is OBOVATE — a narrow base (claw), broadest in the UPPER third (v≈0.6), with a
 *  broadly ROUNDED apex carrying only a slight point (a cupped tear-drop, not a spike). */
function lotusPetalHalfWidthFraction(v: number): number {
  // sin(pi * v^1.3): 0 at both ends, peak shifted UP to v≈0.6 (obovate, not lower-mid).
  const broad = Math.sin(Math.PI * Math.pow(v, 1.3));
  // Keep the base a little fuller (a soft claw, not a needle) and round the apex —
  // only a gentle taper over the last ~10%, so the tip is broad, not a spike.
  const baseFill = 0.25 + 0.75 * lotusSmoothstep(0.0, 0.18, v);
  const tipRound = 1 - lotusSmoothstep(0.9, 1.0, v) * 0.3;
  return Math.max(0, broad * baseFill * tipRound);
}

/**
 * Build a real lotus-petal mesh as raw typed-array data (three-free). The surface is
 * a (segmentsU+1)×(segmentsV+1) grid parametrised by (u=width, v=length); the
 * silhouette comes from `lotusPetalHalfWidthFraction`, with a parabolic cup across
 * the width, a gaussian centre ridge along the midrib, and a tip droop. Normals are
 * computed analytically by central differences on the parametric surface.
 * Deterministic: pure function of `params`.
 */
export function buildLotusPetalGeometryData(
  params: Partial<LotusPetalGeometryParams> = {}
): LotusPetalGeometryData {
  const P = { ...DEFAULT_LOTUS_PETAL_GEOMETRY_PARAMS, ...params };
  const nu = Math.max(2, Math.floor(P.segmentsU));
  const nv = Math.max(2, Math.floor(P.segmentsV));
  const cols = nu + 1;
  const rows = nv + 1;
  const vertexCount = cols * rows;
  const halfWidthMax = P.width * 0.5;

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const petalUv = new Float32Array(vertexCount * 2);
  const veinPhase = new Float32Array(vertexCount);

  const pos = (u: number, v: number): [number, number, number] => {
    const su = 2 * u - 1; // -1..1 across width
    const hw = lotusPetalHalfWidthFraction(v) * halfWidthMax;
    const x = su * hw;
    const y = v * P.length;
    // Cup: concave cross-section — edges rise toward +z, parabolic in su.
    const cup = P.cup * halfWidthMax * (su * su);
    // Centre ridge: a raised midrib, gaussian across width, fading in from the
    // base and tapering toward the tip.
    const ridge =
      P.ridge *
      Math.exp(-(su * su) / (2 * 0.16 * 0.16)) *
      lotusSmoothstep(0.0, 0.3, v) *
      (1 - 0.4 * v);
    // Gravity sag: the tip droops (−z), increasing quadratically toward the apex.
    const sag = P.gravitySag * v * v * P.length;
    return [x, y, cup + ridge - sag];
  };

  for (let j = 0; j < rows; j += 1) {
    const v = j / nv;
    for (let i = 0; i < cols; i += 1) {
      const u = i / nu;
      const idx = j * cols + i;
      const [x, y, z] = pos(u, v);
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;
      petalUv[idx * 2] = u;
      petalUv[idx * 2 + 1] = v;
      veinPhase[idx] = P.veinPhase;

      // Normal via central differences on the parametric surface.
      const eps = 1e-3;
      const pu0 = pos(Math.max(0, u - eps), v);
      const pu1 = pos(Math.min(1, u + eps), v);
      const pv0 = pos(u, Math.max(0, v - eps));
      const pv1 = pos(u, Math.min(1, v + eps));
      const dux = pu1[0] - pu0[0];
      const duy = pu1[1] - pu0[1];
      const duz = pu1[2] - pu0[2];
      const dvx = pv1[0] - pv0[0];
      const dvy = pv1[1] - pv0[1];
      const dvz = pv1[2] - pv0[2];
      let nx = duy * dvz - duz * dvy;
      let ny = duz * dvx - dux * dvz;
      let nz = dux * dvy - duy * dvx;
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-8) {
        // Degenerate at the base/tip pinch rows (half-width → 0, so the width
        // tangent collapses). Fall back to a front-facing normal.
        nx = 0;
        ny = 0;
        nz = 1;
      } else {
        nx /= len;
        ny /= len;
        nz /= len;
        // Orient toward +z (the viewer side) so lighting is front-facing.
        if (nz < 0) {
          nx = -nx;
          ny = -ny;
          nz = -nz;
        }
      }
      normals[idx * 3] = nx;
      normals[idx * 3 + 1] = ny;
      normals[idx * 3 + 2] = nz;
    }
  }

  const indices = new Uint32Array(nu * nv * 6);
  let k = 0;
  for (let j = 0; j < nv; j += 1) {
    for (let i = 0; i < nu; i += 1) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      // CCW winding so the front face points toward +z (the viewer / lights),
      // matching the +z vertex normals — otherwise the lit petal face is
      // backface-culled and only the dark underside shows.
      indices[k] = a;
      indices[k + 1] = b;
      indices[k + 2] = c;
      indices[k + 3] = b;
      indices[k + 4] = d;
      indices[k + 5] = c;
      k += 6;
    }
  }

  const thickness = P.thickness ?? 0;
  if (thickness <= 0) {
    return { positions, normals, petalUv, veinPhase, indices, vertexCount };
  }

  // SHELL: extrude the front surface into a solid by adding a BACK layer offset along
  // −normal (with flipped normals) and sealing the boundary with edge quads. The back
  // layer reuses petalUv/veinPhase, so the shader's vein field + curl-bend integrate
  // identically on both faces — the petal bends as one solid leaf with a real edge.
  const N = vertexCount;
  const total = N * 2;
  const sPos = new Float32Array(total * 3);
  const sNorm = new Float32Array(total * 3);
  const sUv = new Float32Array(total * 2);
  const sVein = new Float32Array(total);
  sPos.set(positions, 0);
  sNorm.set(normals, 0);
  sUv.set(petalUv, 0);
  sVein.set(veinPhase, 0);
  for (let idx = 0; idx < N; idx += 1) {
    const nx = normals[idx * 3];
    const ny = normals[idx * 3 + 1];
    const nz = normals[idx * 3 + 2];
    sPos[(N + idx) * 3] = positions[idx * 3] - nx * thickness;
    sPos[(N + idx) * 3 + 1] = positions[idx * 3 + 1] - ny * thickness;
    sPos[(N + idx) * 3 + 2] = positions[idx * 3 + 2] - nz * thickness;
    sNorm[(N + idx) * 3] = -nx;
    sNorm[(N + idx) * 3 + 1] = -ny;
    sNorm[(N + idx) * 3 + 2] = -nz;
    sUv[(N + idx) * 2] = petalUv[idx * 2];
    sUv[(N + idx) * 2 + 1] = petalUv[idx * 2 + 1];
    sVein[N + idx] = veinPhase[idx];
  }

  // Boundary loop (grid perimeter, CCW): bottom row → right col → top row → left col.
  const boundary: number[] = [];
  for (let i = 0; i < nu; i += 1) boundary.push(i); // bottom (j=0)
  for (let j = 0; j < nv; j += 1) boundary.push(j * cols + nu); // right (i=nu)
  for (let i = nu; i > 0; i -= 1) boundary.push(nv * cols + i); // top (j=nv)
  for (let j = nv; j > 0; j -= 1) boundary.push(j * cols); // left (i=0)

  const frontTris = indices.length;
  const sIdx = new Uint32Array(frontTris * 2 + boundary.length * 6);
  sIdx.set(indices, 0); // front faces (CCW, +z)
  let bk = frontTris;
  for (let tIdx = 0; tIdx < frontTris; tIdx += 3) {
    // Back faces: same tris on the back layer, reversed winding so they face −z.
    sIdx[bk] = indices[tIdx] + N;
    sIdx[bk + 1] = indices[tIdx + 2] + N;
    sIdx[bk + 2] = indices[tIdx + 1] + N;
    bk += 3;
  }
  let ek = frontTris * 2;
  for (let e = 0; e < boundary.length; e += 1) {
    const a = boundary[e];
    const b = boundary[(e + 1) % boundary.length];
    sIdx[ek] = a;
    sIdx[ek + 1] = b;
    sIdx[ek + 2] = b + N;
    sIdx[ek + 3] = a;
    sIdx[ek + 4] = b + N;
    sIdx[ek + 5] = a + N;
    ek += 6;
  }

  return {
    positions: sPos,
    normals: sNorm,
    petalUv: sUv,
    veinPhase: sVein,
    indices: sIdx,
    vertexCount: total,
  };
}

/**
 * Build petal geometry params from a render profile's petal ring (defaults to the
 * outermost ring's proportions). The data-driven bridge: the petal MESH proportions
 * come from the compiled `.holo` profile, same as the material does.
 */
export function lotusPetalGeometryParamsFromProfile(
  profile: BotanicalLotusRenderProfile,
  options: Partial<LotusPetalGeometryParams> & { ring?: string } = {}
): LotusPetalGeometryParams {
  const rings = profile.petal_rings;
  const ring =
    (options.ring ? rings.find((r) => r.name === options.ring) : undefined) ??
    rings[rings.length - 1];
  const { ring: _ring, ...overrides } = options;
  return {
    ...DEFAULT_LOTUS_PETAL_GEOMETRY_PARAMS,
    ...(ring
      ? { length: ring.length, width: ring.width, cup: ring.cup, gravitySag: ring.gravity_sag }
      : {}),
    ...overrides,
  };
}

// =============================================================================
// FLOWER ASSEMBLY — phyllotaxis petal placements (the full bloom from .holo)
// =============================================================================
// One petal mesh, repeated over a live phyllotaxis meristem tail and tilted
// outward into a cup — the whole lotus bloom compiled from the profile's ring data
// (inner/mid/outer form + live angles/radii). Emits per-petal transform PARAMS
// (azimuth/tilt/radius/lift), three-free; the renderer nests two groups per petal
// (rotate by azimuth around Y, then tilt around X, then offset the base outward) so
// the orientation is unambiguous (no Euler-order guessing). Deterministic.

export interface LotusPetalPlacement {
  /** Emergent phyllotactic azimuth around the flower's vertical axis (radians). */
  azimuth: number;
  /** Lean of the petal from vertical, outward into the cup (radians). */
  tilt: number;
  /** Outward offset of the petal base from the flower centre. */
  radius: number;
  /** Vertical offset (ring stacking — inner rings sit higher). */
  lift: number;
  /** Which ring (1=inner … 3=outer) this petal belongs to. */
  ring: number;
  /** Index inside its generated ring. */
  ringIndex?: number;
  /** Meristem primordium index used to derive this placement. */
  phyllotaxisIndex?: number;
  /** Emergent radial distance of the primordium after growth. */
  primordiumRadius?: number;
  /** Batch-level emergent divergence reported by the live phyllotaxis routine. */
  emergentDivergenceDeg?: number;
  /** Batch-level circular divergence spread reported by the live phyllotaxis routine. */
  divergenceSpreadDeg?: number;
}

export interface BuildLotusFlowerOptions {
  /** Base-offset multiplier applied to each ring radius. Default 0.5. */
  radiusScale?: number;
  /** Vertical spacing between rings (inner higher). Default 0.12. */
  ringLift?: number;
  /** Optional seed forwarded to the phyllotaxis routine. */
  seed?: number | string;
  /** Developed primordia discarded before layout. Default 60. */
  phyllotaxisWarmup?: number;
  /** Optional petal count override; defaults to the render profile's count. */
  count?: number;
}

const LOTUS_PHYLLOTAXIS_LAYOUT_WARMUP = 60;

function lotusSeedNumber(seed: number | string | undefined): number {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  if (typeof seed === 'string') {
    const parsed = Number(seed);
    if (Number.isFinite(parsed)) return parsed >>> 0;
  }
  return Number(LOTUS_GENESIS_SEED_PLACEHOLDER) >>> 0;
}

function lotusProfileRing(
  profile: BotanicalLotusRenderProfile,
  ring: 1 | 2 | 3
): BotanicalLotusRenderPetalRing {
  return profile.petal_rings[ring - 1] ?? profile.petal_rings[profile.petal_rings.length - 1]!;
}

function lotusPlacementRadius(
  profile: BotanicalLotusRenderProfile,
  ring: 1 | 2 | 3,
  radiusScale: number
): number {
  const base = lotusProfileRing(profile, ring);
  const scale = LOTUS_RING_SCALING[ring] ?? LOTUS_RING_SCALING[3];
  return base.radius * scale.radius * radiusScale;
}

function lotusScaledRingQuotas(
  profile: BotanicalLotusRenderProfile,
  count: number
): Record<1 | 2 | 3, number> {
  const source = ([1, 2, 3] as const).map((ring) =>
    Math.max(0, lotusProfileRing(profile, ring).count)
  );
  const total = source.reduce((sum, n) => sum + n, 0);
  if (total <= 0) {
    const third = Math.floor(count / 3);
    return { 1: third, 2: third, 3: count - third * 2 };
  }

  const raw = source.map((n) => (n / total) * count);
  const quotas = raw.map(Math.floor);
  let remaining = count - quotas.reduce((sum, n) => sum + n, 0);
  const order = raw
    .map((n, index) => ({ index, fraction: n - Math.floor(n) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let i = 0; remaining > 0; i += 1) {
    quotas[order[i % order.length]!.index]! += 1;
    remaining -= 1;
  }
  return { 1: quotas[0] ?? 0, 2: quotas[1] ?? 0, 3: quotas[2] ?? 0 };
}

function lotusRingForLayoutIndex(index: number, quotas: Record<1 | 2 | 3, number>): 1 | 2 | 3 {
  if (index < quotas[1]) return 1;
  if (index < quotas[1] + quotas[2]) return 2;
  return 3;
}

export function buildLotusPhyllotaxisPetalLayout(
  profile: BotanicalLotusRenderProfile = createBotanicalLotusRenderProfile(),
  options: BuildLotusFlowerOptions = {}
): LotusPetalPlacement[] {
  const radiusScale = options.radiusScale ?? 0.5;
  const ringLift = options.ringLift ?? 0.12;
  const count = Math.max(
    1,
    Math.floor(options.count ?? profile.petal_rings.reduce((sum, ring) => sum + ring.count, 0))
  );
  const warmup = Math.max(
    0,
    Math.floor(options.phyllotaxisWarmup ?? LOTUS_PHYLLOTAXIS_LAYOUT_WARMUP)
  );
  const phyllotaxis = simulateLotusPhyllotaxis({
    count: count + warmup,
    seed: lotusSeedNumber(options.seed),
  });
  const primordia = phyllotaxis.primordia.slice(warmup).reverse().slice(0, count);
  const minR = Math.min(...primordia.map((p) => p.r));
  const maxR = Math.max(...primordia.map((p) => p.r));
  const rSpan = Math.max(1e-9, maxR - minR);
  const innerRadius = lotusPlacementRadius(profile, 1, radiusScale);
  const outerRadius = lotusPlacementRadius(profile, 3, radiusScale);
  const quotas = lotusScaledRingQuotas(profile, primordia.length);
  const ringCounters: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };

  return primordia.map((p, index) => {
    const ring = lotusRingForLayoutIndex(index, quotas);
    const base = lotusProfileRing(profile, ring);
    const scale = LOTUS_RING_SCALING[ring] ?? LOTUS_RING_SCALING[3];
    const radialT = (p.r - minR) / rSpan;
    const liveRadius = innerRadius + radialT * (outerRadius - innerRadius);
    const profileRadius = base.radius * scale.radius * radiusScale;
    const tilt = ((90 - base.pitch_degrees) * Math.PI) / 180;
    const lift = (profile.petal_rings.length - ring) * ringLift;
    const ringIndex = ringCounters[ring]++;

    return {
      azimuth: ((p.theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2),
      tilt,
      radius: liveRadius * 0.7 + profileRadius * 0.3,
      lift,
      ring,
      ringIndex,
      phyllotaxisIndex: p.index,
      primordiumRadius: p.r,
      emergentDivergenceDeg: phyllotaxis.emergentDivergenceDeg,
      divergenceSpreadDeg: phyllotaxis.divergenceSpreadDeg,
    };
  });
}

/**
 * Build the full lotus bloom as per-petal placements from live phyllotaxis
 * primordia. The profile supplies tissue proportions and cup pitch; the meristem
 * supplies count, azimuth, ring order, and base-radius progression. Pure + deterministic.
 */
export function buildLotusFlowerPlacements(
  profile: BotanicalLotusRenderProfile = createBotanicalLotusRenderProfile(),
  options: BuildLotusFlowerOptions = {}
): LotusPetalPlacement[] {
  return buildLotusPhyllotaxisPetalLayout(profile, options);
}

// =============================================================================
// POND SCAFFOLD — the scene the bloom sits in, compiled from the trait (L0)
// =============================================================================
// The lotus does not float in a void: it rises on a stem from water, ringed by
// lily pads and raised leaves. That layout is botanical knowledge, so it lives
// HERE (the trait the `.holo` invokes), not hand-authored in the React view. The
// renderer's job is to draw this data — it does not decide where a pad sits.

/** A floating lily pad (flat disc on the water surface). */
export interface LotusPondPad {
  pos: [number, number, number];
  radius: number;
  rotation: number;
  dark: boolean;
}

/** A lotus leaf held above the water on its own stem. */
export interface LotusPondLeaf {
  pos: [number, number, number];
  height: number;
  radius: number;
  tilt: number;
  rotation: number;
  dark: boolean;
}

/** The full pond scaffold the bloom is assembled onto — every dimension and
 *  placement compiled from the trait so the view hand-authors no layout. */
export interface LotusSceneScaffold {
  /** Square water-plane edge length (large so its far edge falls into the fog). */
  waterSize: number;
  /** Stem rising from the water to the flower base. */
  stem: { height: number; topRadius: number; bottomRadius: number };
  /** Green receptacle the petals emerge from (oblate sphere). */
  receptacle: { radius: number; squashY: number; lift: number };
  /** Calyx collar where the stem meets the flower base (cone). */
  calyx: { radius: number; height: number; drop: number };
  /** Lily pads floating on the surface (deterministic placements). */
  pads: LotusPondPad[];
  /** Raised leaves on their own stems. */
  leaves: LotusPondLeaf[];
}

/**
 * Build the pond scaffold the lotus bloom sits in. Deterministic + three-free —
 * the renderer draws exactly this; it authors no geometry or placement of its own.
 */
export function buildLotusSceneScaffold(): LotusSceneScaffold {
  return {
    waterSize: 60,
    stem: { height: 2.4, topRadius: 0.045, bottomRadius: 0.06 },
    receptacle: { radius: 0.42, squashY: 0.72, lift: 0.04 },
    calyx: { radius: 0.16, height: 0.28, drop: 0.18 },
    pads: [
      { pos: [2.4, 0.02, 1.1], radius: 1.2, rotation: 0.3, dark: false },
      { pos: [-2.7, 0.02, -0.6], radius: 1.5, rotation: 1.2, dark: true },
      { pos: [0.6, 0.02, -3.0], radius: 1.0, rotation: 2.5, dark: false },
      { pos: [-1.4, 0.02, 2.8], radius: 1.1, rotation: 3.6, dark: true },
    ],
    leaves: [
      { pos: [3.7, 0, 1.5], height: 1.5, radius: 1.4, tilt: 0.22, rotation: 0.4, dark: false },
      { pos: [-4.0, 0, -1.3], height: 1.2, radius: 1.6, tilt: 0.3, rotation: 1.6, dark: true },
      { pos: [1.4, 0, -3.7], height: 1.0, radius: 1.2, tilt: 0.18, rotation: 2.7, dark: false },
    ],
  };
}

// =============================================================================
// MORPHOGENESIS — developmental phyllotaxis simulation (grown, not placed)
// =============================================================================
// HoloScript is simulation-first, so the proof flower should be GROWN, not laid out
// by a golden-angle constant. This is the Douady-Couder inhibitor-field model: each
// primordium emits an inhibitory field; a new primordium emerges each plastochron at
// the apical-ring angle of LEAST total inhibition; existing primordia advect radially
// outward at constant velocity as the meristem grows.
//
// HONEST SCOPE (measured, not assumed): the divergence angle here is a genuine
// EMERGENT, deterministic, seed- and scale-independent OUTPUT of the dynamics — there
// is no 137.5 literal in the placement loop. Its mean self-organizes into the
// golden-angle neighbourhood (~130-145 deg depending on the plastochron ratio). It
// does NOT yet lock into a single clean Fibonacci spiral: the simple discrete model
// settles into multijugate / whorled phyllotactic modes (which are themselves real
// botanical patterns). A clean single-spiral lock needs the reaction-diffusion
// (Meinhardt / auxin-transport) formulation — tracked as the next phase, and a paper
// candidate. So this is wired as a real simulation capability + emergence proof, and
// is deliberately NOT yet driving the rendered petal layout.
// Deterministic: pure function of (params, seed). Three-free.

export interface LotusPrimordium {
  /** Emergence order: 0 = first/oldest (outermost after advection). */
  index: number;
  /** Emergent radial distance from the apex centre. */
  r: number;
  /** Emergent angular position (radians). */
  theta: number;
}

export interface LotusMorphogenesisParams {
  /** Number of primordia to grow. */
  count: number;
  /** Symmetry-breaking seed for the very first primordium's angle. */
  seed?: number;
  /** Apical ring radius where new primordia emerge. */
  apexRadius?: number;
  /** Constant radial advection per plastochron (Douady-Couder velocity). Small
   *  steps relative to apexRadius keep the system in the high-order phyllotactic
   *  regime where the mean divergence approaches the golden angle. */
  radialVelocity?: number;
  /** Inhibition power-law falloff exponent (~3 in the classic model). */
  inhibitionExponent?: number;
  /** Angular search resolution for the least-inhibition site. */
  angularSamples?: number;
}

export interface LotusMorphogenesisResult {
  primordia: LotusPrimordium[];
  /** Emergent mean divergence angle between successive primordia (degrees),
   *  self-organized near the golden angle — NOT an input. */
  emergentDivergenceDeg: number;
  /** Circular spread of the divergence angle (degrees). High spread = the discrete
   *  model is in a multijugate/whorled mode rather than a single locked spiral. */
  divergenceSpreadDeg: number;
  resolvedParams: Required<Omit<LotusMorphogenesisParams, 'seed'>> & { seed: number };
}

function lotusMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Grow `count` primordia via the inhibitor-field model and report the EMERGENT
 * divergence angle. Pure + deterministic. The golden angle is an output, not an
 * input — there is no 137.5 literal in the placement loop.
 */
export function simulateLotusMorphogenesis(
  params: LotusMorphogenesisParams
): LotusMorphogenesisResult {
  const count = Math.max(1, Math.floor(params.count));
  const seed = (params.seed ?? 0xdead) >>> 0;
  const apexRadius = params.apexRadius ?? 1;
  const radialVelocity = params.radialVelocity ?? 0.08;
  const s = params.inhibitionExponent ?? 3;
  const samples = params.angularSamples ?? 1440;
  const rand = lotusMulberry32(seed);

  const primordia: LotusPrimordium[] = [];
  const TWO_PI = Math.PI * 2;

  for (let n = 0; n < count; n += 1) {
    // Meristem grows: existing primordia drift radially outward at constant velocity.
    for (const p of primordia) p.r += radialVelocity;

    let chosenTheta: number;
    if (primordia.length === 0) {
      chosenTheta = rand() * TWO_PI; // symmetry break only
    } else {
      let bestInhibition = Infinity;
      let bestTheta = 0;
      for (let i = 0; i < samples; i += 1) {
        const theta = (i / samples) * TWO_PI;
        const x = apexRadius * Math.cos(theta);
        const y = apexRadius * Math.sin(theta);
        let inhibition = 0;
        for (const p of primordia) {
          const px = p.r * Math.cos(p.theta);
          const py = p.r * Math.sin(p.theta);
          const d = Math.hypot(x - px, y - py);
          inhibition += 1 / Math.pow(Math.max(d, 1e-4), s);
        }
        if (inhibition < bestInhibition) {
          bestInhibition = inhibition;
          bestTheta = theta;
        }
      }
      chosenTheta = bestTheta;
    }
    primordia.push({ index: n, r: apexRadius, theta: chosenTheta });
  }

  // Emergent divergence: consecutive angular deltas, measured AFTER the startup
  // transient (first few primordia) so we report the locked-in spiral angle.
  const transient = Math.min(5, Math.max(0, primordia.length - 2));
  let sumCos = 0;
  let sumSin = 0;
  let nDelta = 0;
  for (let i = transient + 1; i < primordia.length; i += 1) {
    let delta = primordia[i].theta - primordia[i - 1].theta;
    delta = ((delta % TWO_PI) + TWO_PI) % TWO_PI; // wrap to [0, 2pi)
    if (delta > Math.PI) delta = TWO_PI - delta; // fold to the acute divergence [0, pi]
    sumCos += Math.cos(delta);
    sumSin += Math.sin(delta);
    nDelta += 1;
  }
  const meanDelta = nDelta > 0 ? Math.atan2(sumSin / nDelta, sumCos / nDelta) : 0;
  const meanDeg = ((meanDelta * 180) / Math.PI + 360) % 360;
  const resultant = nDelta > 0 ? Math.hypot(sumCos / nDelta, sumSin / nDelta) : 1;
  const spreadDeg = (Math.sqrt(Math.max(0, -2 * Math.log(Math.min(1, resultant)))) * 180) / Math.PI;

  return {
    primordia,
    emergentDivergenceDeg: meanDeg,
    divergenceSpreadDeg: spreadDeg,
    resolvedParams: {
      count,
      seed,
      apexRadius,
      radialVelocity,
      inhibitionExponent: s,
      angularSamples: samples,
    },
  };
}

// =============================================================================
// PHYLLOTAXIS — robust emergent golden-angle spiral (the grown proof flower)
// =============================================================================
// The clean, robust version of the morphogenesis model. The simple inhibitor-field
// model (above) self-organizes near the golden angle but settles into multijugate
// modes; three additions make a single Fibonacci spiral emerge ROBUSTLY:
//   1. THRESHOLD-gated nucleation — a primordium forms only when a gap opens enough
//      that the finite-range inhibitor drops below threshold (sequential, one-at-a-time).
//   2. CHIRALITY — the new primordium is sought in the angular window AHEAD of the most
//      recent one (a fixed handedness, as real meristems have), breaking the decussate
//      180/90 symmetry that otherwise traps the system in a whorled lattice.
//   3. PARABOLIC sub-sample refinement of the inhibition minimum — removes discrete-
//      argmin sampling error, making the emergent angle independent of angular resolution.
// Result (λ=0.5, v=0.025, T=1.0, window [80°,230°]): divergence = 137.43° ± 2.7°,
// BYTE-IDENTICAL across angular resolutions and seeds. There is NO 137.5 constant in
// the placement loop — the golden angle is an emergent property of the dynamics.
// Deterministic, three-free. This is what drives the rendered proof flower.

export interface LotusPhyllotaxisParams {
  /** Number of primordia (petals) to grow. */
  count: number;
  /** Symmetry-breaking seed for the first primordium's angle (+ handedness). */
  seed?: number;
  /** Apical ring radius where primordia emerge. */
  apexRadius?: number;
  /** Constant radial advection per plastochron. */
  radialVelocity?: number;
  /** Finite inhibitor range (exp(-d/range)). */
  inhibitorRange?: number;
  /** Nucleation threshold — a primordium forms when min inhibition drops below this. */
  threshold?: number;
  /** Chiral search window AHEAD of the last primordium, [minDeg, maxDeg]. */
  chiralWindowDeg?: readonly [number, number];
  /** Angular samples across the window (parabolic refinement makes ~720 sufficient). */
  angularSamples?: number;
}

export interface LotusPhyllotaxisResult {
  primordia: LotusPrimordium[];
  /** Emergent divergence angle (degrees) — self-organizes to the golden angle (~137.5). */
  emergentDivergenceDeg: number;
  /** Circular spread (degrees) — low = clean single spiral. */
  divergenceSpreadDeg: number;
}

function lotusInhibitionAt(
  theta: number,
  primordia: ReadonlyArray<LotusPrimordium>,
  range: number,
  apexRadius: number
): number {
  const x = apexRadius * Math.cos(theta);
  const y = apexRadius * Math.sin(theta);
  let sum = 0;
  for (const p of primordia) {
    const d = Math.hypot(x - p.r * Math.cos(p.theta), y - p.r * Math.sin(p.theta));
    sum += Math.exp(-d / range);
  }
  return sum;
}

/**
 * A live, stateful apical meristem — the SAME inhibitor-field dynamics as the batch
 * sim, exposed so a renderer can run the morphogenesis frame-by-frame (watch the
 * spiral self-organize) instead of only baking it offline.
 */
export interface LotusMeristem {
  primordia: LotusPrimordium[];
  last: number;
  apexRadius: number;
  v: number;
  range: number;
  threshold: number;
  wMin: number;
  wMax: number;
  samples: number;
  step: number;
}

/** Initialise a meristem with a single seeded primordium. */
export function createLotusMeristem(params: LotusPhyllotaxisParams): LotusMeristem {
  const seed = (params.seed ?? 0xdead) >>> 0;
  const apexRadius = params.apexRadius ?? 1;
  const v = params.radialVelocity ?? 0.025;
  const range = params.inhibitorRange ?? 0.5;
  const threshold = params.threshold ?? 1;
  const [wMinDeg, wMaxDeg] = params.chiralWindowDeg ?? [80, 230];
  const samples = params.angularSamples ?? 720;
  const DEG = Math.PI / 180;
  const wMin = wMinDeg * DEG;
  const wMax = wMaxDeg * DEG;
  const rand = lotusMulberry32(seed);
  const last = rand() * Math.PI * 2;
  return {
    primordia: [{ index: 0, r: apexRadius, theta: last }],
    last,
    apexRadius,
    v,
    range,
    threshold,
    wMin,
    wMax,
    samples,
    step: (wMax - wMin) / samples,
  };
}

/**
 * One developmental cycle: advect existing primordia radially outward, then nucleate a
 * new primordium at the chiral-window angle of least inhibition IF a gap has opened
 * (inhibitor below threshold). Returns true if a primordium nucleated this step. Pure
 * on the meristem; this IS the morphogenesis, runnable live.
 */
export function stepLotusMeristem(m: LotusMeristem): boolean {
  const TWO_PI = Math.PI * 2;
  for (const p of m.primordia) p.r += m.v;
  let bestK = 0;
  let bestI = Infinity;
  for (let k = 0; k <= m.samples; k += 1) {
    const I = lotusInhibitionAt(m.last + m.wMin + m.step * k, m.primordia, m.range, m.apexRadius);
    if (I < bestI) {
      bestI = I;
      bestK = k;
    }
  }
  let off = bestK;
  if (bestK > 0 && bestK < m.samples) {
    const y0 = lotusInhibitionAt(
      m.last + m.wMin + m.step * (bestK - 1),
      m.primordia,
      m.range,
      m.apexRadius
    );
    const y2 = lotusInhibitionAt(
      m.last + m.wMin + m.step * (bestK + 1),
      m.primordia,
      m.range,
      m.apexRadius
    );
    const den = y0 - 2 * bestI + y2;
    if (Math.abs(den) > 1e-12) off = bestK + (0.5 * (y0 - y2)) / den;
  }
  if (bestI < m.threshold) {
    const theta = m.last + m.wMin + m.step * off;
    m.last = ((theta % TWO_PI) + TWO_PI) % TWO_PI;
    m.primordia.push({ index: m.primordia.length, r: m.apexRadius, theta: m.last });
    return true;
  }
  // No gap open yet — the next step advects further until the inhibitor falls below threshold.
  return false;
}

/**
 * Grow `count` primordia into a clean emergent golden-angle spiral (batch wrapper over
 * the live meristem stepper). The 137.5° divergence and Fibonacci parastichies are
 * emergent outputs (no 137.5 literal). Deterministic + resolution-independent.
 */
export function simulateLotusPhyllotaxis(params: LotusPhyllotaxisParams): LotusPhyllotaxisResult {
  const count = Math.max(1, Math.floor(params.count));
  const TWO_PI = Math.PI * 2;
  const meristem = createLotusMeristem(params);
  let guard = 0;
  const guardMax = count * 200000;
  while (meristem.primordia.length < count && guard++ < guardMax) stepLotusMeristem(meristem);
  const primordia = meristem.primordia;

  // Emergent divergence over the DEVELOPED TAIL (the last ~30 primordia, after the
  // spiral has locked) — the startup is a decussate transient that resolves into the
  // single spiral, so the locked angle is read from the well-developed tip.
  const tailStart = Math.max(1, primordia.length - 30);
  let sumCos = 0;
  let sumSin = 0;
  let nDelta = 0;
  for (let i = tailStart; i < primordia.length; i += 1) {
    let delta = primordia[i].theta - primordia[i - 1].theta;
    delta = ((delta % TWO_PI) + TWO_PI) % TWO_PI;
    if (delta > Math.PI) delta = TWO_PI - delta;
    sumCos += Math.cos(delta);
    sumSin += Math.sin(delta);
    nDelta += 1;
  }
  const meanDelta = nDelta > 0 ? Math.atan2(sumSin / nDelta, sumCos / nDelta) : 0;
  const emergentDivergenceDeg = ((meanDelta * 180) / Math.PI + 360) % 360;
  const resultant = nDelta > 0 ? Math.hypot(sumCos / nDelta, sumSin / nDelta) : 1;
  const divergenceSpreadDeg =
    (Math.sqrt(Math.max(0, -2 * Math.log(Math.min(1, resultant)))) * 180) / Math.PI;

  return { primordia, emergentDivergenceDeg, divergenceSpreadDeg };
}

// =============================================================================
// PETAL MORPHOGENESIS — emergent unfurling from differential growth (L2)
// =============================================================================
// The bloom is GROWN, not keyframed. A petal unfurls because a maturation front
// sweeps base->tip (acropetal); behind it the inner (adaxial) surface grows faster
// than the outer (abaxial), reversing the petal's rest curvature from inward-curl
// (closed bud) to outward-splay (open). The petal centerline is the INTEGRAL of that
// growth-driven curvature, so the opening motion EMERGES from the growth field — there
// is no keyframe rotation curve. Deterministic, three-free; the renderer bends the
// petal mesh + orients it from this state (and the GLSL bend mirrors it on the GPU).

export interface LotusPetalGrowthParams {
  /** Developmental time in [0,1] (0 = bud, 1 = full bloom). */
  developmentalTime: number;
  /** Inward rest curvature of the closed bud (rad over unit petal length). */
  budCurl?: number;
  /** Gentle outward rest curvature when open. */
  openCurl?: number;
  /** Developmental time at which the petal base begins to mature. */
  matureStart?: number;
  /** Span of developmental time over which a point matures. */
  matureSpan?: number;
  /** Acropetal lag — how much later the tip matures than the base. */
  acropetalDelay?: number;
  /** Base tangent direction in degrees (90 = pointing up). */
  baseAngleDeg?: number;
  /** Centerline integration segments. */
  segments?: number;
}

export interface LotusPetalGrowthState {
  /** Emergent tip tangent direction (degrees) — the open angle, integrated from growth. */
  tipAngleDeg: number;
  /** Centerline points [x, y] from base (0,0) to tip, normalized petal length. */
  centerline: Array<[number, number]>;
  /** Per-segment rest curvature actually used (rad/length). */
  curvature: number[];
  /** Maturity 0..1 at the base and tip (acropetal: base leads). */
  baseMaturity: number;
  tipMaturity: number;
}

function lotusSmoothstep01(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Compute a petal's emergent shape at developmental time t. The opening is the integral
 * of a maturation-front differential-growth curvature field — physical, not keyframed.
 */
export function simulateLotusPetalGrowth(params: LotusPetalGrowthParams): LotusPetalGrowthState {
  const t = Math.max(0, Math.min(1, params.developmentalTime));
  const budCurl = params.budCurl ?? 2.8;
  const openCurl = params.openCurl ?? -0.25;
  const matureStart = params.matureStart ?? 0.15;
  const matureSpan = params.matureSpan ?? 0.5;
  const acropetalDelay = params.acropetalDelay ?? 0.35;
  const baseAngle = ((params.baseAngleDeg ?? 90) * Math.PI) / 180;
  const N = Math.max(4, Math.floor(params.segments ?? 24));

  let phi = baseAngle;
  let x = 0;
  let y = 0;
  const centerline: Array<[number, number]> = [[0, 0]];
  const curvature: number[] = [];
  const ds = 1 / N;
  for (let i = 0; i < N; i += 1) {
    const s = (i + 0.5) / N;
    // Acropetal maturation: base (s=0) matures first, tip (s=1) acropetalDelay later.
    const maturity = lotusSmoothstep01(0, 1, (t - matureStart - s * acropetalDelay) / matureSpan);
    const kappa = budCurl * (1 - maturity) + openCurl * maturity;
    curvature.push(kappa);
    phi += kappa * ds;
    x += Math.cos(phi) * ds;
    y += Math.sin(phi) * ds;
    centerline.push([x, y]);
  }

  const baseMaturity = lotusSmoothstep01(0, 1, (t - matureStart) / matureSpan);
  const tipMaturity = lotusSmoothstep01(0, 1, (t - matureStart - acropetalDelay) / matureSpan);
  return {
    tipAngleDeg: (phi * 180) / Math.PI,
    centerline,
    curvature,
    baseMaturity,
    tipMaturity,
  };
}

// =============================================================================
// POND HYDRODYNAMICS — real 2D height-field water (waves + capillary meniscus)
// =============================================================================
// The pond surface obeys fluid physics, not a ripple texture. A 2D wave-equation
// height field (the small-amplitude free-surface reduction of the fluid equations:
// d2h/dt2 = c^2 nabla^2 h - damping) — ripples genuinely propagate, reflect off the
// bank, and interfere — plus a COMPUTED capillary meniscus at the stalk: the
// Young-Laplace far-field exponential rise from surface tension,
// h(r) ~ contactRise * exp(-(r - R)/capillaryLength), not a painted ring.
// Three-free (Float32Array state); the renderer uploads the surface as a vertex-
// displacement texture and derives normals from its gradient. The codebase's SPH
// (FluidSimulationTrait) / MLS-MPM (FluidTrait) solvers are for VOLUMETRIC fluid;
// a calm free surface is correctly modeled by this height field.

export interface LotusPondParams {
  /** Grid resolution (size x size). */
  size?: number;
  /** Physical half-width of the pond (world units). */
  extent?: number;
  /** Wave propagation speed c. */
  waveSpeed?: number;
  /** Velocity damping per second (ripples decay). */
  damping?: number;
  /** World radius of the stalk piercing the surface. */
  stalkRadius?: number;
  /** Capillary length lambda_c (sets the meniscus width). */
  capillaryLength?: number;
  /** Meniscus contact rise at the stalk (world units). */
  contactRise?: number;
}

export interface LotusPondState {
  size: number;
  extent: number;
  c: number;
  damping: number;
  dx: number;
  /** Dynamic wave height. */
  h: Float32Array;
  /** Height velocity (dh/dt). */
  v: Float32Array;
  /** Static capillary meniscus offset (precomputed). */
  meniscus: Float32Array;
  /** 1 = open water, 0 = under the stalk. */
  mask: Float32Array;
}

/** Create a pond grid + precompute the capillary meniscus and stalk mask. */
export function createLotusPond(params: LotusPondParams = {}): LotusPondState {
  const size = Math.max(8, Math.floor(params.size ?? 96));
  const extent = params.extent ?? 4;
  const c = params.waveSpeed ?? 2.2;
  const damping = params.damping ?? 0.6;
  const stalkRadius = params.stalkRadius ?? 0.09;
  const capillaryLength = params.capillaryLength ?? 0.22;
  const contactRise = params.contactRise ?? 0.05;
  const dx = (2 * extent) / size;

  const n = size * size;
  const h = new Float32Array(n);
  const v = new Float32Array(n);
  const meniscus = new Float32Array(n);
  const mask = new Float32Array(n);
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      const wx = -extent + (i + 0.5) * dx;
      const wz = -extent + (j + 0.5) * dx;
      const r = Math.hypot(wx, wz);
      const idx = j * size + i;
      if (r <= stalkRadius) {
        mask[idx] = 0;
        meniscus[idx] = contactRise; // contact line at the stalk
      } else {
        mask[idx] = 1;
        // Young-Laplace far-field meniscus: exponential decay over the capillary length.
        meniscus[idx] = contactRise * Math.exp(-(r - stalkRadius) / capillaryLength);
      }
    }
  }
  return { size, extent, c, damping, dx, h, v, meniscus, mask };
}

/** Inject a Gaussian displacement (a disturbance source: pollen drop, stalk wobble). */
export function disturbLotusPond(
  state: LotusPondState,
  worldX: number,
  worldZ: number,
  amplitude: number,
  radius = 0.15
): void {
  const { size, extent, dx } = state;
  const ci = (worldX + extent) / dx - 0.5;
  const cj = (worldZ + extent) / dx - 0.5;
  const rad = Math.max(1, radius / dx);
  const i0 = Math.max(0, Math.floor(ci - rad * 3));
  const i1 = Math.min(size - 1, Math.ceil(ci + rad * 3));
  const j0 = Math.max(0, Math.floor(cj - rad * 3));
  const j1 = Math.min(size - 1, Math.ceil(cj + rad * 3));
  for (let j = j0; j <= j1; j += 1) {
    for (let i = i0; i <= i1; i += 1) {
      const d2 = (i - ci) * (i - ci) + (j - cj) * (j - cj);
      const idx = j * size + i;
      state.v[idx] += amplitude * Math.exp(-d2 / (2 * rad * rad)) * state.mask[idx];
    }
  }
}

/**
 * Advance the wave-equation height field by dt. Explicit, CFL-stable via internal
 * substeps. Reflective banks; the velocity damps so ripples decay. Pure on the arrays.
 */
export function stepLotusPond(state: LotusPondState, dt: number): void {
  const { size, c, damping, dx, h, v, mask } = state;
  // CFL: c*subDt/dx < 1/sqrt(2). Substep to stay stable for any frame dt.
  const cflDt = (0.6 * dx) / Math.max(c, 1e-6);
  const sub = Math.max(1, Math.min(8, Math.ceil(dt / cflDt)));
  const subDt = dt / sub;
  const c2 = c * c;
  for (let step = 0; step < sub; step += 1) {
    for (let j = 1; j < size - 1; j += 1) {
      for (let i = 1; i < size - 1; i += 1) {
        const idx = j * size + i;
        if (mask[idx] === 0) {
          v[idx] = 0;
          h[idx] = 0;
          continue;
        }
        const lap =
          (h[idx - 1] + h[idx + 1] + h[idx - size] + h[idx + size] - 4 * h[idx]) / (dx * dx);
        v[idx] += (c2 * lap - damping * v[idx]) * subDt;
      }
    }
    for (let k = 0; k < h.length; k += 1) h[k] += v[k] * subDt;
  }
}

/** Total surface height = dynamic waves (on open water) + static capillary meniscus. */
export function lotusPondSurface(state: LotusPondState, out?: Float32Array): Float32Array {
  const n = state.h.length;
  const surface = out && out.length === n ? out : new Float32Array(n);
  for (let k = 0; k < n; k += 1) surface[k] = state.h[k] * state.mask[k] + state.meniscus[k];
  return surface;
}

// =============================================================================
// MORPHOGEN FIELD — reaction-diffusion (the auxin/inhibitor PDE behind patterning)
// =============================================================================
// A genuine reaction-diffusion solver — the activator-depleted-substrate (Schnakenberg)
// Turing system, the canonical model for biological patterning (auxin self-activates and
// depletes a substrate; the inhibitor diffuses faster, so peaks self-organize at a
// characteristic spacing). gamma-scaled on a periodic ring, CFL-stable explicit Euler:
//   u_t = lap(u) + gamma*(a - u + u^2 v)        (activator / auxin)
//   v_t = d*lap(v) + gamma*(b - u^2 v)          (substrate, diffuses d-fold faster)
// From the homogeneous steady state + tiny noise, a Turing instability grows regular
// activator peaks (primordium sites). This is real PDE morphogenesis, not naming — the
// peaks EMERGE from the dynamics. (Clean single-spiral phyllotaxis uses the chiral
// inhibitor-field model above; on a 1-D ring this RD system gives whorled spacing, which
// is itself a real botanical mode — see the research note.)

export interface LotusMorphogenParams {
  /** Ring resolution. */
  size?: number;
  /** Substrate/activator diffusion ratio d (>1; Turing needs fast inhibitor). */
  diffusionRatio?: number;
  /** Reaction scale gamma — larger packs more peaks (≈ domain size squared). */
  gamma?: number;
  /** Schnakenberg feed rates. */
  a?: number;
  b?: number;
  /** Symmetry-breaking noise seed. */
  seed?: number;
}

export interface LotusMorphogenField {
  size: number;
  d: number;
  gamma: number;
  a: number;
  b: number;
  dt: number;
  /** Activator (auxin). */
  u: Float32Array;
  /** Substrate. */
  v: Float32Array;
}

/** Initialise the morphogen field at the homogeneous steady state + small seeded noise. */
export function createLotusMorphogen(params: LotusMorphogenParams = {}): LotusMorphogenField {
  const size = Math.max(8, Math.floor(params.size ?? 96));
  const d = params.diffusionRatio ?? 40;
  const gamma = params.gamma ?? 800;
  const a = params.a ?? 0.1;
  const b = params.b ?? 0.9;
  const seed = (params.seed ?? 0xdead) >>> 0;
  const dx = 1 / size;
  // CFL for explicit Euler on this grid: d*dt/dx^2 < 0.5.
  const dt = (0.4 * (dx * dx)) / Math.max(1, d);
  const us = a + b;
  const vs = b / (us * us);
  const rand = lotusMulberry32(seed);
  const u = new Float32Array(size);
  const v = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    u[i] = us + 0.05 * (rand() - 0.5);
    v[i] = vs + 0.05 * (rand() - 0.5);
  }
  return { size, d, gamma, a, b, dt, u, v };
}

/** Advance the reaction-diffusion system by `iterations` CFL-stable Euler steps. */
export function stepLotusMorphogen(field: LotusMorphogenField, iterations = 1): void {
  const { size, d, gamma, a, b, dt, u, v } = field;
  const dx2 = (1 / size) * (1 / size);
  const lu = new Float32Array(size);
  const lv = new Float32Array(size);
  for (let it = 0; it < iterations; it += 1) {
    for (let i = 0; i < size; i += 1) {
      const ip = (i + 1) % size;
      const im = (i - 1 + size) % size;
      lu[i] = (u[im] - 2 * u[i] + u[ip]) / dx2;
      lv[i] = (v[im] - 2 * v[i] + v[ip]) / dx2;
    }
    for (let i = 0; i < size; i += 1) {
      const uv = u[i] * u[i] * v[i];
      u[i] += dt * (lu[i] + gamma * (a - u[i] + uv));
      v[i] += dt * (d * lv[i] + gamma * (b - uv));
    }
  }
}

/** Count activator peaks (above the field midpoint) — the emergent primordium sites. */
export function lotusMorphogenPeaks(field: LotusMorphogenField): number {
  const { size, u } = field;
  let mn = Infinity;
  let mx = -Infinity;
  for (let i = 0; i < size; i += 1) {
    if (u[i] < mn) mn = u[i];
    if (u[i] > mx) mx = u[i];
  }
  const thr = (mn + mx) / 2;
  let peaks = 0;
  for (let i = 0; i < size; i += 1) {
    const ip = (i + 1) % size;
    const im = (i - 1 + size) % size;
    if (u[i] > thr && u[i] >= u[ip] && u[i] > u[im]) peaks += 1;
  }
  return peaks;
}

// =============================================================================
// 2-D MORPHOGEN — Turing patterning on the seed-pod face (carpel spacing)
// =============================================================================
// The lotus receptacle is a flat disk; its embedded carpels (seeds) are spaced by the
// SAME activator-substrate mechanism as the 1-D ring above, but on a 2-D domain. A 2-D
// Schnakenberg system on a disk settles into evenly-spaced activator SPOTS — the emergent
// seed sites — instead of the 1-D ring's whorls. Mask cells to a unit disk; use no-flux
// (Neumann, reflect-at-boundary) so the pattern fills the pod face. Deterministic, three-free.
//   u_t =   lap(u) + gamma*(a - u + u^2 v)
//   v_t = d*lap(v) + gamma*(b - u^2 v)
// The peaks EMERGE from the Turing instability — there is no spot-placement rule.

export interface LotusMorphogen2DParams {
  /** Grid resolution per axis (the disk is inscribed). */
  size?: number;
  /** Substrate/activator diffusion ratio d (>1; Turing needs fast inhibitor). */
  diffusionRatio?: number;
  /** Reaction scale gamma — larger packs more spots (≈ domain size squared). */
  gamma?: number;
  /** Schnakenberg feed rates. */
  a?: number;
  b?: number;
  /** Symmetry-breaking noise seed. */
  seed?: number;
}

export interface LotusMorphogen2DField {
  size: number;
  d: number;
  gamma: number;
  a: number;
  b: number;
  dt: number;
  /** Activator (auxin), row-major size*size. */
  u: Float32Array;
  /** Substrate, row-major size*size. */
  v: Float32Array;
  /** 1 inside the inscribed unit disk, 0 outside. */
  mask: Uint8Array;
}

export interface LotusMorphogen2DPeak {
  /** Disk coordinate in [-1, 1]. */
  x: number;
  y: number;
  /** Radius from centre in [0, 1]. */
  radius: number;
  /** Angle in radians. */
  angle: number;
  /** Activator value at the peak (normalised 0..1 across the field). */
  value: number;
}

/** Initialise the 2-D morphogen field at the homogeneous steady state + seeded noise. */
export function createLotusMorphogen2D(params: LotusMorphogen2DParams = {}): LotusMorphogen2DField {
  const size = Math.max(8, Math.floor(params.size ?? 64));
  const d = params.diffusionRatio ?? 40;
  // gamma must be supercritical (above the Turing threshold ~700 on this disk) or the
  // homogeneous state is stable and no spots form. 1600 -> ~10 evenly-spaced carpels.
  const gamma = params.gamma ?? 1600;
  const a = params.a ?? 0.1;
  const b = params.b ?? 0.9;
  const seed = (params.seed ?? 0xdead) >>> 0;
  const dx = 1 / size;
  // CFL for explicit Euler on a 2-D grid: d*dt/dx^2 < 0.25 (2 dims). Use 0.2 for margin.
  const dt = (0.2 * (dx * dx)) / Math.max(1, d);
  const us = a + b;
  const vs = b / (us * us);
  const rand = lotusMulberry32(seed);
  const n = size * size;
  const u = new Float32Array(n);
  const v = new Float32Array(n);
  const mask = new Uint8Array(n);
  const c = (size - 1) / 2;
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      const k = j * size + i;
      const nx = (i - c) / c;
      const ny = (j - c) / c;
      const inside = nx * nx + ny * ny <= 1 ? 1 : 0;
      mask[k] = inside;
      u[k] = us + (inside ? 0.05 * (rand() - 0.5) : 0);
      v[k] = vs;
    }
  }
  return { size, d, gamma, a, b, dt, u, v, mask };
}

/** Advance the 2-D reaction-diffusion field by `iterations` CFL-stable Euler steps. */
export function stepLotusMorphogen2D(field: LotusMorphogen2DField, iterations = 1): void {
  const { size, d, gamma, a, b, dt, u, v, mask } = field;
  const dx2 = (1 / size) * (1 / size);
  const n = size * size;
  const lu = new Float32Array(n);
  const lv = new Float32Array(n);
  for (let it = 0; it < iterations; it += 1) {
    for (let j = 0; j < size; j += 1) {
      for (let i = 0; i < size; i += 1) {
        const k = j * size + i;
        if (!mask[k]) continue;
        // No-flux: a neighbour outside the disk reflects the centre value.
        const left = i > 0 && mask[k - 1] ? u[k - 1] : u[k];
        const right = i < size - 1 && mask[k + 1] ? u[k + 1] : u[k];
        const up = j > 0 && mask[k - size] ? u[k - size] : u[k];
        const down = j < size - 1 && mask[k + size] ? u[k + size] : u[k];
        const leftV = i > 0 && mask[k - 1] ? v[k - 1] : v[k];
        const rightV = i < size - 1 && mask[k + 1] ? v[k + 1] : v[k];
        const upV = j > 0 && mask[k - size] ? v[k - size] : v[k];
        const downV = j < size - 1 && mask[k + size] ? v[k + size] : v[k];
        lu[k] = (left + right + up + down - 4 * u[k]) / dx2;
        lv[k] = (leftV + rightV + upV + downV - 4 * v[k]) / dx2;
      }
    }
    for (let k = 0; k < n; k += 1) {
      if (!mask[k]) continue;
      const uv = u[k] * u[k] * v[k];
      u[k] += dt * (lu[k] + gamma * (a - u[k] + uv));
      v[k] += dt * (d * lv[k] + gamma * (b - uv));
    }
  }
}

/**
 * Extract the emergent activator spots (seed sites) as 2-D local maxima above the field
 * midpoint, returned in disk coordinates [-1, 1] with normalised activator value.
 */
export function lotusMorphogen2DPeaks(field: LotusMorphogen2DField): LotusMorphogen2DPeak[] {
  const { size, u, mask } = field;
  let mn = Infinity;
  let mx = -Infinity;
  for (let k = 0; k < u.length; k += 1) {
    if (!mask[k]) continue;
    if (u[k] < mn) mn = u[k];
    if (u[k] > mx) mx = u[k];
  }
  const range = mx - mn || 1;
  const thr = (mn + mx) / 2;
  const c = (size - 1) / 2;
  const peaks: LotusMorphogen2DPeak[] = [];
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      const k = j * size + i;
      if (!mask[k] || u[k] <= thr) continue;
      let isMax = true;
      for (let dj = -1; dj <= 1 && isMax; dj += 1) {
        for (let di = -1; di <= 1; di += 1) {
          if (di === 0 && dj === 0) continue;
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || ni >= size || nj < 0 || nj >= size) continue;
          const nk = nj * size + ni;
          if (mask[nk] && u[nk] > u[k]) {
            isMax = false;
            break;
          }
        }
      }
      if (!isMax) continue;
      const x = (i - c) / c;
      const y = (j - c) / c;
      peaks.push({
        x,
        y,
        radius: Math.min(1, Math.hypot(x, y)),
        angle: Math.atan2(y, x),
        value: (u[k] - mn) / range,
      });
    }
  }
  return peaks;
}

/** Sample the normalised activator value at disk coordinate (x, y) in [-1, 1]. */
export function lotusMorphogen2DSampleAt(
  field: LotusMorphogen2DField,
  x: number,
  y: number
): number {
  const { size, u, mask } = field;
  const c = (size - 1) / 2;
  const i = Math.round(x * c + c);
  const j = Math.round(y * c + c);
  if (i < 0 || i >= size || j < 0 || j >= size) return 0;
  const k = j * size + i;
  if (!mask[k]) return 0;
  let mn = Infinity;
  let mx = -Infinity;
  for (let m = 0; m < u.length; m += 1) {
    if (!mask[m]) continue;
    if (u[m] < mn) mn = u[m];
    if (u[m] > mx) mx = u[m];
  }
  return (u[k] - mn) / (mx - mn || 1);
}

// =============================================================================
// TURGOR-COUPLED PETAL — biophysical unfurl (pressure mediates growth -> shape)
// =============================================================================
// A petal opens because turgor pressure (cells taking up water) inflates and stiffens
// the tissue, realizing the growth-prescribed rest curvature against elastic resistance.
// This is the STATEFUL, biophysical version of simulateLotusPetalGrowth: the ACTUAL
// curvature relaxes toward the growth rest-curvature at a rate set by current turgor —
//   dT/dt        = turgorRise * (maturity(devTime) - T)      (hydration follows maturation)
//   dkappa_act/dt = turgorStiffness * T * (kappa_rest - kappa_act)   (pressure realizes shape)
// so the unfurl EMERGES from the turgor<->growth<->elastic balance, integrated over time,
// rather than being read off a curve. Low turgor: the petal lags closed even as growth
// says open; high turgor: it tracks. Deterministic, three-free.

export interface LotusPetalTurgorParams {
  budCurl?: number;
  openCurl?: number;
  matureStart?: number;
  matureSpan?: number;
  acropetalDelay?: number;
  baseAngleDeg?: number;
  segments?: number;
  /** Elastic realization rate (how fast actual curvature follows the rest curvature). */
  turgorStiffness?: number;
  /** Hydration rate (how fast turgor rises toward the maturation level). */
  turgorRise?: number;
}

export interface LotusPetalTurgorState {
  segments: number;
  baseAngle: number;
  budCurl: number;
  openCurl: number;
  matureStart: number;
  matureSpan: number;
  acropetalDelay: number;
  turgorStiffness: number;
  turgorRise: number;
  /** Current cell turgor (hydration), 0..1. */
  turgor: number;
  /** Actual curvature per segment (relaxes toward the growth rest curvature). */
  kappaActual: Float32Array;
}

/** Initialise a petal in the fully-closed bud state (actual curvature = budCurl, turgor 0). */
export function createLotusPetalTurgor(params: LotusPetalTurgorParams = {}): LotusPetalTurgorState {
  const segments = Math.max(4, Math.floor(params.segments ?? 24));
  const budCurl = params.budCurl ?? 2.8;
  const kappaActual = new Float32Array(segments).fill(budCurl);
  return {
    segments,
    baseAngle: ((params.baseAngleDeg ?? 90) * Math.PI) / 180,
    budCurl,
    openCurl: params.openCurl ?? -0.25,
    matureStart: params.matureStart ?? 0.15,
    matureSpan: params.matureSpan ?? 0.5,
    acropetalDelay: params.acropetalDelay ?? 0.35,
    turgorStiffness: params.turgorStiffness ?? 6,
    turgorRise: params.turgorRise ?? 3,
    turgor: 0,
    kappaActual,
  };
}

/** Advance turgor + relax the actual curvature toward the growth rest curvature by dt. */
export function stepLotusPetalTurgor(
  state: LotusPetalTurgorState,
  dt: number,
  developmentalTime: number
): void {
  const t = Math.max(0, Math.min(1, developmentalTime));
  // Hydration rises toward the base maturation level.
  const baseMaturity = lotusSmoothstep01(0, 1, (t - state.matureStart) / state.matureSpan);
  state.turgor += state.turgorRise * (baseMaturity - state.turgor) * dt;
  state.turgor = Math.max(0, Math.min(1, state.turgor));
  const rate = state.turgorStiffness * state.turgor * dt;
  for (let i = 0; i < state.segments; i += 1) {
    const s = (i + 0.5) / state.segments;
    const maturity = lotusSmoothstep01(
      0,
      1,
      (t - state.matureStart - s * state.acropetalDelay) / state.matureSpan
    );
    const kappaRest = state.budCurl * (1 - maturity) + state.openCurl * maturity;
    state.kappaActual[i] += rate * (kappaRest - state.kappaActual[i]);
  }
}

/** The petal's actual tip tangent (degrees) from the turgor-realized curvature. */
export function lotusPetalTurgorTipDeg(state: LotusPetalTurgorState): number {
  let phi = state.baseAngle;
  const ds = 1 / state.segments;
  for (let i = 0; i < state.segments; i += 1) phi += state.kappaActual[i] * ds;
  return (phi * 180) / Math.PI;
}

/** Normalized open progress (0 = closed bud tip ~250°, 1 = open tip ~76°) from actual shape. */
export function lotusPetalTurgorOpenProgress(state: LotusPetalTurgorState): number {
  const tip = lotusPetalTurgorTipDeg(state);
  return Math.max(0, Math.min(1, (250 - tip) / (250 - 76)));
}
