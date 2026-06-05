'use client';

/**
 * CompiledLotusMeshNode — render the full lotus POND SCENE compiled from `.holo`
 * (I.007 closure: material + petal mesh + phyllotaxis bloom + stem + water + pads,
 * all from the `@botanical_lotus` declaration).
 *
 * R3FCompiler emits, for a `@botanical_lotus` node:
 *   - props.__compiledMaterial — the petal material spec,
 *   - props.__petalGeometry    — the petal mesh (three-free typed arrays),
 *   - props.__petalPlacements  — per-petal golden-angle placements (the bloom),
 *   - props.__lotusScene       — stem height + water/leaf colours (the pond).
 *
 * The bloom is built once (one shared material + BufferGeometry, a mesh per
 * placement via nested azimuth/tilt groups) and lifted onto a stem that rises from
 * the water; lily pads float on the surface. No hand-authored geometry, material,
 * or layout — the whole pond scene assembles from compiled `.holo`.
 */
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { R3FNode } from '@/types';
import { buildCompiledMaterial, registerProceduralTexture } from '@holoscript/r3f-renderer';
import {
  generateBotanicalNormalMap,
  generateBotanicalRoughnessMap,
} from '@holoscript/core/traits/botanical-lotus';
import { getTimelineValue } from './timelineRuntime';

/** Register the REAL core botanical generators so the petal's declared procedural
 *  normal/roughness maps (props.__compiledMaterial.proceduralMaps) resolve to actual
 *  vein-normal + roughness micro-detail. Idempotent, runs once. */
let _proceduralReady = false;
function ensureProceduralGenerators(): void {
  if (_proceduralReady) return;
  registerProceduralTexture('botanical_normal', (p) =>
    generateBotanicalNormalMap(p as Parameters<typeof generateBotanicalNormalMap>[0])
  );
  registerProceduralTexture('botanical_roughness', (p) =>
    generateBotanicalRoughnessMap(p as Parameters<typeof generateBotanicalRoughnessMap>[0])
  );
  _proceduralReady = true;
}

interface CompiledPetalGeometry {
  positions: Float32Array;
  normals: Float32Array;
  petalUv: Float32Array;
  veinPhase: Float32Array;
  indices: Uint32Array;
}

interface LotusPetalPlacement {
  azimuth: number;
  tilt: number;
  radius: number;
  lift: number;
  ring: number;
}

interface LotusPondPad {
  pos: [number, number, number];
  radius: number;
  rotation: number;
  dark: boolean;
}
interface LotusPondLeaf {
  pos: [number, number, number];
  height: number;
  radius: number;
  tilt: number;
  rotation: number;
  dark: boolean;
}
interface LotusSceneScaffold {
  waterSize: number;
  stem: { height: number; topRadius: number; bottomRadius: number };
  receptacle: { radius: number; squashY: number; lift: number };
  calyx: { radius: number; height: number; drop: number };
  pads: LotusPondPad[];
  leaves: LotusPondLeaf[];
}

interface LotusScene {
  stemHeight: number;
  /** Pond layout compiled from the trait — water/stem/receptacle/pads/leaves. */
  scaffold?: LotusSceneScaffold;
  colors: { water: string; leaf: string; leafDark: string };
  center?: {
    seedPod: string;
    seedPodRim: string;
    stamen: string;
    stamenTip: string;
    stamenCount: number;
  };
}

/** Forward growth phases, keyed off the `.holo`-declared developmentalTime g (0→1):
 *    stem rises   → g 0.00‥0.42
 *    leaves unfurl→ g 0.15‥0.65 (staggered)
 *    bud swells   → g 0.28‥0.60
 *    petals open  → g 0.45‥1.00 (compiled maturation front; inner ring leads) */
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Per-ring size + colour grading: inner petals small + pale, outer large + deep. */
const RING_SCALE: Record<number, number> = { 1: 0.72, 2: 0.86, 3: 1.0 };
const RING_TINT: Record<number, number> = { 1: 1.15, 2: 1.0, 3: 0.78 };

/** Clone a compiled material spec with every colour uniform scaled by `factor`
 *  (>1 lightens toward white, <1 deepens) so each ring gets its own tone. */
function tintSpec(spec: Parameters<typeof buildCompiledMaterial>[0], factor: number) {
  if (factor === 1 || !spec?.shaderChunks?.uniforms) return spec;
  const grade = (v: unknown): unknown => {
    if (!Array.isArray(v) || v.length !== 3) return v;
    return v.map((c: number) =>
      factor >= 1 ? Math.min(1, c + (1 - c) * (factor - 1)) : Math.max(0, c * factor)
    );
  };
  const uniforms: Record<string, { value: unknown }> = {};
  for (const [k, u] of Object.entries(spec.shaderChunks.uniforms)) {
    uniforms[k] = /Color/i.test(k) ? { value: grade((u as { value: unknown }).value) } : u;
  }
  return { ...spec, shaderChunks: { ...spec.shaderChunks, uniforms } };
}

function wrapCompiledGeometry(g: CompiledPetalGeometry): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(g.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(g.normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(g.petalUv, 2));
  geo.setAttribute('petalUv', new THREE.BufferAttribute(g.petalUv, 2));
  geo.setAttribute('veinPhase', new THREE.BufferAttribute(g.veinPhase, 1));
  geo.setIndex(new THREE.BufferAttribute(g.indices, 1));
  return geo;
}

/** Fallback scaffold if a node predates the compiler emitting one (keeps the
 *  renderer standalone-safe). The real layout is compiled by the trait. */
const FALLBACK_SCAFFOLD: LotusSceneScaffold = {
  waterSize: 60,
  stem: { height: 2.4, topRadius: 0.045, bottomRadius: 0.06 },
  receptacle: { radius: 0.42, squashY: 0.72, lift: 0.04 },
  calyx: { radius: 0.16, height: 0.28, drop: 0.18 },
  pads: [],
  leaves: [],
};

export function CompiledLotusMeshNode({ node }: { node: R3FNode }) {
  const { props } = node;
  const spec = props.__compiledMaterial as Parameters<typeof buildCompiledMaterial>[0];
  const petalGeometry = props.__petalGeometry as CompiledPetalGeometry;
  const placements = (props.__petalPlacements as LotusPetalPlacement[] | undefined) ?? [];
  const scene = props.__lotusScene as LotusScene | undefined;
  // The pond LAYOUT (water size, stem/receptacle/calyx dims, pad + leaf placements)
  // is compiled by the trait and arrives here — the renderer draws it, authoring none.
  const scaffold = scene?.scaffold ?? FALLBACK_SCAFFOLD;
  const stemHeight = scene?.stemHeight ?? scaffold.stem.height;
  const water = scene?.colors.water ?? '#07140f';
  const leaf = scene?.colors.leaf ?? '#235f4f';
  const leafDark = scene?.colors.leafDark ?? '#102f28';

  // One material per ring (size + colour graded: inner pale, outer deep).
  const ringMats = useMemo(() => {
    ensureProceduralGenerators(); // resolve the petal's declared vein/roughness maps
    const make = (factor: number, ring: number) => {
      const built = buildCompiledMaterial(tintSpec(spec, factor));
      const m = built.material;
      m.side = THREE.DoubleSide; // cupped petals read from both sides
      // Depth-bias each ring layer so overlapping/intersecting petals don't z-fight.
      m.polygonOffset = true;
      m.polygonOffsetFactor = -ring;
      m.polygonOffsetUnits = -ring;
      return built;
    };
    return { 1: make(RING_TINT[1], 1), 2: make(RING_TINT[2], 2), 3: make(RING_TINT[3], 3) } as Record<
      number,
      ReturnType<typeof buildCompiledMaterial>
    >;
  }, [spec]);
  const geometry = useMemo(() => wrapCompiledGeometry(petalGeometry), [petalGeometry]);

  useEffect(() => {
    return () => {
      for (const m of Object.values(ringMats)) m.material.dispose();
      geometry.dispose();
    };
  }, [ringMats, geometry]);

  // Refs for the scene-level growth (stem rise + leaf unfurl). These parts of the
  // scaffold are still hand-authored here (TODO: move the pond into `.holo` so a
  // generic runtime plays it); the PETAL growth below is NOT keyframed — it is the
  // compiled maturation-front model, played by ramping its developmental clock.
  const stemRef = useRef<THREE.Mesh>(null);
  const bloomRef = useRef<THREE.Group>(null);
  const leafRefs = useRef<Array<THREE.Group | null>>([]);

  // The growth CLOCK is declared in the `.holo` `timeline` block (animate
  // "developmentalTime" 0→1) and played by the generic <TimelineDriver>; we read its
  // current value here by target name. No clock, duration, or curve lives in this
  // component anymore — only the mapping from developmental time onto the compiled
  // uniforms + scaffold. Fallback 1 = full bloom when no timeline drives it.
  //
  // uPetalDevTime feeds the acropetal maturation front baked into the petal shader
  // (BotanicalLotusTrait §PETAL MORPHOGENESIS) — ramping it 0→1 IS the unfurl
  // (bud→bloom), grown on the GPU from the `.holo` declaration, not a keyframe curve.
  // uLotusGrowth gates vein/SSS emergence so colour blooms in too.
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const g = getTimelineValue('developmentalTime', 1); // 0→1 from the .holo timeline

    const dev = smoothstep(0.45, 1.0, g); // petals open in the back half of growth
    for (const m of Object.values(ringMats)) {
      const h = m.chunkHandle;
      if (!h) continue;
      h.setUniform('uLotusTime', t);
      h.setUniform('uPetalDevTime', dev); // forward maturation front (the unfurl)
      h.setUniform('uLotusGrowth', smoothstep(0.4, 0.9, g)); // colour/vein emerges
      h.setUniform('uLotusBloom', dev);
    }

    // Scene-level growth: stem rises first, the bud rides up on it, leaves unfurl.
    const stemGrow = smoothstep(0.0, 0.42, g);
    if (stemRef.current) {
      stemRef.current.scale.y = Math.max(0.001, stemGrow);
      stemRef.current.position.y = (stemHeight * stemGrow) / 2;
    }
    if (bloomRef.current) {
      bloomRef.current.position.y = stemHeight * stemGrow;
      bloomRef.current.scale.setScalar(1.8 * lerp(0.28, 1, smoothstep(0.28, 0.6, g)));
      bloomRef.current.visible = stemGrow > 0.02;
    }
    leafRefs.current.forEach((lr, i) => {
      if (lr) lr.scale.setScalar(smoothstep(0.15 + i * 0.08, 0.55 + i * 0.08, g));
    });
  });

  const petals: LotusPetalPlacement[] =
    placements.length > 0 ? placements : [{ azimuth: 0, tilt: 0, radius: 0, lift: 0, ring: 1 }];

  // Stamen ring around the seed pod — count from the profile.
  const center = scene?.center;
  const stamens = useMemo(() => {
    const n = center?.stamenCount ?? 0;
    return Array.from({ length: n }, (_, i) => ({
      azimuth: (i / Math.max(1, n)) * Math.PI * 2,
      lean: 0.18 + (i % 4) * 0.04,
      len: 0.26 + (i % 3) * 0.03,
    }));
  }, [center?.stamenCount]);

  return (
    <group
      position={props.position as [number, number, number] | undefined}
      rotation={props.rotation as [number, number, number] | undefined}
      scale={props.scale as number | [number, number, number] | undefined}
    >
      {/* Water surface — size compiled from the scaffold; large enough its far edge
          falls into the fog (no hard horizon seam). */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[scaffold.waterSize, scaffold.waterSize]} />
        <meshStandardMaterial color={water} roughness={0.22} metalness={0.5} />
      </mesh>

      {/* Lily pads — placements compiled from the scaffold. */}
      {scaffold.pads.map((pad, i) => (
        <mesh key={`pad-${i}`} position={pad.pos} rotation={[-Math.PI / 2, 0, pad.rotation]}>
          <circleGeometry args={[pad.radius, 40]} />
          <meshStandardMaterial color={pad.dark ? leafDark : leaf} roughness={0.85} side={THREE.DoubleSide} />
        </mesh>
      ))}

      {/* Lotus leaves on their own stems — placements compiled from the scaffold. */}
      {scaffold.leaves.map((lf, i) => (
        <group
          key={`leaf-${i}`}
          position={lf.pos}
          ref={(el) => {
            leafRefs.current[i] = el;
          }}
        >
          <mesh position={[0, lf.height / 2, 0]}>
            <cylinderGeometry args={[0.03, 0.045, lf.height, 10]} />
            <meshStandardMaterial color={leafDark} roughness={0.7} />
          </mesh>
          <mesh position={[0, lf.height, 0]} rotation={[-Math.PI / 2 + lf.tilt, 0, lf.rotation]}>
            <circleGeometry args={[lf.radius, 48]} />
            <meshStandardMaterial
              color={lf.dark ? leafDark : leaf}
              roughness={0.8}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}

      {/* Stem rising from the water to the flower base (dims compiled; scale.y grown). */}
      <mesh ref={stemRef} position={[0, stemHeight / 2, 0]}>
        <cylinderGeometry
          args={[scaffold.stem.topRadius, scaffold.stem.bottomRadius, stemHeight, 14]}
        />
        <meshStandardMaterial color={leafDark} roughness={0.7} />
      </mesh>

      {/* The bloom, lifted onto the stem (position.y + scale grown in useFrame). */}
      <group ref={bloomRef} position={[0, stemHeight, 0]} scale={1.8}>
        {/* Receptacle: the green flower base every petal emerges from — closes the
            underside and ties the petals into one connected bloom (dims compiled). */}
        <mesh position={[0, scaffold.receptacle.lift, 0]} scale={[1, scaffold.receptacle.squashY, 1]}>
          <sphereGeometry args={[scaffold.receptacle.radius, 28, 20]} />
          <meshStandardMaterial color={center?.seedPodRim ?? leaf} roughness={0.75} />
        </mesh>
        {/* Calyx collar where the stem meets the flower base (dims compiled). */}
        <mesh position={[0, -scaffold.calyx.drop, 0]}>
          <coneGeometry args={[scaffold.calyx.radius, scaffold.calyx.height, 16]} />
          <meshStandardMaterial color={leafDark} roughness={0.7} />
        </mesh>

        {petals.map((p, i) => (
          <group key={i} rotation={[0, p.azimuth, 0]}>
            {/* Bases pulled in to converge at the receptacle (was p.radius) so the
                petals fan from one point instead of a spread ring. */}
            <group position={[0, p.lift - 0.05, p.radius * 0.34]} rotation={[p.tilt, 0, 0]}>
              <mesh
                geometry={geometry}
                material={(ringMats[p.ring] ?? ringMats[3]).material}
                scale={RING_SCALE[p.ring] ?? 1}
              />
            </group>
          </group>
        ))}

        {/* Flower centre: seed pod (receptacle) + stamen ring */}
        {center && (
          <group position={[0, 0.42, 0]}>
            <mesh>
              <cylinderGeometry args={[0.22, 0.15, 0.16, 28]} />
              <meshStandardMaterial color={center.seedPod} roughness={0.6} />
            </mesh>
            <mesh position={[0, 0.085, 0]}>
              <cylinderGeometry args={[0.225, 0.215, 0.03, 28]} />
              <meshStandardMaterial color={center.seedPodRim} roughness={0.5} />
            </mesh>
            {stamens.map((s, i) => (
              <group key={`st-${i}`} rotation={[0, s.azimuth, 0]}>
                <group position={[0, -0.02, 0.2]} rotation={[-s.lean, 0, 0]}>
                  <mesh position={[0, s.len / 2, 0]}>
                    <cylinderGeometry args={[0.006, 0.009, s.len, 6]} />
                    <meshStandardMaterial color={center.stamen} roughness={0.5} />
                  </mesh>
                  <mesh position={[0, s.len + 0.01, 0]}>
                    <sphereGeometry args={[0.016, 8, 8]} />
                    <meshStandardMaterial
                      color={center.stamenTip}
                      emissive={center.stamenTip}
                      emissiveIntensity={0.25}
                      roughness={0.4}
                    />
                  </mesh>
                </group>
              </group>
            ))}
          </group>
        )}
      </group>
    </group>
  );
}
