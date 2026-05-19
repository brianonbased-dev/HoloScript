/**
 * NightCampfireScene
 *
 * Fire + floating embers + stars. Dark, primal, warm center.
 * Primary light source is the fire itself.
 *
 * @module holoshell/scenes/NightCampfireScene
 */

import React from 'react';
import { useThree } from '@react-three/fiber';
import type { SceneComponentProps } from '../types';
import { FireSource } from '../phenomena/FireSource';
import { GlowField } from '../phenomena/GlowField';
import { SandCanvas } from '../phenomena/SandCanvas';
import { SceneDoor } from '../phenomena/SceneDoor';

export interface NightCampfireSceneProps extends SceneComponentProps {}

/**
 * A primal night camp under open stars.
 * Central fire, three log seats, tree silhouettes, rising smoke, and a low moon.
 * The world is dark earth and black trees — the fire is the only warmth and navigation.
 */
const NightCampfireScene: React.FC<NightCampfireSceneProps> = ({
  onNavigateRequest,
  onInteraction,
}) => {
  const { camera } = useThree();

  // Low, intimate gaze into the fire — drawn to the living light
  React.useEffect(() => {
    camera.lookAt(0.15, -0.75, -2.0);
  }, [camera]);

  const handleNavigate = (id: string) => {
    onNavigateRequest?.(id as any);
    onInteraction?.('door_opened', { destination: id });
  };

  const handleFireProximity = (distance: number) => {
    onInteraction?.('fire_proximity', { distance });
  };

  // HoloShell audio bridge — night campfire ambient (procedural, zero-asset)
  // crackle + occasional owl calls + rare wood pops + faint pine wind.
  // Matches the primal night mood; extremely low volume.
  // Uses Web Audio (AudioContext + oscillators + noise buffers). Starts on mount.
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
      master.gain.value = 0.028; // extremely faint night bed
      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 980;
      master.connect(lp);
      lp.connect(audioCtx.destination);

      // faint night wind through pines — slow modulated filtered noise
      const windBuf = audioCtx.createBuffer(1, audioCtx.sampleRate * 3.5, audioCtx.sampleRate);
      const wd = windBuf.getChannelData(0);
      for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;
      const wind = audioCtx.createBufferSource();
      wind.buffer = windBuf;
      wind.loop = true;
      const wG = audioCtx.createGain();
      wG.gain.value = 0.28;
      const wlp = audioCtx.createBiquadFilter();
      wlp.type = 'lowpass';
      wlp.frequency.value = 410;
      const wbp = audioCtx.createBiquadFilter();
      wbp.type = 'bandpass';
      wbp.frequency.value = 185;
      wbp.Q.value = 0.7;
      // very slow LFO for wind gusts
      const wLfo = audioCtx.createOscillator();
      wLfo.type = 'sine';
      wLfo.frequency.value = 0.023;
      const wLfoG = audioCtx.createGain();
      wLfoG.gain.value = 0.09;
      wLfo.connect(wLfoG);
      wLfoG.connect(wG.gain);
      wind.connect(wbp);
      wbp.connect(wlp);
      wlp.connect(wG);
      wG.connect(master);
      wind.start();
      wLfo.start();
      stops.push(() => { try { wind.stop(); wLfo.stop(); } catch {} });

      // fire crackle — continuous noise bed with random short gain bursts (pops/snaps)
      const crackleBuf = audioCtx.createBuffer(1, audioCtx.sampleRate * 1.6, audioCtx.sampleRate);
      const cd = crackleBuf.getChannelData(0);
      for (let i = 0; i < cd.length; i++) cd[i] = Math.random() * 2 - 1;
      const crackle = audioCtx.createBufferSource();
      crackle.buffer = crackleBuf;
      crackle.loop = true;
      const cG = audioCtx.createGain();
      cG.gain.value = 0.0;
      const cBp = audioCtx.createBiquadFilter();
      cBp.type = 'bandpass';
      cBp.frequency.value = 1250;
      cBp.Q.value = 2.8;
      const cHp = audioCtx.createBiquadFilter();
      cHp.type = 'highpass';
      cHp.frequency.value = 620;
      crackle.connect(cBp);
      cBp.connect(cHp);
      cHp.connect(cG);
      cG.connect(master);
      crackle.start();
      stops.push(() => { try { crackle.stop(); } catch {} });

      // schedule irregular crackle bursts
      const doCrackle = () => {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        cG.gain.cancelScheduledValues(now);
        cG.gain.setValueAtTime(0.45, now);
        cG.gain.linearRampToValueAtTime(0.0, now + 0.07 + Math.random() * 0.09);
        timers.push(setTimeout(doCrackle, 180 + Math.random() * 520));
      };
      timers.push(setTimeout(doCrackle, 120 + Math.random() * 300));

      // owl calls — infrequent low hoot pairs (sine + light FM for natural call)
      const scheduleOwl = () => {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const hoot = audioCtx.createOscillator();
        hoot.type = 'sine';
        hoot.frequency.value = 178;
        const hG = audioCtx.createGain();
        hG.gain.value = 0.0;
        const fm = audioCtx.createOscillator();
        fm.type = 'sine';
        fm.frequency.value = 2.3;
        const fmG = audioCtx.createGain();
        fmG.gain.value = 18;
        fm.connect(fmG);
        fmG.connect(hoot.frequency);
        hoot.connect(hG);
        hG.connect(master);
        hoot.start(now);
        fm.start(now);
        hG.gain.setValueAtTime(0.0001, now);
        hG.gain.linearRampToValueAtTime(0.38, now + 0.18);
        hG.gain.linearRampToValueAtTime(0.0001, now + 1.15);
        stops.push(() => { try { hoot.stop(); fm.stop(); } catch {} });
        // softer second hoot
        setTimeout(() => {
          if (!audioCtx) return;
          const n2 = audioCtx.currentTime;
          const h2 = audioCtx.createOscillator();
          h2.type = 'sine';
          h2.frequency.value = 163;
          const h2G = audioCtx.createGain();
          h2G.gain.value = 0.0;
          h2.connect(h2G);
          h2G.connect(master);
          h2.start(n2);
          h2G.gain.setValueAtTime(0.0001, n2);
          h2G.gain.linearRampToValueAtTime(0.21, n2 + 0.22);
          h2G.gain.linearRampToValueAtTime(0.0001, n2 + 0.95);
          setTimeout(() => { try { h2.stop(); } catch {} }, 1200);
        }, 720);
        timers.push(setTimeout(scheduleOwl, 4200 + Math.random() * 6800));
      };
      timers.push(setTimeout(scheduleOwl, 2400 + Math.random() * 1800));

      // rare sharp wood pops (short transient click)
      const doWoodPop = () => {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const popBuf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.18, audioCtx.sampleRate);
        const pd = popBuf.getChannelData(0);
        for (let i = 0; i < pd.length; i++) {
          const t = i / audioCtx.sampleRate;
          pd[i] = (Math.random() * 2 - 1) * Math.exp(-t * 38);
        }
        const pop = audioCtx.createBufferSource();
        pop.buffer = popBuf;
        const pG = audioCtx.createGain();
        pG.gain.value = 0.6;
        const pBp = audioCtx.createBiquadFilter();
        pBp.type = 'bandpass';
        pBp.frequency.value = 1650;
        pBp.Q.value = 1.6;
        pop.connect(pBp);
        pBp.connect(pG);
        pG.connect(master);
        pop.start(now);
        setTimeout(() => { try { pop.stop(); } catch {} }, 400);
        timers.push(setTimeout(doWoodPop, 3400 + Math.random() * 9200));
      };
      timers.push(setTimeout(doWoodPop, 1800 + Math.random() * 2500));

      // bridge hook: notify phenomena bus (audio started for this scene)
      (window as any).__holoShellAudio = {
        scene: 'night-campfire',
        tracks: ['pine_wind', 'fire_crackle', 'owl_calls', 'wood_pops'],
        stop: () => {
          stops.forEach((f) => f());
          timers.forEach((t) => clearTimeout(t));
        },
      };
    } catch {
      // blocked until gesture or no WebAudio
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
      {/* === NIGHT SKY DOME (very dark, star field backdrop) === */}
      <mesh position={[0, 4.2, -5.2]}>
        <sphereGeometry args={[13, 18, 14]} />
        <meshBasicMaterial color="#0a0c14" side={1} />
      </mesh>

      {/* === STARS (high count, slow pulse — the only other light besides fire and moon) === */}
      <GlowField
        position={[0.2, 3.65, -4.8]}
        color="#f0f4ff"
        pulseRate={0.04}
        intensity={0.92}
        count={44}
      />
      {/* Secondary star layer — slightly lower, different color temperature */}
      <GlowField
        position={[-1.8, 2.9, -5.6]}
        color="#e8eeff"
        pulseRate={0.06}
        intensity={0.65}
        count={19}
      />

      {/* === BACKGROUND TREE SILHOUETTES (3-4 tall thin dark planes, forest wall) === */}
      {/* Far left tall pine-like silhouette */}
      <mesh position={[-5.8, 0.8, -7.8]} rotation={[0, 0.18, 0]}>
        <planeGeometry args={[1.8, 7.5]} />
        <meshBasicMaterial color="#0a0b0f" transparent opacity={0.92} side={2} />
      </mesh>
      {/* Mid-left cluster */}
      <mesh position={[-3.9, 0.55, -6.4]} rotation={[0, -0.12, 0]}>
        <planeGeometry args={[2.4, 6.8]} />
        <meshBasicMaterial color="#0c0d12" transparent opacity={0.91} side={2} />
      </mesh>
      {/* Far right silhouette */}
      <mesh position={[6.2, 0.9, -7.2]} rotation={[0, -0.25, 0]}>
        <planeGeometry args={[2.1, 7.2]} />
        <meshBasicMaterial color="#0a0b0f" transparent opacity={0.93} side={2} />
      </mesh>
      {/* Closer right tree mass (anchors door side) */}
      <mesh position={[4.8, 0.35, -5.3]} rotation={[0, 0.08, 0]}>
        <planeGeometry args={[1.6, 5.9]} />
        <meshBasicMaterial color="#0d0e13" transparent opacity={0.89} side={2} />
      </mesh>

      {/* === DARK EARTH GROUND (wide living sand plane, very dark) === */}
      <mesh position={[0, -1.78, -1.8]} rotation={[-Math.PI * 0.5, 0, 0]}>
        <planeGeometry args={[15, 9]} />
        <meshStandardMaterial color="#0f0a06" roughness={0.98} metalness={0.0} />
      </mesh>
      {/* Living raked earth overlay (subtle texture, no strong pattern — night hides detail) */}
      <SandCanvas
        position={[0.1, -1.76, -1.75]}
        rotation={[-Math.PI * 0.5, 0, 0]}
        scale={1.08}
        sandColor="#120d09"
        isUnderwater={false}
        rakePattern="none"
        onInteract={(uv) => onInteraction?.('earth_press', { uv })}
      />

      {/* === THREE LOG SEATS arranged in rough triangle around fire === */}
      {/* Log 1 — front left, horizontal */}
      <mesh position={[-1.45, -1.52, -1.25]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.195, 0.205, 2.55, 6]} />
        <meshStandardMaterial color="#1f1812" roughness={0.96} />
      </mesh>
      {/* Log 1 bark rings */}
      {[-0.7, 0.1, 0.85].map((x, i) => (
        <mesh key={i} position={[-1.45 + x * 0.08, -1.51, -1.25]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.208, 0.208, 0.11, 6]} />
          <meshStandardMaterial color="#15120f" roughness={0.98} />
        </mesh>
      ))}

      {/* Log 2 — front right */}
      <mesh position={[1.55, -1.53, -1.15]} rotation={[0, 0.12, Math.PI / 2]}>
        <cylinderGeometry args={[0.19, 0.2, 2.6, 6]} />
        <meshStandardMaterial color="#1c160f" roughness={0.95} />
      </mesh>
      {[-0.6, 0.2, 0.95].map((x, i) => (
        <mesh key={i} position={[1.55 + x * 0.07, -1.52, -1.15]} rotation={[0, 0.12, Math.PI / 2]}>
          <cylinderGeometry args={[0.203, 0.203, 0.1, 6]} />
          <meshStandardMaterial color="#120f0b" roughness={0.97} />
        </mesh>
      ))}

      {/* Log 3 — rear (between fire and door) */}
      <mesh position={[0.15, -1.54, -2.85]} rotation={[0, -0.85, Math.PI / 2]}>
        <cylinderGeometry args={[0.185, 0.195, 2.45, 6]} />
        <meshStandardMaterial color="#1a140e" roughness={0.97} />
      </mesh>
      {[-0.55, 0.05, 0.7].map((x, i) => (
        <mesh key={i} position={[0.15 + x * 0.06, -1.53, -2.85]} rotation={[0, -0.85, Math.PI / 2]}>
          <cylinderGeometry args={[0.2, 0.2, 0.09, 6]} />
          <meshStandardMaterial color="#110e0a" roughness={0.98} />
        </mesh>
      ))}

      {/* === CENTRAL CAMPFIRE (primary light + heat source) === */}
      <FireSource
        position={[0, -1.38, -1.82]}
        intensity={1.08}
        colorTemp={0.62}
        embers
        onProximity={handleFireProximity}
      />

      {/* Firelight warmth pointLight — placed inside the fire group per spec */}
      <pointLight
        position={[0, -1.22, -1.82]}
        intensity={2.05}
        color="#ff7722"
        distance={8.5}
        decay={2.0}
      />

      {/* === RISING SMOKE WISPS (gray, high above fire, low intensity) === */}
      <GlowField
        position={[0.05, 2.05, -1.82]}
        color="#888888"
        pulseRate={0.12}
        intensity={0.16}
        count={13}
      />
      {/* Higher thinner smoke layer */}
      <GlowField
        position={[-0.15, 3.1, -1.95]}
        color="#777a82"
        pulseRate={0.08}
        intensity={0.11}
        count={8}
      />

      {/* === EMBER / SPARK GLOW LAYERS (different heights for life) === */}
      <GlowField
        position={[0.08, 0.45, -1.88]}
        color="#ff9933"
        pulseRate={0.55}
        intensity={0.72}
        count={18}
      />
      {/* Lower ground embers near logs */}
      <GlowField
        position={[-0.4, -1.35, -1.55]}
        color="#ff7722"
        pulseRate={0.7}
        intensity={0.35}
        count={9}
      />

      {/* === MOON (high right, cold white) + HALO === */}
      <mesh position={[3.55, 4.55, -7.15]}>
        <sphereGeometry args={[0.36]} />
        <meshBasicMaterial color="#f0f0e0" />
      </mesh>
      {/* Subtle moon surface detail (small offset sphere) */}
      <mesh position={[3.48, 4.5, -7.05]}>
        <sphereGeometry args={[0.33]} />
        <meshBasicMaterial color="#e8e8d8" transparent opacity={0.4} />
      </mesh>
      {/* Moon halo / atmospheric bloom */}
      <GlowField
        position={[3.55, 4.52, -7.2]}
        color="#d8d8e8"
        pulseRate={0.03}
        intensity={0.55}
        count={7}
      />
      {/* Larger soft halo */}
      <GlowField
        position={[3.5, 4.4, -7.4]}
        color="#b8b8c8"
        pulseRate={0.02}
        intensity={0.28}
        count={5}
      />

      {/* === FIRE RING STONES (irregular, charred, surrounding pit) === */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const a = (i / 8) * Math.PI * 2 + 0.1;
        const r = 1.32 + (i % 3) * 0.04;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * r, -1.58, -1.82 + Math.sin(a) * (1.05 + (i % 2) * 0.1)]}
          >
            <sphereGeometry args={[0.26 + (i % 3) * 0.04]} />
            <meshStandardMaterial color="#2a2826" roughness={0.99} />
          </mesh>
        );
      })}

      {/* Small charred sticks / kindling near fire edge (natural detail) */}
      <mesh position={[-0.35, -1.52, -1.45]} rotation={[0.4, 0.8, 0]}>
        <cylinderGeometry args={[0.03, 0.035, 0.7, 4]} />
        <meshStandardMaterial color="#1a1612" roughness={0.98} />
      </mesh>
      <mesh position={[0.55, -1.53, -1.6]} rotation={[-0.3, -1.1, 0]}>
        <cylinderGeometry args={[0.028, 0.032, 0.55, 4]} />
        <meshStandardMaterial color="#15120f" roughness={0.97} />
      </mesh>

      {/* === SCENE DOOR embedded in the campfire ring of stones === */}
      <SceneDoor
        position={[3.2, -0.9, -2.6]}
        rotation={[0.02, -0.15, -0.01]}
        materialType="campfire_ring"
        destinationScene="ZenGardenCloseScene"
        onNavigate={handleNavigate}
        ariaLabel="Step away from the fire into the quiet garden close-up"
      />

      {/* Very distant low hill / ridge line for night horizon */}
      <mesh position={[0, -0.4, -8.2]} rotation={[0.02, 0, 0]}>
        <planeGeometry args={[18, 3.2]} />
        <meshBasicMaterial color="#0f1116" transparent opacity={0.85} side={2} />
      </mesh>

      {/* Ambient audio wired via HoloShell bridge (procedural synth; fire crackle, owl, wind, pops — see useEffect above) */}
    </group>
  );
};

export default NightCampfireScene;
