'use client';

/**
 * PondScene — render the baked lotus-pond scene (5 @botanical_lotus instances on a
 * compiled pond) with ONLY three/R3F. Geometry, per-petal golden-angle placements,
 * pond layout, palette, growth timeline are all REAL HoloScript-compiled data from
 * the baker; this component only draws it and plays the declared growth clock.
 *
 * The petal material is MeshStandardMaterial keyed to the REAL per-ring petal
 * colors — the documented fallback, since the custom petal shader
 * (buildCompiledMaterial / LOTUS_PETAL_SHADER_CHUNKS) lives in
 * @holoscript/r3f-renderer which is not in the runtime bundle. Structure is real.
 */
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type {
  BakedScene,
  BakedLotusInstance,
  BakedAnimatedGroup,
} from './bakedTypes';
import { usePetalGeometry, Primitive } from './primitives';
import {
  getTimelineValue,
  setTimelineValue,
  clearTimelineValue,
  smoothstep,
  lerp,
} from './timelineRuntime';

// Per-ring grading + open windows — ported from the v1 CompiledLotusMeshNode model.
const RING_SCALE: Record<number, number> = { 1: 0.72, 2: 0.86, 3: 1.0 };
const RING_TINT: Record<number, number> = { 1: 1.15, 2: 1.0, 3: 0.78 };
const RING_OPEN_START: Record<number, number> = { 3: 0.34, 2: 0.48, 1: 0.62 };
const PETAL_OPEN_SPAN = 0.36;
const BUD_TILT = -0.12;

// Base botanical pink (the trait palette); ring tint lightens inner / deepens outer.
const PETAL_BASE = new THREE.Color('#f06fb0');

function ringColor(ring: number): THREE.Color {
  const c = PETAL_BASE.clone();
  const f = RING_TINT[ring] ?? 1;
  if (f >= 1) c.lerp(new THREE.Color('#ffffff'), (f - 1) * 0.6);
  else c.multiplyScalar(f);
  return c;
}

/** Drives the baked timeline keyframes into the shared runtime each frame. */
function TimelineDriver({ keys }: { keys: BakedScene['timeline'] }) {
  const tracks = useMemo(() => {
    const byTarget = new Map<string, { t: number; value: number }[]>();
    for (const k of keys ?? []) {
      const arr = byTarget.get(k.target) ?? [];
      arr.push({ t: k.t, value: k.value });
      byTarget.set(k.target, arr);
    }
    for (const arr of byTarget.values()) arr.sort((a, b) => a.t - b.t);
    return byTarget;
  }, [keys]);

  const duration = useMemo(() => {
    let d = 0;
    for (const arr of tracks.values()) if (arr.length) d = Math.max(d, arr[arr.length - 1].t);
    return d;
  }, [tracks]);

  const startRef = useRef<number | null>(null);
  useEffect(() => {
    const targets = Array.from(tracks.keys());
    return () => targets.forEach(clearTimelineValue);
  }, [tracks]);

  useFrame((state) => {
    const now = state.clock.elapsedTime;
    if (startRef.current === null) startRef.current = now;
    // Loop the growth so a returning viewer always sees the bloom open.
    const playhead = duration > 0 ? (now - startRef.current) % (duration + 4) : 0;
    for (const [target, track] of tracks) {
      let v = track.length ? track[track.length - 1].value : 0;
      if (playhead <= track[0].t) v = track[0].value;
      else {
        for (let i = 1; i < track.length; i += 1) {
          const a = track[i - 1];
          const b = track[i];
          if (playhead <= b.t) {
            const span = b.t - a.t;
            const f = span <= 0 ? 1 : smoothstep(0, 1, (playhead - a.t) / span);
            v = a.value + (b.value - a.value) * f;
            break;
          }
        }
      }
      setTimelineValue(target, v);
    }
  });
  return null;
}

/** A scaffold group whose transform is driven by baked __animatedTransform channels. */
function AnimatedGroup({ group }: { group: BakedAnimatedGroup }) {
  const ref = useRef<THREE.Group>(null);
  const basePos = group.position ?? [0, 0, 0];
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    let sx = 1;
    let sy = 1;
    let sz = 1;
    let [px, py, pz] = basePos;
    for (const ch of group.channels) {
      const v = lerp(ch.from, ch.to, smoothstep(ch.edge0, ch.edge1, getTimelineValue(ch.target, 1)));
      if (ch.prop === 'scaleX') sx = v;
      else if (ch.prop === 'scaleY') sy = v;
      else if (ch.prop === 'scaleZ') sz = v;
      else if (ch.prop === 'scaleUniform') sx = sy = sz = v;
      else if (ch.prop === 'posX') px = v;
      else if (ch.prop === 'posY') py = v;
      else if (ch.prop === 'posZ') pz = v;
    }
    g.scale.set(sx, sy, sz);
    g.position.set(px, py, pz);
  });
  return (
    <group ref={ref} position={basePos}>
      {group.children.map((c, i) => (
        <Primitive key={i} prim={c} />
      ))}
    </group>
  );
}

/** One @botanical_lotus instance: the compiled bloom on a rising stem. */
function LotusInstance({
  inst,
  geometry,
}: {
  inst: BakedLotusInstance;
  geometry: THREE.BufferGeometry;
}) {
  const bloomRef = useRef<THREE.Group>(null);
  const petalRefs = useRef<Array<THREE.Group | null>>([]);
  const stemHeight = inst.scene.stemHeight ?? 2.4;
  const scaffold = inst.scene.scaffold;
  const center = inst.scene.center;
  const leaf = inst.scene.colors?.leaf ?? '#235f4f';
  const leafDark = inst.scene.colors?.leafDark ?? '#102f28';

  const ringMaterials = useMemo(() => {
    const make = (ring: number) =>
      new THREE.MeshStandardMaterial({
        color: ringColor(ring),
        roughness: 0.42,
        metalness: 0,
        side: THREE.DoubleSide,
        emissive: ringColor(ring).clone().multiplyScalar(0.12),
        emissiveIntensity: 0.4,
      });
    return { 1: make(1), 2: make(2), 3: make(3) } as Record<number, THREE.MeshStandardMaterial>;
  }, []);

  useEffect(() => () => Object.values(ringMaterials).forEach((m) => m.dispose()), [ringMaterials]);

  const placements =
    inst.placements.length > 0
      ? inst.placements
      : [{ azimuth: 0, tilt: 0, radius: 0, lift: 0, ring: 1 }];

  const stamens = useMemo(() => {
    const n = center?.stamenCount ?? 0;
    return Array.from({ length: Math.min(n, 64) }, (_, i) => ({
      azimuth: (i / Math.max(1, Math.min(n, 64))) * Math.PI * 2,
      lean: 0.18 + (i % 4) * 0.04,
      len: 0.26 + (i % 3) * 0.03,
    }));
  }, [center?.stamenCount]);

  useFrame(() => {
    const gFull = getTimelineValue('developmentalTime', 1);
    const g = gFull * inst.growthCap;
    const stemGrow = smoothstep(0.0, 0.42, gFull);
    if (bloomRef.current) {
      bloomRef.current.position.y = stemHeight * stemGrow;
      bloomRef.current.scale.setScalar(1.8 * lerp(0.55, 1, smoothstep(0.18, 0.46, gFull)));
      bloomRef.current.visible = stemGrow > 0.02;
    }
    placements.forEach((p, i) => {
      const ref = petalRefs.current[i];
      if (!ref) return;
      const start = RING_OPEN_START[p.ring] ?? 0.5;
      const open = smoothstep(start, start + PETAL_OPEN_SPAN, g);
      ref.rotation.x = lerp(BUD_TILT, p.tilt, open);
      ref.position.set(0, p.lift - 0.05, lerp(p.radius * 0.06, p.radius * 0.34, open));
    });
  });

  return (
    <group position={inst.position} rotation={inst.rotation} scale={inst.scale}>
      <group ref={bloomRef} position={[0, stemHeight, 0]} scale={1.8}>
        {scaffold?.receptacle && (
          <mesh
            position={[0, scaffold.receptacle.lift, 0]}
            scale={[1, scaffold.receptacle.squashY, 1]}
            castShadow
          >
            <sphereGeometry args={[scaffold.receptacle.radius, 24, 16]} />
            <meshStandardMaterial color={center?.seedPodRim ?? leaf} roughness={0.75} />
          </mesh>
        )}
        {scaffold?.calyx && (
          <mesh position={[0, -scaffold.calyx.drop, 0]}>
            <coneGeometry args={[scaffold.calyx.radius, scaffold.calyx.height, 16]} />
            <meshStandardMaterial color={leafDark} roughness={0.7} />
          </mesh>
        )}
        {placements.map((p, i) => (
          <group key={i} rotation={[0, p.azimuth, 0]}>
            <group
              ref={(el) => {
                petalRefs.current[i] = el;
              }}
              position={[0, p.lift - 0.05, p.radius * 0.06]}
              rotation={[BUD_TILT, 0, 0]}
            >
              <mesh
                geometry={geometry}
                material={ringMaterials[p.ring] ?? ringMaterials[3]}
                scale={RING_SCALE[p.ring] ?? 1}
                castShadow
              />
            </group>
          </group>
        ))}
        {center && (
          <group position={[0, 0.42, 0]}>
            <mesh>
              <cylinderGeometry args={[0.28, 0.17, 0.2, 32]} />
              <meshStandardMaterial color={center.seedPod} roughness={0.6} />
            </mesh>
            {stamens.map((s, i) => (
              <group key={i} rotation={[0, s.azimuth, 0]}>
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

export function PondScene({ scene }: { scene: BakedScene }) {
  const geometry = usePetalGeometry(scene.petalGeometry);
  return (
    <group>
      <TimelineDriver keys={scene.timeline} />
      {(scene.scaffold ?? []).map((prim, i) => (
        <Primitive key={`sc-${i}`} prim={prim} />
      ))}
      {(scene.animatedGroups ?? []).map((g, i) => (
        <AnimatedGroup key={`ag-${i}`} group={g} />
      ))}
      {geometry &&
        (scene.lotuses ?? []).map((inst) => (
          <LotusInstance key={inst.id} inst={inst} geometry={geometry} />
        ))}
    </group>
  );
}
