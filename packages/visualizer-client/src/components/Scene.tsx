import { useRef, Fragment } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Stars } from '@react-three/drei';
import { Orb } from './Orb';
import { OrbitalPath } from './OrbitalPath';
import type { OrbData } from '../types';
import * as THREE from 'three';

interface SceneProps {
  orbs: OrbData[];
  selectedOrbId: string | null;
  onSelectOrb: (id: string | null) => void;
  timeScale?: number;
  julianDate?: number;
}

const SceneContent = ({
  orbs,
  selectedOrbId,
  onSelectOrb,
  timeScale = 1,
  julianDate = 0,
}: SceneProps) => {
  const controlsRef = useRef<any>(null);

  useFrame(() => {
    if (selectedOrbId && controlsRef.current) {
      const selectedOrb = orbs.find((o) => o.id === selectedOrbId);
      if (selectedOrb && selectedOrb.position && typeof selectedOrb.position.x === 'number') {
        // Smoothly lerp the OrbitControls target to the selected orb's position
        controlsRef.current.target.lerp(
          new THREE.Vector3(selectedOrb.position.x, selectedOrb.position.y, selectedOrb.position.z),
          0.1
        );
        controlsRef.current.update();
      }
    }
  });

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} />

      {/* Environment */}
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      <Grid
        args={[100, 100]}
        cellColor="#6f6f6f"
        sectionColor="#9d4b4b"
        fadeDistance={50}
        fadeStrength={1}
        position={[0, -0.01, 0]}
      />

      {/* Render all Orbs and their Paths */}
      {orbs.map((orb) => {
        const parentProp = orb.properties?.parent;
        const parentId =
          typeof parentProp === 'object' && parentProp !== null
            ? (parentProp as Record<string, unknown>).id
            : parentProp;
        const parentOrb = parentId ? orbs.find((o) => o.id === parentId) : undefined;
        return (
          <Fragment key={orb.id}>
            <Orb
              orb={orb}
              onSelect={onSelectOrb}
              isSelected={selectedOrbId === orb.id}
              timeScale={timeScale}
              julianDate={julianDate}
            />
            {orb.properties?.semiMajorAxis && <OrbitalPath orb={orb} parentOrb={parentOrb} />}
          </Fragment>
        );
      })}

      {/* Camera Controls */}
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.05}
        minDistance={1}
        maxDistance={500}
      />
    </>
  );
};

export const Scene = (props: SceneProps) => {
  return (
    <Canvas
      camera={{ position: [50, 50, 50], fov: 60 }}
      onPointerMissed={() => props.onSelectOrb(null)}
    >
      <SceneContent {...props} />
    </Canvas>
  );
};
