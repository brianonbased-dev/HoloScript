/**
 * MountainLakeScene
 *
 * Still water + distant peaks + mist. Peaceful, vast, reflective.
 * Minimal interaction — mostly contemplative.
 *
 * @module holoshell/scenes/MountainLakeScene
 */

import React from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneComponentProps } from '../types';
import { WaterSurface } from '../phenomena/WaterSurface';
import { GlowField } from '../phenomena/GlowField';
import { SceneDoor } from '../phenomena/SceneDoor';

export interface MountainLakeSceneProps extends SceneComponentProps {}

/**
 * A vast, mirror-calm alpine lake ringed by layered mountains.
 * Birch sentinels, rocky shoreline, low mist, and a stone arch door.
 * The only movement is water shimmer, drifting mist, and slow light.
 */
const MountainLakeScene: React.FC<MountainLakeSceneProps> = ({
  onNavigateRequest,
  onInteraction,
}) => {
  const { camera } = useThree();

  // Calm gaze across the water toward the far peaks and stone threshold
  React.useEffect(() => {
    camera.lookAt(0.6, 0.15, -3.4);
  }, [camera]);

  const handleNavigate = (id: string) => {
    onNavigateRequest?.(id as any);
    onInteraction?.('door_opened', { destination: id });
  };

  // HoloShell audio bridge — mountain lake ambient (procedural, zero-asset)
  // faint water lapping (soft rhythmic shore waves against rock) + high altitude wind across peaks (breathy distant gusts).
  // Peaceful, vast, reflective, contemplative scale; master volume extremely low to match the still scene.
  // Uses Web Audio (AudioContext + oscillators + noise buffers + scheduled envelopes). Starts on mount.
  // Future: real clips via HoloScript asset refs or <audio>.
  // Triggers phenomena bus so external (haptics, HoloMesh, recording) can react.
  React.useEffect(() => {
    let ctx: AudioContext | null = null;
    const stops: Array<() => void> = [];
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    try {
      const audioCtx: AudioContext = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
      ctx = audioCtx;
      const master = audioCtx.createGain();
      master.gain.value = 0.016; // extremely faint alpine bed — vast contemplative scale
      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1380;
      master.connect(lp);
      lp.connect(audioCtx.destination);

      // high altitude wind across peaks — thin airy whooshes, slow breathing modulation, distant and light
      const windBuf = audioCtx.createBuffer(1, audioCtx.sampleRate * 4.8, audioCtx.sampleRate);
      const wd = windBuf.getChannelData(0);
      for (let i = 0; i < wd.length; i++) {
        const t = i / audioCtx.sampleRate;
        wd[i] = (Math.random() * 2 - 1) * (0.55 + 0.35 * Math.sin(t * 0.9 + Math.sin(t * 0.11) * 0.6));
      }
      const wind = audioCtx.createBufferSource();
      wind.buffer = windBuf;
      wind.loop = true;
      const wG = audioCtx.createGain();
      wG.gain.value = 0.32;
      const wHp = audioCtx.createBiquadFilter();
      wHp.type = 'highpass';
      wHp.frequency.value = 265;
      const wBp = audioCtx.createBiquadFilter();
      wBp.type = 'bandpass';
      wBp.frequency.value = 780;
      wBp.Q.value = 0.85;
      const wLp = audioCtx.createBiquadFilter();
      wLp.type = 'lowpass';
      wLp.frequency.value = 1620;
      // very slow LFO for high altitude gusts and whooshes (feels vast and thin)
      const wLfo = audioCtx.createOscillator();
      wLfo.type = 'sine';
      wLfo.frequency.value = 0.0095;
      const wLfoG = audioCtx.createGain();
      wLfoG.gain.value = 0.14;
      wLfo.connect(wLfoG);
      wLfoG.connect(wG.gain);
      wind.connect(wHp);
      wHp.connect(wBp);
      wBp.connect(wLp);
      wLp.connect(wG);
      wG.connect(master);
      wind.start();
      wLfo.start();
      stops.push(() => { try { wind.stop(); wLfo.stop(); } catch {} });

      // faint water lapping — sparse soft rhythmic waves kissing the rocky shoreline, very low energy and irregular
      const scheduleLap = () => {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const lapSrc = audioCtx.createBufferSource();
        const lapBuf = audioCtx.createBuffer(1, audioCtx.sampleRate * 1.15, audioCtx.sampleRate);
        const ld = lapBuf.getChannelData(0);
        for (let i = 0; i < ld.length; i++) {
          const t = i / audioCtx.sampleRate;
          // soft decaying whoosh + micro texture for natural lap feel
          ld[i] = (Math.random() * 2 - 1) * Math.pow(1 - t * 0.92, 1.6) * (0.7 + 0.3 * Math.sin(t * 14));
        }
        lapSrc.buffer = lapBuf;
        const lG = audioCtx.createGain();
        lG.gain.value = 0.0;
        const lLp = audioCtx.createBiquadFilter();
        lLp.type = 'lowpass';
        lLp.frequency.value = 395;
        const lHp = audioCtx.createBiquadFilter();
        lHp.type = 'highpass';
        lHp.frequency.value = 72;
        lapSrc.connect(lLp);
        lLp.connect(lHp);
        lHp.connect(lG);
        lG.connect(master);
        lapSrc.start(now);
        // gentle envelope: slow attack, medium tail for peaceful lapping
        lG.gain.setValueAtTime(0.0001, now);
        lG.gain.linearRampToValueAtTime(0.48, now + 0.18);
        lG.gain.linearRampToValueAtTime(0.00001, now + 1.65 + Math.random() * 0.55);
        setTimeout(() => { try { lapSrc.stop(); } catch {} }, 2300);
        timers.push(setTimeout(scheduleLap, 3850 + Math.random() * 7200));
      };
      timers.push(setTimeout(scheduleLap, 950 + Math.random() * 1850));

      // bridge hook: notify phenomena bus (audio started for this scene)
      (window as any).__holoShellAudio = {
        scene: 'mountain-lake',
        tracks: ['faint_water_lapping', 'high_altitude_wind'],
        stop: () => {
          stops.forEach((f) => f());
          timers.forEach((t) => clearTimeout(t));
        },
      };
    } catch {
      // blocked until gesture or no WebAudio support
    }
    return () => {
      stops.forEach((f) => f());
      timers.forEach((t) => clearTimeout(t));
      if (ctx) {
        try {
          ctx.close();
        } catch {}
      }
    };
  }, []);

  return (
    <group>
      {/* === BACKGROUND: 4 LAYERED MOUNTAIN SILHOUETTES (depth from z=-5.2 to -10.5) === */}
      {/* Farthest snow-capped ridge (coldest, faintest) */}
      <mesh position={[1.2, 3.8, -10.6]} rotation={[0.06, -0.22, 0]}>
        <planeGeometry args={[13, 8.5]} />
        <meshBasicMaterial color="#2a3542" transparent opacity={0.65} side={2} />
      </mesh>
      {/* Third ridge — slightly closer, darker blue-gray */}
      <mesh position={[-4.8, 2.9, -8.4]} rotation={[0.11, 0.35, 0]}>
        <planeGeometry args={[9, 7]} />
        <meshBasicMaterial color="#2f3c48" transparent opacity={0.78} side={2} />
      </mesh>
      {/* Second ridge — mid distance, stronger presence */}
      <mesh position={[4.5, 2.15, -6.8]} rotation={[0.14, -0.28, 0]}>
        <planeGeometry args={[8.5, 6.2]} />
        <meshBasicMaterial color="#36434f" transparent opacity={0.86} side={2} />
      </mesh>
      {/* Nearest mountain wall (left, anchors the left side of frame) */}
      <mesh position={[-5.2, 1.65, -5.15]} rotation={[0.18, 0.42, 0]}>
        <planeGeometry args={[7.5, 5.8]} />
        <meshBasicMaterial color="#3a4754" transparent opacity={0.93} side={2} />
      </mesh>

      {/* === MIRROR-STILL LAKE WATER (primary living surface) === */}
      <WaterSurface
        position={[0.3, 0.38, -2.35]}
        rotation={[-Math.PI * 0.492, 0.015, 0]}
        color="#0e3a5a"
        lightRays={false}
        rayCount={4}
        rayOpacity={0.12}
        caustics={false}
      />

      {/* === ROCKY SHORELINE BOULDERS (water edge, partially submerged feel) === */}
      {/* Left cluster */}
      <mesh position={[-2.65, -1.22, -1.85]}>
        <sphereGeometry args={[0.52]} />
        <meshStandardMaterial color="#4a4f55" roughness={0.99} />
      </mesh>
      <mesh position={[-3.15, -1.28, -2.25]}>
        <sphereGeometry args={[0.38]} />
        <meshStandardMaterial color="#555b62" roughness={0.98} />
      </mesh>
      <mesh position={[-2.1, -1.18, -2.55]}>
        <dodecahedronGeometry args={[0.45]} />
        <meshStandardMaterial color="#3f444a" roughness={0.97} />
      </mesh>
      {/* Right shoreline rocks near door path */}
      <mesh position={[1.65, -1.25, -1.95]}>
        <sphereGeometry args={[0.48]} />
        <meshStandardMaterial color="#484d54" roughness={0.99} />
      </mesh>
      <mesh position={[2.25, -1.32, -2.4]}>
        <sphereGeometry args={[0.33]} />
        <meshStandardMaterial color="#5a5f66" roughness={0.98} />
      </mesh>
      <mesh position={[0.95, -1.2, -2.7]}>
        <dodecahedronGeometry args={[0.4]} />
        <meshStandardMaterial color="#42484f" roughness={0.97} />
      </mesh>

      {/* === BIRCH TREES (tall white trunks with dark bark rings, left + right) === */}
      {/* Left birch sentinel */}
      <group position={[-3.55, 0, -3.05]}>
        <mesh>
          <cylinderGeometry args={[0.062, 0.068, 4.05, 5]} />
          <meshStandardMaterial color="#e8e2d8" roughness={0.92} />
        </mesh>
        {/* Dark bark rings */}
        {[0.7, 1.55, 2.4, 3.25].map((y, i) => (
          <mesh key={i} position={[0, y - 2.0, 0]}>
            <cylinderGeometry args={[0.068, 0.068, 0.09, 5]} />
            <meshStandardMaterial color="#2a2722" roughness={0.95} />
          </mesh>
        ))}
      </group>
      {/* Second left birch (slightly shorter, behind) */}
      <group position={[-4.15, -0.15, -3.55]}>
        <mesh>
          <cylinderGeometry args={[0.055, 0.06, 3.65, 5]} />
          <meshStandardMaterial color="#e4e0d6" roughness={0.93} />
        </mesh>
        {[0.6, 1.4, 2.25, 3.05].map((y, i) => (
          <mesh key={i} position={[0, y - 1.8, 0]}>
            <cylinderGeometry args={[0.061, 0.061, 0.08, 5]} />
            <meshStandardMaterial color="#2f2c26" roughness={0.96} />
          </mesh>
        ))}
      </group>
      {/* Right birch near arch */}
      <group position={[3.85, 0, -3.55]}>
        <mesh>
          <cylinderGeometry args={[0.058, 0.064, 4.15, 5]} />
          <meshStandardMaterial color="#e6e0d4" roughness={0.91} />
        </mesh>
        {[0.65, 1.5, 2.35, 3.2].map((y, i) => (
          <mesh key={i} position={[0, y - 2.05, 0]}>
            <cylinderGeometry args={[0.065, 0.065, 0.085, 5]} />
            <meshStandardMaterial color="#28251f" roughness={0.95} />
          </mesh>
        ))}
      </group>

      {/* === LOW MIST LAYER at water surface (very soft, high count) === */}
      <GlowField
        position={[0.15, 0.32, -2.52]}
        color="#d0e4f0"
        pulseRate={0.06}
        intensity={0.21}
        count={62}
      />
      {/* Secondary higher mist veil for volume */}
      <GlowField
        position={[-1.2, 1.05, -3.35]}
        color="#c8d8e8"
        pulseRate={0.08}
        intensity={0.28}
        count={29}
      />

      {/* === SUBTLE FOG / ATMOSPHERIC PLANE (mid-scene haze) === */}
      <mesh position={[0.4, 0.9, -3.65]} rotation={[0.04, 0, 0]}>
        <planeGeometry args={[11, 4.8]} />
        <meshBasicMaterial
          color="#a8b8c8"
          transparent
          opacity={0.13}
          depthWrite={false}
          side={2}
        />
      </mesh>

      {/* === COLD DAWN / OVERCAST POINT LIGHT === */}
      <pointLight
        position={[0.1, 6.1, -2.05]}
        intensity={0.36}
        color="#c8d8f0"
        distance={22}
        decay={1.6}
      />

      {/* === STONE ARCH / JETTY ENRICHED (more natural mass around door) === */}
      {/* Main platform */}
      <mesh position={[2.6, -1.12, -2.42]}>
        <boxGeometry args={[2.1, 0.55, 3.4]} />
        <meshStandardMaterial color="#4a4f55" roughness={0.98} />
      </mesh>
      {/* Left arch buttress stone */}
      <mesh position={[1.55, -0.85, -2.55]}>
        <dodecahedronGeometry args={[0.72]} />
        <meshStandardMaterial color="#43484f" roughness={0.97} />
      </mesh>
      {/* Right arch buttress */}
      <mesh position={[3.7, -0.88, -2.5]}>
        <dodecahedronGeometry args={[0.68]} />
        <meshStandardMaterial color="#484d55" roughness={0.97} />
      </mesh>
      {/* Top cap stones for arch weight */}
      <mesh position={[2.6, -0.55, -2.35]}>
        <boxGeometry args={[2.35, 0.38, 0.9]} />
        <meshStandardMaterial color="#555b62" roughness={0.96} />
      </mesh>

      {/* === SCENE DOOR in the stone arch (stone_arch material) === */}
      <SceneDoor
        position={[2.55, -0.55, -2.0]}
        rotation={[0.015, -0.08, 0.008]}
        materialType="stone_arch"
        destinationScene="NightCampfireScene"
        onNavigate={handleNavigate}
        ariaLabel="Cross the lake threshold into the night camp"
      />

      {/* Far right cliff face suggestion for enclosure */}
      <mesh position={[6.8, 1.8, -4.8]} rotation={[0, -0.55, 0]}>
        <planeGeometry args={[5, 7]} />
        <meshStandardMaterial color="#2f3842" roughness={0.98} side={2} />
      </mesh>

      {/* Ambient audio wired via HoloShell bridge (procedural synth; faint water lapping + high altitude wind across peaks — see useEffect above) */}
    </group>
  );
};

export default MountainLakeScene;
