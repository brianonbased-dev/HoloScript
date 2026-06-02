import { createContext, Suspense, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, ContactShadows } from '@react-three/drei';
import { EffectComposer, DepthOfField, Bloom, Vignette } from '@react-three/postprocessing';
import {
  LOTUS_PETAL_SHADER_CHUNKS,
  generateBotanicalNormalMap,
  generateBotanicalRoughnessMap,
} from '@holoscript/core/traits/botanical-lotus';
import type { LotusScenePetal, ProceduralTextureData } from '@holoscript/core/traits/botanical-lotus';
import { LOTUS_SCENE } from './lotus.scene.generated';
import { KeyRound, Pause, Play, RefreshCw } from 'lucide-react';
import type { Group, InstancedMesh, Mesh, MeshPhysicalMaterial } from 'three';
import { ACESFilmicToneMapping, BufferGeometry, Color, DataTexture, DoubleSide, Float32BufferAttribute, LinearFilter, LinearMipmapLinearFilter, Object3D, RepeatWrapping, RGBAFormat, SRGBColorSpace, Vector2, Vector3 } from 'three';
import type { Texture } from 'three';

// Photorealistic rendering mode: image-based lighting (HDRI) + ACES filmic tone mapping +
// physically-grounded materials replace the stylized self-glow look. Toggle via the prop so
// the original stylized "proof flower" stays available for comparison.
const PHOTOREAL = true;
// Post-processing (DoF/Bloom/Vignette) loses the WebGL context on this R3F9 + three0.182 +
// postprocessing3 combo — keep OFF until the render-target/version issue is resolved. Photoreal
// is pursued via lighting (Phase 1, on) + materials instead, which add no render-target cost.
const POST_FX = false;

type LotusBloomState = 'sealed' | 'budding' | 'blooming' | 'full' | 'wilted';
type LotusCluster = 'roots' | 'p1' | 'p2' | 'p3' | 'center';

interface LotusPetalBase {
  index: number;
  cluster: LotusCluster;
  state: LotusBloomState;
  color: string;
}

interface LotusTeamPetal extends LotusPetalBase {
  paper_id: string;
  label: string;
  venue: string;
  reason: string;
  measured: {
    hasDraft: boolean;
    stubCount: number;
    benchmarkTodoCount: number;
    otsAnchored: boolean;
    baseAnchored: boolean;
  };
}

type LotusPetal = LotusPetalBase | LotusTeamPetal;

interface LotusResponse {
  mode: 'A' | 'B';
  petals: LotusPetal[];
  readiness: {
    fullPetals: number;
    totalPetals: number;
    ready?: boolean;
  };
  metadata: {
    snapshot_at: string;
    disclosure: 'public' | 'team';
  };
}

interface PollenParticle {
  angle: number;
  radius: number;
  height: number;
  speed: number;
  size: number;
  color: string;
}

const CLUSTER_LABELS: Record<LotusCluster, string> = {
  roots: 'Roots',
  p1: 'Simulation & Agents',
  p2: 'Animation',
  p3: 'Language',
  center: 'Center',
};

const FALLBACK_COLORS: Record<LotusBloomState, string> = {
  sealed: '#261033',
  budding: '#7c3aed',
  blooming: '#a855f7',
  full: '#d946ef',
  wilted: '#ef4444',
};

// All scene structure (petals, placement, rings, palette, PBR, bloom) is COMPILED
// from examples/lotus-flower/garden.seedable.holo into LOTUS_SCENE by
// scripts/compile-lotus-scene.mts. This renderer owns none of it — it draws the
// compiled HoloScript scene. To change the flower, edit the .holo (or the
// @holoscript/core botanical_lotus trait) and run `pnpm lotus:build`.
const GROWTH_SECONDS = LOTUS_SCENE.growth_seconds;
const LOTUS_SEED = Number.parseInt(LOTUS_SCENE.seed, 16) >>> 0;
const GrowthProgressContext = createContext<MutableRefObject<number> | null>(null);
const BOTANICAL_PBR = LOTUS_SCENE.material;
const PETAL_RENDER_MATERIAL = {
  roughness: BOTANICAL_PBR.roughness,
  transmission: BOTANICAL_PBR.transmission,
  thickness: Math.max(0.1, BOTANICAL_PBR.thickness),
  ior: BOTANICAL_PBR.ior,
  subsurfaceScattering: BOTANICAL_PBR.subsurface_scattering,
  subsurfaceRadiusRgb: BOTANICAL_PBR.subsurface_radius_rgb,
  veinNormalIntensity: BOTANICAL_PBR.vein_normal_intensity,
  sheen: BOTANICAL_PBR.sheen,
  sheenRoughness: BOTANICAL_PBR.sheen_roughness,
  sheenColor: BOTANICAL_PBR.sheen_color,
} as const;

const REFERENCE_LOTUS_COLORS = {
  petalBase: LOTUS_SCENE.colors.petal_base,
  petalMid: LOTUS_SCENE.colors.petal_mid,
  petalInner: LOTUS_SCENE.colors.petal_inner,
  petalRim: LOTUS_SCENE.colors.petal_rim,
  petalShadow: LOTUS_SCENE.colors.petal_shadow,
  stamen: LOTUS_SCENE.colors.stamen,
  stamenTip: LOTUS_SCENE.colors.stamen_tip,
  seedPod: LOTUS_SCENE.colors.seed_pod,
  seedPodRim: LOTUS_SCENE.colors.seed_pod_rim,
  leaf: LOTUS_SCENE.colors.leaf,
  leafDark: LOTUS_SCENE.colors.leaf_dark,
  water: LOTUS_SCENE.colors.water,
} as const;

// Real normal + roughness maps — the highest-leverage realism gap — are GENERATED
// by the @holoscript/core botanical_lotus trait (deterministic, asset-free). This
// renderer only wraps the core-emitted RGBA data in a three DataTexture; it does
// not synthesize textures itself.
function toDataTexture(src: ProceduralTextureData): DataTexture {
  const tex = new DataTexture(src.data, src.width, src.height, RGBAFormat);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

const PETAL_NORMAL_MAP = toDataTexture(
  generateBotanicalNormalMap({ pattern: 'petal_veins', seed: LOTUS_SEED, size: 512, strength: 1.7 })
);
const PETAL_ROUGHNESS_MAP = toDataTexture(
  generateBotanicalRoughnessMap({ seed: LOTUS_SEED ^ 0x5a5a, base: 0.62, variance: 0.26, scale: 12 })
);
const LEAF_NORMAL_MAP = toDataTexture(
  generateBotanicalNormalMap({ pattern: 'leaf_radial', seed: LOTUS_SEED ^ 0x1eaf, size: 512, strength: 1.5 })
);
const LEAF_ROUGHNESS_MAP = toDataTexture(
  generateBotanicalRoughnessMap({ seed: LOTUS_SEED ^ 0x1eef, base: 0.78, variance: 0.22, scale: 9 })
);
const STALK_NORMAL_MAP = toDataTexture(
  generateBotanicalNormalMap({ pattern: 'stalk_fiber', seed: LOTUS_SEED ^ 0x57a1, strength: 1.4 })
);
const STALK_ROUGHNESS_MAP = toDataTexture(
  generateBotanicalRoughnessMap({ seed: LOTUS_SEED ^ 0x57ff, base: 0.7, variance: 0.24, scale: 14 })
);

interface LotusPetalShaderUniforms {
  uLotusBaseColor: { value: Color };
  uLotusMidColor: { value: Color };
  uLotusRimColor: { value: Color };
  uLotusShadowColor: { value: Color };
  uLotusSubsurfaceColor: { value: Color };
  uLotusSSS: { value: number };
  uLotusTransmissionBase: { value: number };
  uLotusTransmissionEdge: { value: number };
  uLotusVeinIntensity: { value: number };
  uLotusGrowth: { value: number };
  uLotusBloom: { value: number };
  uLotusTime: { value: number };
}

interface LotusShader {
  uniforms: Record<string, unknown>;
  vertexShader: string;
  fragmentShader: string;
}

// The petal vein + subsurface-scattering GLSL is owned by the @holoscript/core
// botanical_lotus trait (LOTUS_PETAL_SHADER_CHUNKS) — the "look" lives with the
// trait, not the renderer. This renderer only wires uniforms + splices the chunks
// into three's physical material at its #include points.

function makeLotusPetalShaderUniforms(petal: LotusScenePetal): LotusPetalShaderUniforms {
  const sss = PETAL_RENDER_MATERIAL.subsurfaceRadiusRgb;
  return {
    uLotusBaseColor: { value: new Color(REFERENCE_LOTUS_COLORS.petalBase) },
    uLotusMidColor: { value: new Color(petal.color) },
    uLotusRimColor: { value: new Color(REFERENCE_LOTUS_COLORS.petalRim) },
    uLotusShadowColor: { value: new Color(REFERENCE_LOTUS_COLORS.petalShadow) },
    uLotusSubsurfaceColor: { value: new Color(sss[0], sss[1], sss[2]) },
    uLotusSSS: { value: PETAL_RENDER_MATERIAL.subsurfaceScattering },
    uLotusTransmissionBase: { value: PETAL_RENDER_MATERIAL.transmission },
    uLotusTransmissionEdge: { value: PETAL_RENDER_MATERIAL.thickness },
    uLotusVeinIntensity: { value: PETAL_RENDER_MATERIAL.veinNormalIntensity },
    uLotusGrowth: { value: 0 },
    uLotusBloom: { value: 0 },
    uLotusTime: { value: 0 },
  };
}

function configureLotusPetalShader(shader: LotusShader, uniforms: LotusPetalShaderUniforms) {
  const chunks = LOTUS_PETAL_SHADER_CHUNKS;
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${chunks.vertexHeader}`)
    .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n${chunks.vertexWorld}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${chunks.fragmentHeader}`)
    .replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>\n${chunks.fragmentNormalInjection}`
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>\n${chunks.fragmentColorInjection}`
    )
    .replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>\n${chunks.fragmentEmissiveInjection}`
    );
}

function isTeamPetal(petal: LotusPetal): petal is LotusTeamPetal {
  return 'paper_id' in petal;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function phase(cycle: number, start: number, end: number) {
  return smoothstep((cycle - start) / Math.max(end - start, 0.0001));
}

function GrowthClock({
  paused,
  reducedMotion,
  restartKey,
  children,
}: {
  paused: boolean;
  reducedMotion: boolean;
  restartKey: number;
  children: ReactNode;
}) {
  const progressRef = useRef(reducedMotion ? 1 : 0);

  useEffect(() => {
    progressRef.current = reducedMotion ? 1 : 0;
  }, [reducedMotion, restartKey]);

  useFrame((_, delta) => {
    if (reducedMotion) {
      progressRef.current = 1;
      return;
    }
    if (!paused) progressRef.current = Math.min(1, progressRef.current + delta / GROWTH_SECONDS);
  });

  return <GrowthProgressContext.Provider value={progressRef}>{children}</GrowthProgressContext.Provider>;
}

function useGrowthProgressRef() {
  const progressRef = useContext(GrowthProgressContext);
  if (!progressRef) throw new Error('Lotus growth components must be rendered inside GrowthClock');
  return progressRef;
}

// =============================================================================
// PROCEDURAL ENVIRONMENT SURFACE DETAIL (asset-free realism)
// =============================================================================
// The pond dressing (water, lily pads, stalk) was mathematically smooth — the
// strongest "CG" tell. Rather than ship binary texture maps (which would need
// provenance anchoring), we break up the surfaces PROCEDURALLY in-shader:
// animated Fresnel water ripples, radial pad veins + waxy roughness, fibrous
// stalk ridges. Cheap value noise, no external assets, deterministic.

const ENV_NOISE_GLSL = `
float lotusHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float lotusValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = lotusHash(i);
  float b = lotusHash(i + vec2(1.0, 0.0));
  float c = lotusHash(i + vec2(0.0, 1.0));
  float d = lotusHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
`;

/** Animated Fresnel water: ripple-perturbed normals on the top face + grazing-angle reflectance. */
function patchWaterShader(shader: LotusShader, time: { value: number }) {
  shader.uniforms.uWaterTime = time;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vWaterWorld;\nvarying vec3 vWaterView;`)
    .replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>\nvWaterWorld = worldPosition.xyz;\nvWaterView = normalize(cameraPosition - worldPosition.xyz);`
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>\nuniform float uWaterTime;\nvarying vec3 vWaterWorld;\nvarying vec3 vWaterView;\n${ENV_NOISE_GLSL}`
    )
    .replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      if (normal.y > 0.4) {
        vec2 wp = vWaterWorld.xz;
        float t = uWaterTime;
        vec2 g = vec2(0.0);
        vec2 d1 = normalize(vec2(1.0, 0.55)); float ph1 = dot(wp, d1) * 2.1 + t * 1.05;
        g += d1 * cos(ph1) * 2.1 * 0.5;
        vec2 d2 = normalize(vec2(-0.7, 1.0)); float ph2 = dot(wp, d2) * 3.3 - t * 0.8;
        g += d2 * cos(ph2) * 3.3 * 0.28;
        vec2 d3 = normalize(vec2(0.3, -1.0)); float ph3 = dot(wp, d3) * 5.0 + t * 1.6;
        g += d3 * cos(ph3) * 5.0 * 0.12;
        g += (vec2(lotusValueNoise(wp * 3.0 + t * 0.2), lotusValueNoise(wp * 3.0 - t * 0.15)) - 0.5) * 1.4;
        // Meniscus: surface tension pulls a raised lip around the stalk axis (xz origin).
        float stalkDist = length(wp);
        float lip = smoothstep(0.20, 0.07, stalkDist) - smoothstep(0.07, 0.0, stalkDist) * 0.6;
        vec2 radial = stalkDist > 0.001 ? normalize(wp) : vec2(0.0);
        g += radial * lip * 5.5;
        normal = normalize(normal + vec3(-g.x, 0.0, -g.y) * 0.085);
      }`
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      // Wetting line: the water darkens + wets where the stalk pierces the surface.
      float lotusWet = smoothstep(0.22, 0.05, length(vWaterWorld.xz));
      diffuseColor.rgb *= mix(1.0, 0.5, lotusWet);`
    )
    .replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      // Fresnel grazing-angle reflectance: the water is ~horizontal, so use the view
      // angle to world-up directly (geometric normal isn't defined this early in the
      // fragment chain). Shallow angles go near-mirror, head-on stays matte/dark.
      float lotusFres = pow(1.0 - clamp(dot(normalize(vWaterView), vec3(0.0, 1.0, 0.0)), 0.0, 1.0), 3.0);
      float lotusWetRough = smoothstep(0.22, 0.05, length(vWaterWorld.xz));
      roughnessFactor = mix(roughnessFactor, 0.02, max(lotusFres * 0.7, lotusWetRough * 0.9));`
    );
}

// Pad + stalk surface detail now comes from the core-generated normal + roughness
// maps (generateBotanicalNormalMap 'leaf_radial' / 'stalk_fiber'), bound directly
// on the materials — no hand-written renderer shader needed for those.

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function createReferencePetalGeometry(petal: LotusScenePetal): BufferGeometry {
  const lengthSegments = 58;
  const widthSegments = 24;
  const positions: number[] = [];
  const colors: number[] = [];
  const petalUvs: number[] = [];
  const veinPhases: number[] = [];
  const indices: number[] = [];
  const base = new Color(REFERENCE_LOTUS_COLORS.petalBase);
  const mid = new Color(petal.color);
  const rim = new Color(REFERENCE_LOTUS_COLORS.petalRim);
  const shadow = new Color(REFERENCE_LOTUS_COLORS.petalShadow);
  const veinPhase = ((petal.index % 13) / 13) + petal.ringIndex * 0.017;

  for (let i = 0; i <= lengthSegments; i += 1) {
    const v = i / lengthSegments;
    const lengthTaper = Math.max(0.14, Math.sin(Math.PI * v) ** 0.45 * (0.86 + v * 0.14));
    const baseLift = Math.sin(Math.PI * v);
    const pointedTip = Math.max(0, v - 0.72) ** 2 * 0.62;

    for (let j = 0; j <= widthSegments; j += 1) {
      const u = -1 + (j / widthSegments) * 2;
      const edge = Math.abs(u);
      const edgeCurl = edge ** 2 * petal.cup * 0.08 * baseLift;
      const centerRidge = Math.max(0, 1 - edge * 1.35) * baseLift * 0.045;
      const sag = petal.gravitySag * v ** 1.7 * 0.28;
      const x = v - 0.5;
      const y = centerRidge + edgeCurl + pointedTip - sag;
      const z = u * lengthTaper * 0.5;
      const color = base
        .clone()
        .lerp(mid, smoothstep(v * 1.15))
        .lerp(rim, edge ** 2 * 0.28 + Math.max(0, v - 0.82) * 0.34)
        .lerp(shadow, petal.ring === 3 ? edge ** 3 * 0.12 : 0);

      positions.push(x, y, z);
      colors.push(color.r, color.g, color.b);
      petalUvs.push(j / widthSegments, v);
      veinPhases.push(veinPhase);
    }
  }

  const row = widthSegments + 1;
  for (let i = 0; i < lengthSegments; i += 1) {
    for (let j = 0; j < widthSegments; j += 1) {
      const a = i * row + j;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setAttribute('petalUv', new Float32BufferAttribute(petalUvs, 2));
  // Standard uv channel = petalUv so the core-generated normal/roughness maps bind.
  geometry.setAttribute('uv', new Float32BufferAttribute([...petalUvs], 2));
  geometry.setAttribute('veinPhase', new Float32BufferAttribute(veinPhases, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildPollen(): PollenParticle[] {
  const rand = seededRandom(LOTUS_SEED);
  return Array.from({ length: 92 }, (_, index) => ({
    angle: rand() * Math.PI * 2,
    radius: 0.4 + Math.sqrt(rand()) * 3.4,
    height: 0.75 + rand() * 2.7,
    speed: 0.12 + rand() * 0.34,
    size: 0.008 + rand() * 0.018,
    color: index % 7 === 0 ? '#fde68a' : '#f59e0b',
  }));
}

interface StamenSpec {
  angle: number;
  radius: number;
  length: number;
  height: number;
  tilt: number;
  headScale: number;
}

interface SeedDotSpec {
  angle: number;
  radius: number;
  size: number;
}

interface PadSpec {
  angle: number;
  radius: number;
  scale: [number, number, number];
  rotation: number;
  color: string;
}

function buildStamens(): StamenSpec[] {
  const rand = seededRandom(LOTUS_SEED ^ 0xfbbf24);
  const stamenCount = LOTUS_SCENE.stamen_filament_count;
  return Array.from({ length: stamenCount }, (_, index) => ({
    angle: (index / stamenCount) * Math.PI * 2 + (rand() - 0.5) * 0.08,
    radius: 0.18 + rand() * 0.05,
    length: 0.24 + rand() * 0.16,
    height: -0.05 + rand() * 0.1,
    tilt: 0.16 + rand() * 0.22,
    headScale: 0.018 + rand() * 0.012,
  }));
}

function buildSeedDots(): SeedDotSpec[] {
  const dots: SeedDotSpec[] = [{ angle: 0, radius: 0, size: 0.022 }];
  for (let ring = 1; ring <= 3; ring += 1) {
    const count = ring === 1 ? 7 : ring === 2 ? 12 : 18;
    for (let i = 0; i < count; i += 1) {
      dots.push({
        angle: (i / count) * Math.PI * 2 + ring * 0.19,
        radius: ring * 0.075,
        size: 0.013 + ring * 0.002,
      });
    }
  }
  return dots;
}

function buildLotusPads(): PadSpec[] {
  return [
    { angle: -0.74, radius: 2.8, scale: [1.7, 1, 1.12], rotation: 0.42, color: REFERENCE_LOTUS_COLORS.leaf },
    { angle: 0.68, radius: 3.2, scale: [1.95, 1, 1.24], rotation: -0.36, color: '#2c705d' },
    { angle: 2.28, radius: 2.5, scale: [1.45, 1, 0.95], rotation: 0.12, color: REFERENCE_LOTUS_COLORS.leafDark },
    { angle: 3.66, radius: 3.25, scale: [2.15, 1, 1.34], rotation: -0.18, color: '#2a6655' },
  ];
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return reduced;
}

function GrowthPetal({ petal, paused, reducedMotion }: { petal: LotusScenePetal; paused: boolean; reducedMotion: boolean }) {
  const progressRef = useGrowthProgressRef();
  const meshRef = useRef<Mesh>(null);
  const materialRef = useRef<MeshPhysicalMaterial>(null);
  const geometry = useMemo(() => createReferencePetalGeometry(petal), [petal]);
  const shaderUniforms = useMemo(() => makeLotusPetalShaderUniforms(petal), [petal]);
  const patchPetalShader = useMemo(
    () => (shader: LotusShader) => configureLotusPetalShader(shader, shaderUniforms),
    [shaderUniforms]
  );
  const glowColor = useMemo(() => new Color(REFERENCE_LOTUS_COLORS.petalMid), []);
  const petalNormalScale = useMemo(() => new Vector2(0.6, 0.6), []);
  // Start the buds a touch earlier so they form on the stalk as it nears full height,
  // shrinking the "bare stalk stands alone" gap.
  const delay = 0.34 + petal.index * 0.006 + petal.ring * 0.03;

  useFrame(({ clock }) => {
    if (!meshRef.current || !materialRef.current) return;
    const cycle = progressRef.current;
    const grow = phase(cycle, delay, delay + 0.22);
    const settle = phase(cycle, delay + 0.12, 1);
    const breathe = reducedMotion || paused ? 0 : Math.sin(clock.elapsedTime * 0.9 + petal.index) * 0.012;
    const radial = petal.radius * (0.1 + grow * 0.9);
    // The flower crown rides the stalk's growing TIP: while the bud is closed (grow→0)
    // each petal sits at the stalk top; as it unfurls (grow→1) it eases to its final
    // crown height. At grow=1 this collapses to the approved full-bloom pose exactly,
    // so it only fixes the mid-growth "petals bunched at the base of a tall stalk" look.
    const stalk = phase(cycle, 0.18, 0.42);
    const stalkTopY = -1.2 + stalk * 0.98 + (0.08 + stalk * 2.14) * 0.5;
    const crownLift = 0.22 + grow * petal.height - settle * petal.gravitySag;
    const lift = stalkTopY * (1 - grow) + crownLift * grow;
    // Per-ring opening tune: inner rings (1,2) were staying too closed → open them further
    // (negative lean tilts them outward); the outer ring (3) drooped below horizontal → lift it
    // (positive lean) and cut its gravity droop. ringLean is applied with grow so it eases in.
    const ringLean = petal.ring === 1 ? -0.36 : petal.ring === 2 ? -0.16 : 0.32;
    const sagScale = petal.ring === 3 ? 0.28 : petal.ring === 2 ? 0.68 : 1;
    const unfurl = 0.98 - grow * (0.88 - petal.cup);
    const gravityBend = settle * petal.gravitySag * sagScale;
    const sideLean = Math.sin(clock.elapsedTime * 0.45 + petal.index) * 0.018 * grow;

    meshRef.current.position.set(Math.cos(petal.angle) * radial, lift, Math.sin(petal.angle) * radial);
    meshRef.current.rotation.set(
      0,
      -petal.angle,
      petal.cup + unfurl - gravityBend + sideLean + grow * ringLean
    );
    meshRef.current.scale.set(
      (petal.length + breathe) * grow,
      grow,
      (petal.width + breathe * 0.25) * grow
    );
    materialRef.current.opacity = 1;
    // Emissive dialed back ~45% — the inner glow now comes from the SSS scatter term
    // in the petal shader (light passing through thin edges), not lit-from-within paint.
    materialRef.current.emissiveIntensity = (petal.bloom === 'full' ? 0.12 : petal.bloom === 'sealed' ? 0.02 : 0.06) * grow;
    shaderUniforms.uLotusGrowth.value = grow;
    shaderUniforms.uLotusBloom.value = petal.bloom === 'full' ? 1 : petal.bloom === 'sealed' ? 0.28 : 0.62;
    shaderUniforms.uLotusTime.value = clock.elapsedTime;
  });

  return (
    <mesh ref={meshRef} castShadow receiveShadow>
      <primitive object={geometry} attach="geometry" />
      <meshPhysicalMaterial
        ref={materialRef}
        color="#ffffff"
        emissive={glowColor}
        roughness={PETAL_RENDER_MATERIAL.roughness}
        metalness={0}
        clearcoat={0.08}
        clearcoatRoughness={0.7}
        transmission={PETAL_RENDER_MATERIAL.transmission}
        thickness={PETAL_RENDER_MATERIAL.thickness}
        ior={PETAL_RENDER_MATERIAL.ior}
        normalMap={PETAL_NORMAL_MAP}
        normalScale={petalNormalScale}
        roughnessMap={PETAL_ROUGHNESS_MAP}
        sheen={PETAL_RENDER_MATERIAL.sheen}
        sheenColor={PETAL_RENDER_MATERIAL.sheenColor}
        sheenRoughness={PETAL_RENDER_MATERIAL.sheenRoughness}
        transparent
        opacity={1}
        side={DoubleSide}
        vertexColors
        onBeforeCompile={patchPetalShader}
      />
    </mesh>
  );
}

function SeedPodDots() {
  const dots = useMemo(buildSeedDots, []);

  return (
    <>
      {dots.map((dot, index) => (
        <mesh
          key={index}
          position={[
            Math.cos(dot.angle) * dot.radius,
            0.246,
            Math.sin(dot.angle) * dot.radius,
          ]}
          scale={dot.size}
          castShadow
        >
          <sphereGeometry args={[1, 10, 8]} />
          <meshStandardMaterial color="#d79f1c" emissive="#facc15" emissiveIntensity={0.06} roughness={0.58} />
        </mesh>
      ))}
    </>
  );
}

function StamenFilaments() {
  const stamens = useMemo(buildStamens, []);
  const filamentRef = useRef<InstancedMesh>(null);
  const headRef = useRef<InstancedMesh>(null);
  const matrixObject = useMemo(() => new Object3D(), []);

  useEffect(() => {
    if (!filamentRef.current || !headRef.current) return;
    stamens.forEach((stamen, index) => {
      const filamentCenter = stamen.radius + stamen.length * 0.46;
      matrixObject.position.set(
        Math.cos(stamen.angle) * filamentCenter,
        stamen.height,
        Math.sin(stamen.angle) * filamentCenter
      );
      matrixObject.rotation.set(0, -stamen.angle, Math.PI / 2 - stamen.tilt);
      matrixObject.scale.set(1, stamen.length, 1);
      matrixObject.updateMatrix();
      filamentRef.current?.setMatrixAt(index, matrixObject.matrix);

      const headRadius = stamen.radius + stamen.length * 0.92;
      matrixObject.position.set(
        Math.cos(stamen.angle) * headRadius,
        stamen.height + Math.sin(stamen.tilt) * stamen.length * 0.42,
        Math.sin(stamen.angle) * headRadius
      );
      matrixObject.rotation.set(0, -stamen.angle, 0);
      matrixObject.scale.setScalar(stamen.headScale);
      matrixObject.updateMatrix();
      headRef.current?.setMatrixAt(index, matrixObject.matrix);
    });
    filamentRef.current.instanceMatrix.needsUpdate = true;
    headRef.current.instanceMatrix.needsUpdate = true;
  }, [matrixObject, stamens]);

  return (
    <>
      <instancedMesh ref={filamentRef} args={[undefined, undefined, stamens.length]} castShadow>
        <cylinderGeometry args={[0.006, 0.009, 1, 8]} />
        <meshStandardMaterial
          color={REFERENCE_LOTUS_COLORS.stamen}
          emissive="#f97316"
          emissiveIntensity={0.1}
          roughness={0.48}
        />
      </instancedMesh>
      <instancedMesh ref={headRef} args={[undefined, undefined, stamens.length]} castShadow>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color={REFERENCE_LOTUS_COLORS.stamenTip} emissive="#fef3c7" emissiveIntensity={0.12} roughness={0.5} />
      </instancedMesh>
    </>
  );
}

function LotusPadField() {
  const pads = useMemo(buildLotusPads, []);
  const padNormalScale = useMemo(() => new Vector2(0.7, 0.7), []);

  return (
    <>
      {pads.map((pad, index) => (
        <mesh
          key={index}
          position={[Math.cos(pad.angle) * pad.radius, -1.27 - index * 0.006, Math.sin(pad.angle) * pad.radius]}
          rotation={[-Math.PI / 2, 0, pad.rotation]}
          scale={pad.scale}
          receiveShadow
        >
          <circleGeometry args={[1, 128]} />
          {/* Radial veins + waxy roughness come from the core-generated leaf normal +
              roughness maps (botanical_lotus trait) — not a hand-written shader. */}
          <meshStandardMaterial
            color={pad.color}
            roughness={0.82}
            metalness={0}
            side={DoubleSide}
            normalMap={LEAF_NORMAL_MAP}
            normalScale={padNormalScale}
            roughnessMap={LEAF_ROUGHNESS_MAP}
          />
        </mesh>
      ))}
    </>
  );
}

function SeedAndStalk({ paused, reducedMotion }: { paused: boolean; reducedMotion: boolean }) {
  const progressRef = useGrowthProgressRef();
  const seedRef = useRef<Group>(null);
  const seedLeftRef = useRef<Mesh>(null);
  const seedRightRef = useRef<Mesh>(null);
  const stalkRef = useRef<Mesh>(null);
  const centerRef = useRef<Group>(null);
  const leafLeftRef = useRef<Mesh>(null);
  const leafRightRef = useRef<Mesh>(null);
  const lightColumnRef = useRef<Mesh>(null);
  const stalkNormalScale = useMemo(() => new Vector2(0.8, 1.2), []);

  useFrame(({ clock }) => {
    const cycle = progressRef.current;
    const sprout = phase(cycle, 0.1, 0.28);
    const stalk = phase(cycle, 0.18, 0.42);
    // Rise the seed-pod/stamen center IN SYNC with the petals (they unfurl ~0.42→0.99) so it
    // stays nested in the cup instead of detaching upward mid-growth.
    const center = phase(cycle, 0.44, 0.95);
    const seedOpen = phase(cycle, 0.04, 0.2);
    const genesis = phase(cycle, 0.78, 1) * 0.004;

    if (seedRef.current) {
      seedRef.current.position.y = -1.08 + seedOpen * 0.08;
      seedRef.current.scale.setScalar(Math.max(0.02, 1 - seedOpen * 0.95));
      seedRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.5) * 0.05;
    }
    if (seedLeftRef.current) {
      seedLeftRef.current.position.set(-0.08 - seedOpen * 0.14, 0, 0);
      seedLeftRef.current.rotation.set(0.24, 0.02, -0.25 - seedOpen * 0.42);
    }
    if (seedRightRef.current) {
      seedRightRef.current.position.set(0.08 + seedOpen * 0.14, 0, 0);
      seedRightRef.current.rotation.set(-0.18, -0.02, 0.25 + seedOpen * 0.42);
    }
    if (stalkRef.current) {
      stalkRef.current.position.y = -1.2 + stalk * 0.98;
      stalkRef.current.scale.set(1, 0.08 + stalk * 2.14, 1);
    }
    if (centerRef.current) {
      // Nest lower (1.18 vs 1.49) so the pod sits inside the petal crown, not above it; gentle
      // sway instead of a continuous unnatural spin.
      centerRef.current.position.y = -0.4 + center * 1.58;
      centerRef.current.scale.setScalar(0.04 + center * 0.58);
      centerRef.current.rotation.y = reducedMotion || paused ? 0 : Math.sin(clock.elapsedTime * 0.3) * 0.09;
    }
    if (leafLeftRef.current) {
      leafLeftRef.current.position.set(-0.22 - sprout * 0.42, -0.52 + sprout * 0.42, 0.04);
      leafLeftRef.current.rotation.set(0.2, 0.15, 0.72 - sprout * 0.22);
      leafLeftRef.current.scale.set(0.36 * sprout, 0.055, 0.14 * sprout);
    }
    if (leafRightRef.current) {
      leafRightRef.current.position.set(0.22 + sprout * 0.42, -0.42 + sprout * 0.36, -0.04);
      leafRightRef.current.rotation.set(-0.12, -0.15, -0.72 + sprout * 0.22);
      leafRightRef.current.scale.set(0.34 * sprout, 0.055, 0.13 * sprout);
    }
    if (lightColumnRef.current) {
      lightColumnRef.current.scale.set(0.14 + genesis * 0.5, 1 + genesis * 4.5, 0.14 + genesis * 0.5);
      lightColumnRef.current.position.y = 1.8 + genesis * 2;
      const material = lightColumnRef.current.material;
      if (!Array.isArray(material)) material.opacity = genesis;
    }
  });

  return (
    <group>
      <group ref={seedRef}>
        <mesh ref={seedLeftRef} castShadow>
          <sphereGeometry args={[0.26, 32, 16]} />
          <meshStandardMaterial color="#9a5d24" emissive="#f59e0b" emissiveIntensity={0.18} roughness={0.75} metalness={0.02} />
        </mesh>
        <mesh ref={seedRightRef} castShadow>
          <sphereGeometry args={[0.26, 32, 16]} />
          <meshStandardMaterial color="#6f3f1d" emissive="#f97316" emissiveIntensity={0.14} roughness={0.8} metalness={0.02} />
        </mesh>
      </group>

      <mesh ref={stalkRef} castShadow>
        <cylinderGeometry args={[0.045, 0.085, 1, 48, 8]} />
        {/* Fibrous ridges + roughness from the core-generated stalk maps (botanical_lotus
            trait); desaturated + de-glowed so it reads as a stem, not saturated marzipan. */}
        <meshStandardMaterial
          color="#43702f"
          emissive="#0c3b22"
          emissiveIntensity={0.03}
          roughness={0.74}
          normalMap={STALK_NORMAL_MAP}
          normalScale={stalkNormalScale}
          roughnessMap={STALK_ROUGHNESS_MAP}
        />
      </mesh>

      <mesh ref={leafLeftRef} castShadow>
        <sphereGeometry args={[1, 32, 16]} />
        <meshStandardMaterial color={REFERENCE_LOTUS_COLORS.leaf} emissive="#14532d" emissiveIntensity={0.03} roughness={0.8} normalMap={LEAF_NORMAL_MAP} normalScale={stalkNormalScale} roughnessMap={LEAF_ROUGHNESS_MAP} />
      </mesh>
      <mesh ref={leafRightRef} castShadow>
        <sphereGeometry args={[1, 32, 16]} />
        <meshStandardMaterial color="#2d745e" emissive="#14532d" emissiveIntensity={0.03} roughness={0.8} normalMap={LEAF_NORMAL_MAP} normalScale={stalkNormalScale} roughnessMap={LEAF_ROUGHNESS_MAP} />
      </mesh>

      <group ref={centerRef}>
        <StamenFilaments />
        <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.33, 0.26, 0.28, 64]} />
          <meshPhysicalMaterial
            color={REFERENCE_LOTUS_COLORS.seedPod}
            emissive="#f59e0b"
            emissiveIntensity={0.04}
            roughness={0.52}
            clearcoat={0.14}
            clearcoatRoughness={0.58}
          />
        </mesh>
        <mesh position={[0, 0.205, 0]} castShadow>
          <cylinderGeometry args={[0.335, 0.335, 0.028, 64]} />
          <meshStandardMaterial color={REFERENCE_LOTUS_COLORS.seedPodRim} emissive="#bef264" emissiveIntensity={0.03} roughness={0.58} />
        </mesh>
        <SeedPodDots />
      </group>

      <mesh ref={lightColumnRef}>
        <cylinderGeometry args={[1, 1, 1, 48, 1, true]} />
        <meshBasicMaterial color="#fef3c7" transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function PollenField({ paused, reducedMotion }: { paused: boolean; reducedMotion: boolean }) {
  const progressRef = useGrowthProgressRef();
  const groupRef = useRef<Group>(null);
  const particles = useMemo(buildPollen, []);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const pollen = phase(progressRef.current, 0.46, 0.82);
    groupRef.current.visible = pollen > 0.02;
    groupRef.current.scale.setScalar(0.18 + pollen * 0.82);
    if (!reducedMotion && !paused) groupRef.current.rotation.y = clock.elapsedTime * 0.045;
  });

  return (
    <group ref={groupRef} scale={0} visible={false}>
      {particles.map((particle, index) => (
        <mesh
          key={index}
          position={[
            Math.cos(particle.angle) * particle.radius,
            particle.height + Math.sin(index * 0.7) * 0.16,
            Math.sin(particle.angle) * particle.radius,
          ]}
          scale={particle.size}
        >
          <sphereGeometry args={[1, 8, 6]} />
          <meshBasicMaterial color={particle.color} transparent opacity={0.28} />
        </mesh>
      ))}
    </group>
  );
}

function PondWater({ paused, reducedMotion }: { paused: boolean; reducedMotion: boolean }) {
  const timeRef = useRef({ value: 0 });
  const patch = useMemo(
    () => (shader: LotusShader) => patchWaterShader(shader, timeRef.current),
    []
  );
  useFrame(({ clock }) => {
    if (!reducedMotion && !paused) timeRef.current.value = clock.elapsedTime;
  });
  return (
    <mesh position={[0, -1.34, 0]} receiveShadow>
      {/* Higher radial density so the rippled normals read smoothly at the rim. */}
      <cylinderGeometry args={[3.8, 4.4, 0.12, 160]} />
      {/* Dark glossy IBL water: animated Fresnel ripples (patchWaterShader) break up
          the mirror-flat reflection — grazing angles go near-mirror, head-on stays dark. */}
      <meshPhysicalMaterial
        color="#071712"
        roughness={0.07}
        metalness={0}
        clearcoat={1}
        clearcoatRoughness={0.08}
        reflectivity={0.6}
        envMapIntensity={1.4}
        transmission={0}
        transparent={false}
        opacity={1}
        onBeforeCompile={patch}
      />
    </mesh>
  );
}

function LotusWorld({
  paused,
  reducedMotion,
  restartKey,
}: {
  paused: boolean;
  reducedMotion: boolean;
  restartKey: number;
}) {
  const rootRef = useRef<Group>(null);
  const petals = LOTUS_SCENE.petals;

  useFrame(({ clock }) => {
    if (!rootRef.current || reducedMotion || paused) return;
    rootRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.14) * 0.08;
  });

  return (
    <>
      <color attach="background" args={['#06110d']} />
      {/* Tighter fog (near 6.5 / far 12.5) so the far pond fades into the dusk — real
          atmospheric depth on the pond instead of a flat backdrop. */}
      <fog attach="fog" args={['#06110d', 6.5, 12.5]} />
      {PHOTOREAL ? (
        <>
          {/* Image-based lighting: HDRI drives realistic reflections + soft fill on the PBR
              petals/water. Lighting only (no background) so the dramatic dark stays. */}
          <Suspense fallback={null}>
            <Environment preset="sunset" environmentIntensity={0.6} />
          </Suspense>
          <ambientLight intensity={0.2} />
          {/* Warm key sun (the realistic primary), cool rim for separation, one soft pink accent. */}
          <directionalLight position={[3.4, 6.2, 4.2]} intensity={2.4} color="#fff1dc" castShadow
            shadow-mapSize={[2048, 2048]} shadow-bias={-0.0003} />
          <directionalLight position={[-4.5, 3.0, -3.5]} intensity={0.7} color="#9ec5ff" />
          <pointLight position={[0.1, 1.05, 2.2]} color="#ffd0e6" intensity={0.55} distance={7} />
          <ContactShadows position={[0, -1.27, 0]} scale={11} blur={2.6} far={4} opacity={0.5} resolution={1024} color="#020806" />
        </>
      ) : (
        <>
          <ambientLight intensity={0.34} />
          <directionalLight position={[3.4, 5.8, 4.2]} intensity={2.05} castShadow />
          <pointLight position={[0.1, 1.05, 2.2]} color="#ff8bc4" intensity={1.55} distance={7} />
          <pointLight position={[0, 0.68, 0.2]} color="#fbbf24" intensity={0.9} distance={3.2} />
          <pointLight position={[-2.8, 0.8, -3]} color="#6ee7b7" intensity={0.42} distance={7} />
        </>
      )}

      <GrowthClock paused={paused} reducedMotion={reducedMotion} restartKey={restartKey}>
        <group ref={rootRef} position={[0, 0, 0]} rotation={[0.12, 0, 0]}>
          <PondWater paused={paused} reducedMotion={reducedMotion} />
          <LotusPadField />
          <SeedAndStalk paused={paused} reducedMotion={reducedMotion} />
          {petals.map((petal) => (
            <GrowthPetal key={petal.index} petal={petal} paused={paused} reducedMotion={reducedMotion} />
          ))}
          <PollenField paused={paused} reducedMotion={reducedMotion} />
        </group>
      </GrowthClock>
      {POST_FX && (
        // multisampling=0 + no SMAA pass: MSAA render targets are the heaviest GPU cost and
        // were losing the WebGL context. The Canvas antialias handles edges; DoF/Bloom/Vignette
        // are the photoreal-critical passes and stay.
        <EffectComposer enableNormalPass={false} multisampling={0}>
          {/* Shallow depth of field — the macro-photo cue: flower sharp, pads/water melt to bokeh */}
          <DepthOfField focusDistance={0.012} focalLength={0.028} bokehScale={3.4} height={420} />
          {/* Subtle highlight bloom on stamens / rim light — physical, not the old stylized glow */}
          <Bloom luminanceThreshold={0.85} luminanceSmoothing={0.3} intensity={0.5} mipmapBlur />
          {/* Photographic falloff to the frame edges */}
          <Vignette offset={0.28} darkness={0.6} />
        </EffectComposer>
      )}
    </>
  );
}

function ResponsiveLotusCamera() {
  const { camera, size } = useThree();

  useEffect(() => {
    const compact = size.width < 520;
    camera.position.set(0, compact ? 2.55 : 3.02, compact ? 8.1 : 6.65);
    camera.lookAt(new Vector3(0, compact ? 0.36 : 0.52, 0));
    camera.updateProjectionMatrix();
  }, [camera, size.width]);

  return null;
}

function LotusGrowthScene({
  paused,
  reducedMotion,
  restartKey,
}: {
  paused: boolean;
  reducedMotion: boolean;
  restartKey: number;
}) {
  return (
    <Canvas
      camera={{ position: [0, 3.02, 6.65], fov: 42 }}
      dpr={[1, 1.5]}
      shadows
      gl={{ antialias: true, alpha: false }}
      onCreated={({ camera, gl }) => {
        camera.lookAt(new Vector3(0, 0.52, 0));
        if (PHOTOREAL) {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.outputColorSpace = SRGBColorSpace;
        }
      }}
    >
      <ResponsiveLotusCamera />
      <LotusWorld paused={paused} reducedMotion={reducedMotion} restartKey={restartKey} />
    </Canvas>
  );
}

// When the live /api/lotus feed is unavailable — e.g. the standalone preview harness
// has no Express backend, so the fetch hits the SPA fallback and returns index.html —
// the panel falls back to the COMPILED scene so it stays self-consistent with the
// deterministic 0x0000DEAD bloom instead of showing 0s and a JSON parse error.
const SCENE_FALLBACK_RESPONSE: LotusResponse = {
  mode: 'B',
  petals: LOTUS_SCENE.petals.map((p) => ({
    index: p.index,
    cluster: p.ring === 1 ? 'p1' : p.ring === 2 ? 'p2' : 'p3',
    state: p.bloom,
    color: p.color,
  })),
  readiness: {
    fullPetals: LOTUS_SCENE.petals.filter((p) => p.bloom === 'full').length,
    totalPetals: LOTUS_SCENE.petals.length,
  },
  metadata: { snapshot_at: 'compiled:0x0000DEAD', disclosure: 'public' },
};

async function fetchLotus(signal: AbortSignal): Promise<LotusResponse> {
  const bearer = window.localStorage.getItem('holomesh_bearer')?.trim();
  const res = await fetch('/api/lotus', {
    signal,
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : undefined,
  });
  if (!res.ok) throw new Error(`Lotus API returned ${res.status}`);
  // Guard the SPA-fallback case: a dev server with no API route answers 200 with
  // index.html, which would throw an opaque "Unexpected token '<'" on .json().
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error('Lotus API returned non-JSON (no live feed)');
  }
  return res.json() as Promise<LotusResponse>;
}

export default function LotusProgram() {
  const sectionRef = useRef<HTMLElement>(null);
  const hasEnteredViewRef = useRef(false);
  // Default to the compiled scene so the panel is never empty; live /api/lotus data
  // overrides it when available.
  const [lotus, setLotus] = useState<LotusResponse>(SCENE_FALLBACK_RESPONSE);
  const [usingFallback, setUsingFallback] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sceneKey, setSceneKey] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const controller = new AbortController();
    fetchLotus(controller.signal)
      .then((data) => {
        setLotus(data);
        setUsingFallback(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        // Live feed unavailable — keep the compiled-scene snapshot (no scary error).
        setLotus(SCENE_FALLBACK_RESPONSE);
        setUsingFallback(true);
      });
    return () => controller.abort();
  }, [refreshKey]);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || hasEnteredViewRef.current) return;
        hasEnteredViewRef.current = true;
        setSceneKey((value) => value + 1);
      },
      { threshold: 0.35 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const clusterCounts = useMemo(() => {
    const counts: Record<LotusCluster, number> = { roots: 0, p1: 0, p2: 0, p3: 0, center: 0 };
    for (const petal of lotus?.petals ?? []) counts[petal.cluster]++;
    return counts;
  }, [lotus]);

  const featured = lotus?.petals.find(isTeamPetal) ?? null;

  const handleTeamKey = () => {
    const existing = window.localStorage.getItem('holomesh_bearer') ?? '';
    const next = window.prompt('Team bearer token', existing);
    if (next === null) return;
    const trimmed = next.trim();
    if (trimmed) window.localStorage.setItem('holomesh_bearer', trimmed);
    else window.localStorage.removeItem('holomesh_bearer');
    setRefreshKey((value) => value + 1);
  };

  return (
    <section ref={sectionRef} className="relative z-10 w-full overflow-hidden border-y border-white/10 bg-[#05050a] py-16 md:py-20">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(168,85,247,0.12),transparent_42%,rgba(245,158,11,0.06))]" />
      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-8 px-5 md:px-6 lg:grid-cols-[1.18fr_0.82fr]">
        <div className="relative h-[520px] min-h-[420px] overflow-hidden rounded-lg border border-white/10 bg-black shadow-[0_0_70px_rgba(168,85,247,0.16)] md:h-[640px]">
          <LotusGrowthScene paused={paused} reducedMotion={reducedMotion} restartKey={sceneKey} />
          <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-white/10 bg-black/45 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-violet-100 backdrop-blur-md">
            Seed 0x0000DEAD
          </div>
          <button
            type="button"
            onClick={() => setPaused((value) => !value)}
            title={paused ? 'Resume Lotus growth animation' : 'Pause Lotus growth animation'}
            className="absolute bottom-4 right-4 inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/15 bg-black/50 text-white backdrop-blur-md hover:bg-white/10"
          >
            {paused ? <Play size={17} /> : <Pause size={17} />}
          </button>
          <button
            type="button"
            onClick={() => setSceneKey((value) => value + 1)}
            title="Replay Lotus seed growth animation"
            className="absolute bottom-4 left-4 inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/15 bg-black/50 text-white backdrop-blur-md hover:bg-white/10"
          >
            <RefreshCw size={17} />
          </button>
        </div>

        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="rounded-md border border-violet-300/30 bg-violet-400/10 px-3 py-1 text-sm font-semibold text-violet-100">
              Lotus {lotus?.mode === 'A' ? 'Team' : 'Public'}
            </span>
            <button
              type="button"
              onClick={handleTeamKey}
              title="Set team bearer token"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/15 bg-white/5 text-gray-200 hover:bg-white/10"
            >
              <KeyRound size={16} />
            </button>
            <button
              type="button"
              onClick={() => {
                setRefreshKey((value) => value + 1);
                setSceneKey((value) => value + 1);
              }}
              title="Refresh Lotus data"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/15 bg-white/5 text-gray-200 hover:bg-white/10"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          <h2 className="mb-5 text-3xl font-bold leading-tight text-white md:text-4xl">
            The seed grows into the proof flower.
          </h2>
          <p className="mb-8 max-w-2xl text-lg leading-relaxed text-gray-300">
            Lotus starts as a deterministic genesis seed, opens a stalk, and unfurls the 8/13/21 Fibonacci petal rings into a living 3D research artifact.
          </p>

          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(Object.keys(CLUSTER_LABELS) as LotusCluster[]).map((cluster) => (
              <div key={cluster} className="rounded-md border border-white/10 bg-white/[0.04] p-3">
                <div className="text-2xl font-bold text-white">{clusterCounts[cluster]}</div>
                <div className="text-xs text-gray-400">{CLUSTER_LABELS[cluster]}</div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
            <div className="mb-2 flex items-center justify-between gap-4 text-sm text-gray-300">
              <span>Bloom readiness</span>
              <span>
                {lotus?.readiness.fullPetals ?? 0}/{lotus?.readiness.totalPetals ?? 0}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-fuchsia-400"
                style={{
                  width: lotus
                    ? `${Math.round((lotus.readiness.fullPetals / Math.max(lotus.readiness.totalPetals, 1)) * 100)}%`
                    : '0%',
                }}
              />
            </div>
            {featured && (
              <p className="mt-4 text-sm leading-relaxed text-gray-300">
                {featured.label} is {featured.state}: {featured.reason}
              </p>
            )}
            {usingFallback && (
              <p className="mt-4 text-xs leading-relaxed text-gray-500">
                Showing the compiled <span className="font-mono">0x0000DEAD</span> snapshot — live feed unavailable.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
