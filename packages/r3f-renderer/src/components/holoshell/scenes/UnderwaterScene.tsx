/**
 * UnderwaterScene
 *
 * Default HoloShell starter scene.
 * Glass panel frame + BubbleField + SandCanvas (underwater) + WaterSurface + GlowField (kelp) + SceneDoor.
 *
 * This is the canonical "first experience". Must feel beautiful, alive, and inviting.
 * Follows every design rule: always animating, natural interactions only, SceneDoor as sole nav.
 *
 * @module holoshell/scenes/UnderwaterScene
 */

import React from 'react';
import { useThree } from '@react-three/fiber';
import type { SceneComponentProps } from '../types';
import { BubbleField } from '../phenomena/BubbleField';
import { WaterSurface } from '../phenomena/WaterSurface';
import { SandCanvas } from '../phenomena/SandCanvas';
import { GlowField } from '../phenomena/GlowField';
import { SceneDoor } from '../phenomena/SceneDoor';

export interface UnderwaterSceneProps extends SceneComponentProps {}

/**
 * The default scene every new user sees.
 * Camera looks into the glass-panel "porthole" of an underwater world.
 */
const UnderwaterScene: React.FC<UnderwaterSceneProps> = ({
  onNavigateRequest,
  onInteraction,
}) => {
  const { camera } = useThree();

  // Slight downward look into the scene (matches .holo spirit)
  React.useEffect(() => {
    camera.lookAt(0.1, -0.6, -1.8);
  }, [camera]);

  // HoloShell audio bridge — underwater ambient tracks (procedural, zero-asset)
  // "underwater_ambience" + "soft_current_flow" as faint looping bed.
  // Uses Web Audio (AudioContext + oscillators + noise). Starts on mount.
  // Future: swap to real clips via HoloScript asset refs or <audio src={bridgeUrl}>.
  // Triggers phenomena bus so external (haptics, HoloMesh) can react.
  React.useEffect(() => {
    let ctx: AudioContext | null = null;
    const stops: Array<() => void> = [];
    try {
      ctx = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
      const master = ctx.createGain();
      master.gain.value = 0.055; // very faint ambient
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 520;
      master.connect(lp);
      lp.connect(ctx.destination);

      // soft_current_flow — ultra-low sine with slow LFO drift
      const flow = ctx.createOscillator();
      flow.type = 'sine';
      flow.frequency.value = 29;
      const flowG = ctx.createGain();
      flowG.gain.value = 0.65;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.06;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 3.2;
      lfo.connect(lfoG);
      lfoG.connect(flow.frequency);
      flow.connect(flowG);
      flowG.connect(master);
      flow.start();
      lfo.start();
      stops.push(() => { try { flow.stop(); lfo.stop(); } catch {} });

      // underwater_ambience — soft filtered noise wash (bubbles/current)
      const nBuf = ctx.createBuffer(1, ctx.sampleRate * 2.8, ctx.sampleRate);
      const nd = nBuf.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = nBuf;
      noise.loop = true;
      const nG = ctx.createGain();
      nG.gain.value = 0.32;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 155;
      bp.Q.value = 0.55;
      const nlp = ctx.createBiquadFilter();
      nlp.type = 'lowpass';
      nlp.frequency.value = 680;
      noise.connect(bp);
      bp.connect(nlp);
      nlp.connect(nG);
      nG.connect(master);
      noise.start();
      stops.push(() => { try { noise.stop(); } catch {} });

      // bridge hook: notify phenomena bus (audio started for this scene)
      // consumers (haptics, recording, remote) can listen via context
      (window as any).__holoShellAudio = { scene: 'underwater', tracks: ['underwater_ambience', 'soft_current_flow'], stop: () => stops.forEach(f => f()) };
    } catch {
      // blocked until gesture or no WebAudio
    }
    return () => {
      stops.forEach((f) => f());
      if (ctx) { try { ctx.close(); } catch {} }
    };
  }, []);

  const handleDoorNavigate = (sceneId: string) => {
    onNavigateRequest?.(sceneId as any);
    onInteraction?.('door_opened', { destination: sceneId });
  };

  const handleBubblePop = (id: number) => {
    onInteraction?.('bubble_pop', { id });
    // Audio/haptic bridge active — phenomena can now emit to HoloShell audio layer
    // navigator.vibrate?.(8);
  };

  const handleSandInteract = (uv: [number, number]) => {
    onInteraction?.('sand_ripple', { uv });
  };

  return (
    <group>
      {/* === GLASS PANEL FRAME (subtle porthole / fishtank) === */}
      {/* Slightly tinted glass rectangle at screen plane */}
      <mesh position={[0, 0, 2.35]} renderOrder={10}>
        <planeGeometry args={[13, 9]} />
        <meshPhysicalMaterial
          color="#aaccff"
          metalness={0.0}
          roughness={0.05}
          transmission={0.92}
          thickness={0.4}
          transparent
          opacity={0.15}
          envMapIntensity={0.2}
          side={1}
        />
      </mesh>

      {/* Soft vignette ring to reinforce frame edges */}
      <mesh position={[0, 0, 2.33]} renderOrder={11}>
        <ringGeometry args={[5.8, 7.2, 64]} />
        <meshBasicMaterial
          color="#334466"
          transparent
          opacity={0.18}
          side={2}
        />
      </mesh>

      {/* === SAND FLOOR (with rake ripples, underwater wetness) === */}
      <SandCanvas
        position={[0, -1.82, -1.5]}
        rotation={[-Math.PI * 0.5, 0, 0]}
        sandColor="#c8b57a"
        isUnderwater
        rakePattern="ripple"
        onInteract={handleSandInteract}
      />

      {/* === WATER SURFACE (with light rays) === */}
      <WaterSurface
        position={[0, 1.55, -1.55]}
        rotation={[-Math.PI * 0.48, 0.04, 0]}
        color="#1a6fa8"
        lightRays
        rayCount={6}
        rayOpacity={0.38}
        caustics
      />

      {/* === RISING BUBBLES (primary interaction) === */}
      <BubbleField
        position={[0, -1.48, -2.05]}
        count={20}
        floatSpeed={0.25}
        onPop={handleBubblePop}
        respawn
      />

      {/* === KELP BIOLUMINESCENCE GLOW === */}
      <GlowField
        position={[1.0, 0.05, -2.55]}
        color="#20ff8a"
        pulseRate={0.3}
        intensity={0.58}
        count={14}
      />

      {/* Additional subtle left kelp glow for depth */}
      <GlowField
        position={[-1.8, -0.6, -2.8]}
        color="#33ddaa"
        pulseRate={0.22}
        intensity={0.4}
        count={8}
      />

      {/* === SCENE DOOR (only navigation element) === */}
      <SceneDoor
        position={[-1.2, -0.82, -2.05]}
        rotation={[0.03, 0.12, -0.01]}
        materialType="underwater_rock"
        destinationScene="WarmLibraryScene"
        onNavigate={handleDoorNavigate}
        ariaLabel="Enter the warm library through the rock door"
      />

      {/* Ambient audio wired via HoloShell bridge (procedural synth; see useEffect above) */}
    </group>
  );
};

export default UnderwaterScene;
