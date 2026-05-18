/**
 * FireSource
 *
 * Particle-based campfire / fireplace with core flame + floating embers.
 * Uses instanced points + custom shader (lightweight, inspired by DragonFireEffect).
 * Always flickering. Pointer proximity causes intensity spike.
 *
 * @module holoshell/phenomena/FireSource
 */

import React, { useRef, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { FireSourceProps } from '../types';

const fireVertex = `
  uniform float uTime;
  uniform float uIntensity;
  attribute float aSeed;
  attribute float aSize;
  varying float vLife;
  varying float vSeed;

  void main() {
    float life = fract((uTime * 0.9 + aSeed) * 1.3);
    vLife = life;
    vSeed = aSeed;

    vec3 pos = position;
    // Core upward + flicker
    float rise = life * (2.8 + sin(aSeed * 17.3) * 0.6) * uIntensity;
    pos.y += rise;

    // Lateral turbulence
    float turb = (0.6 + sin(life * 12.0 + aSeed) * 0.8) * uIntensity;
    pos.x += sin(aSeed * 6.28 + uTime * 4.2) * turb * (0.3 + life * 0.4);
    pos.z += cos(aSeed * 7.1 + uTime * 3.8) * turb * (0.25 + life * 0.35);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = aSize * (220.0 / -mv.z) * (0.6 + life * 1.8) * uIntensity;
    gl_Position = projectionMatrix * mv;
  }
`;

const fireFragment = `
  uniform vec3 uColorHot;
  uniform vec3 uColorMid;
  uniform vec3 uColorCool;
  varying float vLife;
  varying float vSeed;

  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float d = length(c);
    if (d > 0.5) discard;

    float core = smoothstep(0.5, 0.08, d);
    float alpha = core * (0.95 - vLife * 0.35);

    vec3 col;
    if (vLife < 0.18) {
      col = mix(uColorHot, uColorMid, vLife / 0.18);
    } else if (vLife < 0.55) {
      col = mix(uColorMid, uColorCool, (vLife - 0.18) / 0.37);
    } else {
      col = mix(uColorCool, vec3(0.3, 0.1, 0.0), (vLife - 0.55) / 0.45);
    }

    gl_FragColor = vec4(col, alpha);
  }
`;

export const FireSource: React.FC<FireSourceProps> = ({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  intensity = 0.9,
  colorTemp = 0.5,
  embers = true,
  onProximity,
}) => {
  const pointsRef = useRef<THREE.Points>(null!);
  const [proxIntensity, setProxIntensity] = useState(1.0);

  const particleCount = 180;

  const { geometry, material } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(particleCount * 3);
    const seeds = new Float32Array(particleCount);
    const sizes = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const s = i * 0.037;
      pos[i * 3 + 0] = (Math.sin(s * 12) * 0.18 + (i % 5) * 0.01) * 0.6;
      pos[i * 3 + 1] = (i % 11) * 0.03;
      pos[i * 3 + 2] = (Math.cos(s * 9) * 0.16) * 0.6;

      seeds[i] = s;
      sizes[i] = 1.6 + (i % 7) * 0.35;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: fireVertex,
      fragmentShader: fireFragment,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: intensity },
        uColorHot: { value: new THREE.Color('#fff7e6') },
        uColorMid: { value: new THREE.Color('#ff8c42') },
        uColorCool: { value: new THREE.Color('#ff4d1a') },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    return { geometry: geo, material: mat };
  }, [intensity]);

  // Ember particles (slow rising orange dots)
  const emberCount = embers ? 26 : 0;
  const emberGeo = useMemo(() => {
    if (!embers) return null;
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(emberCount * 3);
    const sd = new Float32Array(emberCount);
    for (let i = 0; i < emberCount; i++) {
      const s = i * 1.7;
      p[i * 3] = Math.sin(s) * 0.32;
      p[i * 3 + 1] = (i % 5) * 0.12 + 0.3;
      p[i * 3 + 2] = Math.cos(s * 0.7) * 0.29;
      sd[i] = s;
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
    return g;
  }, [embers, emberCount]);

  const emberMat = useMemo(() => {
    return new THREE.PointsMaterial({
      size: 0.035,
      color: '#ffaa33',
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
  }, []);

  // Animate + proximity reaction
  useFrame((state, delta) => {
    if (pointsRef.current) {
      const mat = pointsRef.current.material as THREE.ShaderMaterial;
      mat.uniforms.uTime.value = state.clock.elapsedTime;
      const target = intensity * proxIntensity;
      mat.uniforms.uIntensity.value = THREE.MathUtils.lerp(
        mat.uniforms.uIntensity.value,
        target,
        0.08
      );
    }

    // Decay proximity boost
    if (proxIntensity > 1.0) {
      setProxIntensity((p) => Math.max(1.0, p - delta * 1.8));
    }
  });

  // Pointer proximity handler (hover over fire makes it flare)
  const handlePointerMove = (e: any) => {
    const d = e.distance || 1.4;
    if (d < 2.2) {
      const boost = 1.0 + (1.0 - d / 2.2) * 0.65;
      setProxIntensity(boost);
      onProximity?.(d);
    }
  };

  return (
    <group position={position} rotation={rotation} scale={scale}>
      {/* Core flame points */}
      <points
        ref={pointsRef}
        geometry={geometry}
        material={material}
        onPointerMove={handlePointerMove}
        userData={{ phenomena: 'fire' }}
      />

      {/* Embers */}
      {embers && emberGeo && (
        <points geometry={emberGeo} material={emberMat} />
      )}

      {/* Soft glow sphere at base (emissive halo) */}
      <mesh position={[0, 0.18, 0]}>
        <sphereGeometry args={[0.38]} />
        <meshBasicMaterial
          color="#ff6a1a"
          transparent
          opacity={0.12 * intensity}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

export default FireSource;
