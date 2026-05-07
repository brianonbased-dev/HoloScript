import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { createBotanicalLotusRenderProfile } from '@holoscript/core/traits/botanical-lotus';
import { KeyRound, Pause, Play, RefreshCw } from 'lucide-react';
import type { Group, InstancedMesh, Mesh, MeshPhysicalMaterial } from 'three';
import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Object3D, Vector3 } from 'three';

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

interface ScenePetal {
  index: number;
  ring: 1 | 2 | 3;
  ringIndex: number;
  angle: number;
  radius: number;
  length: number;
  width: number;
  cup: number;
  gravitySag: number;
  height: number;
  color: string;
  bloom: LotusBloomState;
  label: string;
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

const GOLDEN_ANGLE = (137.50776 * Math.PI) / 180;
const GROWTH_SECONDS = 12.5;
const LOTUS_SEED = 0x0000dead;
const GrowthProgressContext = createContext<MutableRefObject<number> | null>(null);
const BOTANICAL_LOTUS_PROFILE = createBotanicalLotusRenderProfile();
const BOTANICAL_PBR = BOTANICAL_LOTUS_PROFILE.pbr_uniforms;
const PETAL_RENDER_MATERIAL = {
  roughness: BOTANICAL_PBR.roughness,
  transmission: BOTANICAL_PBR.transmission,
  thickness: Math.max(0.1, BOTANICAL_PBR.thickness),
  ior: BOTANICAL_PBR.ior,
  subsurfaceScattering: BOTANICAL_PBR.subsurface_scattering,
  subsurfaceRadiusRgb: BOTANICAL_PBR.subsurface_radius_rgb,
  veinNormalIntensity: BOTANICAL_PBR.vein_normal_intensity,
} as const;

const REFERENCE_LOTUS_COLORS = {
  petalBase: BOTANICAL_LOTUS_PROFILE.colors.petal_base,
  petalMid: BOTANICAL_LOTUS_PROFILE.colors.petal_mid,
  petalInner: BOTANICAL_LOTUS_PROFILE.colors.petal_inner,
  petalRim: BOTANICAL_LOTUS_PROFILE.colors.petal_rim,
  petalShadow: BOTANICAL_LOTUS_PROFILE.colors.petal_shadow,
  stamen: BOTANICAL_LOTUS_PROFILE.colors.stamen,
  stamenTip: BOTANICAL_LOTUS_PROFILE.colors.stamen_tip,
  seedPod: BOTANICAL_LOTUS_PROFILE.colors.seed_pod,
  seedPodRim: BOTANICAL_LOTUS_PROFILE.colors.seed_pod_rim,
  leaf: BOTANICAL_LOTUS_PROFILE.colors.leaf,
  leafDark: BOTANICAL_LOTUS_PROFILE.colors.leaf_dark,
  water: BOTANICAL_LOTUS_PROFILE.colors.water,
} as const;

const LOTUS_RING_LAYOUT = BOTANICAL_LOTUS_PROFILE.petal_rings.map((ring, index) => {
  const ringNumber = (index + 1) as 1 | 2 | 3;
  const lengthScale = ringNumber === 1 ? 0.98 : ringNumber === 2 ? 0.94 : 0.82;
  const widthScale = ringNumber === 1 ? 1.65 : ringNumber === 2 ? 1.48 : 1.35;
  const height = ringNumber === 1 ? 1.12 : ringNumber === 2 ? 0.98 : 0.78;
  return {
    ring: ringNumber,
    count: ring.count,
    radius: ring.radius * 1.25,
    length: ring.length * lengthScale,
    width: ring.width * widthScale,
    cup: ring.cup,
    gravitySag: ring.gravity_sag,
    height,
  };
});

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

const LOTUS_PETAL_VERTEX_HEADER = `
attribute vec2 petalUv;
attribute float veinPhase;
varying vec2 vLotusPetalUv;
varying float vLotusVeinPhase;
varying vec3 vLotusWorldNormal;
varying vec3 vLotusViewDir;
`;

const LOTUS_PETAL_VERTEX_WORLD = `
vLotusPetalUv = petalUv;
vLotusVeinPhase = veinPhase;
vLotusWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
vLotusViewDir = normalize(cameraPosition - worldPosition.xyz);
`;

const LOTUS_PETAL_FRAGMENT_HEADER = `
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
`;

function makeLotusPetalShaderUniforms(petal: ScenePetal): LotusPetalShaderUniforms {
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
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${LOTUS_PETAL_VERTEX_HEADER}`)
    .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n${LOTUS_PETAL_VERTEX_WORLD}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${LOTUS_PETAL_FRAGMENT_HEADER}`)
    .replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
float lotusNormalVein = lotusVeinField(vLotusPetalUv, vLotusVeinPhase);
float lotusVeinSide = sign(vLotusPetalUv.x - 0.5);
normal = normalize(normal + vec3(
  lotusNormalVein * lotusVeinSide * uLotusVeinIntensity * 1.7,
  lotusNormalVein * uLotusVeinIntensity * 0.6,
  0.0
));`
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
float lotusEdge = abs(vLotusPetalUv.x * 2.0 - 1.0);
float lotusTip = smoothstep(0.78, 1.0, vLotusPetalUv.y);
vec3 lotusProfileColor = mix(uLotusBaseColor, uLotusMidColor, smoothstep(0.08, 0.72, vLotusPetalUv.y));
lotusProfileColor = mix(lotusProfileColor, uLotusRimColor, clamp(lotusEdge * lotusEdge * 0.42 + lotusTip * 0.35, 0.0, 0.82));
float lotusVeinColorField = lotusVeinField(vLotusPetalUv, vLotusVeinPhase);
vec3 lotusVeinColor = mix(uLotusShadowColor, uLotusRimColor, 0.58);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * lotusProfileColor, 0.62);
diffuseColor.rgb += lotusVeinColor * lotusVeinColorField * uLotusVeinIntensity * uLotusGrowth * 7.5;
diffuseColor.a *= mix(0.7, 1.0, uLotusGrowth);`
    )
    .replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
float lotusBacklight = pow(1.0 - abs(dot(normalize(vLotusWorldNormal), normalize(vLotusViewDir))), 2.15);
float lotusTranslucency = mix(uLotusTransmissionBase, uLotusTransmissionEdge, lotusEdge);
float lotusPulse = 0.92 + sin(uLotusTime * 0.65 + vLotusVeinPhase * 6.28318) * 0.08;
vec3 lotusScatter = uLotusSubsurfaceColor * lotusBacklight * lotusTranslucency * uLotusSSS * uLotusGrowth * lotusPulse;
totalEmissiveRadiance += lotusScatter * (0.28 + uLotusBloom * 0.72);`
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

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function buildSeedablePetals(): ScenePetal[] {
  let index = 0;
  const petals: ScenePetal[] = [];
  for (const ring of LOTUS_RING_LAYOUT) {
    for (let ringIndex = 0; ringIndex < ring.count; ringIndex += 1) {
      const angle = index * GOLDEN_ANGLE;
      const isRootPaper = index === 0;
      const bloom: LotusBloomState =
        ring.ring === 3 ? 'sealed' : isRootPaper ? 'full' : ring.ring === 1 ? 'budding' : 'sealed';
      petals.push({
        index,
        ring: ring.ring,
        ringIndex,
        angle,
        radius: ring.radius,
        length: ring.length,
        width: ring.width,
        cup: ring.cup,
        gravitySag: ring.gravitySag,
        height: ring.height,
        color: isRootPaper
          ? REFERENCE_LOTUS_COLORS.petalBase
          : ring.ring === 1
            ? REFERENCE_LOTUS_COLORS.petalInner
            : ring.ring === 2
              ? REFERENCE_LOTUS_COLORS.petalMid
              : '#d94b9a',
        bloom,
        label: `P${ring.ring}.${ringIndex}`,
      });
      index += 1;
    }
  }
  return petals;
}

function createReferencePetalGeometry(petal: ScenePetal): BufferGeometry {
  const lengthSegments = 34;
  const widthSegments = 12;
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
  const stamenCount = BOTANICAL_LOTUS_PROFILE.stamen_filament_count;
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

function GrowthPetal({ petal, paused, reducedMotion }: { petal: ScenePetal; paused: boolean; reducedMotion: boolean }) {
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
  const delay = 0.42 + petal.index * 0.006 + petal.ring * 0.035;

  useFrame(({ clock }) => {
    if (!meshRef.current || !materialRef.current) return;
    const cycle = progressRef.current;
    const grow = phase(cycle, delay, delay + 0.22);
    const settle = phase(cycle, delay + 0.12, 1);
    const breathe = reducedMotion || paused ? 0 : Math.sin(clock.elapsedTime * 0.9 + petal.index) * 0.012;
    const radial = petal.radius * (0.1 + grow * 0.9);
    const lift = 0.22 + grow * petal.height - settle * petal.gravitySag;
    const unfurl = 0.98 - grow * (0.88 - petal.cup);
    const gravityBend = settle * petal.gravitySag;
    const sideLean = Math.sin(clock.elapsedTime * 0.45 + petal.index) * 0.018 * grow;

    meshRef.current.position.set(Math.cos(petal.angle) * radial, lift, Math.sin(petal.angle) * radial);
    meshRef.current.rotation.set(
      0,
      -petal.angle,
      petal.cup + unfurl - gravityBend + sideLean
    );
    meshRef.current.scale.set(
      (petal.length + breathe) * grow,
      grow,
      (petal.width + breathe * 0.25) * grow
    );
    materialRef.current.opacity = 1;
    materialRef.current.emissiveIntensity = (petal.bloom === 'full' ? 0.22 : petal.bloom === 'sealed' ? 0.04 : 0.12) * grow;
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
          <meshStandardMaterial color="#d79f1c" emissive="#facc15" emissiveIntensity={0.18} roughness={0.58} />
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
          emissiveIntensity={0.24}
          roughness={0.48}
        />
      </instancedMesh>
      <instancedMesh ref={headRef} args={[undefined, undefined, stamens.length]} castShadow>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color={REFERENCE_LOTUS_COLORS.stamenTip} emissive="#fef3c7" emissiveIntensity={0.22} roughness={0.5} />
      </instancedMesh>
    </>
  );
}

function LotusPadField() {
  const pads = useMemo(buildLotusPads, []);

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
          <circleGeometry args={[1, 88]} />
          <meshStandardMaterial color={pad.color} emissive={pad.color} emissiveIntensity={0.08} roughness={0.86} side={DoubleSide} />
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

  useFrame(({ clock }) => {
    const cycle = progressRef.current;
    const sprout = phase(cycle, 0.1, 0.28);
    const stalk = phase(cycle, 0.18, 0.42);
    const center = phase(cycle, 0.34, 0.54);
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
      centerRef.current.position.y = -0.45 + center * 1.94;
      centerRef.current.scale.setScalar(0.04 + center * 0.58);
      centerRef.current.rotation.y = clock.elapsedTime * 0.3;
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
        <cylinderGeometry args={[0.045, 0.085, 1, 24]} />
        <meshStandardMaterial color="#3f7f36" emissive="#0c3b22" emissiveIntensity={0.14} roughness={0.62} />
      </mesh>

      <mesh ref={leafLeftRef} castShadow>
        <sphereGeometry args={[1, 24, 12]} />
        <meshStandardMaterial color={REFERENCE_LOTUS_COLORS.leaf} emissive="#14532d" emissiveIntensity={0.1} roughness={0.72} />
      </mesh>
      <mesh ref={leafRightRef} castShadow>
        <sphereGeometry args={[1, 24, 12]} />
        <meshStandardMaterial color="#2d745e" emissive="#14532d" emissiveIntensity={0.1} roughness={0.72} />
      </mesh>

      <group ref={centerRef}>
        <StamenFilaments />
        <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.33, 0.26, 0.28, 48]} />
          <meshPhysicalMaterial
            color={REFERENCE_LOTUS_COLORS.seedPod}
            emissive="#f59e0b"
            emissiveIntensity={0.22}
            roughness={0.5}
            clearcoat={0.14}
            clearcoatRoughness={0.58}
          />
        </mesh>
        <mesh position={[0, 0.205, 0]} castShadow>
          <cylinderGeometry args={[0.335, 0.335, 0.028, 48]} />
          <meshStandardMaterial color={REFERENCE_LOTUS_COLORS.seedPodRim} emissive="#bef264" emissiveIntensity={0.16} roughness={0.56} />
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
  const petals = useMemo(buildSeedablePetals, []);

  useFrame(({ clock }) => {
    if (!rootRef.current || reducedMotion || paused) return;
    rootRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.14) * 0.08;
  });

  return (
    <>
      <color attach="background" args={['#06110d']} />
      <fog attach="fog" args={['#06110d', 6.5, 13]} />
      <ambientLight intensity={0.34} />
      <directionalLight position={[3.4, 5.8, 4.2]} intensity={2.05} castShadow />
      <pointLight position={[0.1, 1.05, 2.2]} color="#ff8bc4" intensity={1.55} distance={7} />
      <pointLight position={[0, 0.68, 0.2]} color="#fbbf24" intensity={0.9} distance={3.2} />
      <pointLight position={[-2.8, 0.8, -3]} color="#6ee7b7" intensity={0.42} distance={7} />

      <GrowthClock paused={paused} reducedMotion={reducedMotion} restartKey={restartKey}>
        <group ref={rootRef} position={[0, 0, 0]} rotation={[0.12, 0, 0]}>
          <mesh position={[0, -1.34, 0]} receiveShadow>
            <cylinderGeometry args={[3.8, 4.4, 0.12, 96]} />
            <meshPhysicalMaterial
              color={REFERENCE_LOTUS_COLORS.water}
              emissive="#08241a"
              emissiveIntensity={0.14}
              roughness={0.24}
              metalness={0}
              transmission={0.16}
              thickness={0.12}
              transparent
              opacity={0.92}
            />
          </mesh>
          <LotusPadField />
          <SeedAndStalk paused={paused} reducedMotion={reducedMotion} />
          {petals.map((petal) => (
            <GrowthPetal key={petal.index} petal={petal} paused={paused} reducedMotion={reducedMotion} />
          ))}
          <PollenField paused={paused} reducedMotion={reducedMotion} />
        </group>
      </GrowthClock>
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
      dpr={[1, 1.75]}
      shadows
      gl={{ antialias: true, alpha: false }}
      onCreated={({ camera }) => camera.lookAt(new Vector3(0, 0.52, 0))}
    >
      <ResponsiveLotusCamera />
      <LotusWorld paused={paused} reducedMotion={reducedMotion} restartKey={restartKey} />
    </Canvas>
  );
}

async function fetchLotus(signal: AbortSignal): Promise<LotusResponse> {
  const bearer = window.localStorage.getItem('holomesh_bearer')?.trim();
  const res = await fetch('/api/lotus', {
    signal,
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : undefined,
  });
  if (!res.ok) throw new Error(`Lotus API returned ${res.status}`);
  return res.json() as Promise<LotusResponse>;
}

export default function LotusProgram() {
  const sectionRef = useRef<HTMLElement>(null);
  const hasEnteredViewRef = useRef(false);
  const [lotus, setLotus] = useState<LotusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sceneKey, setSceneKey] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const controller = new AbortController();
    fetchLotus(controller.signal)
      .then((data) => {
        setLotus(data);
        setError(null);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Lotus API unavailable');
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
            {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
