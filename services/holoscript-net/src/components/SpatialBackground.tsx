import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics, RigidBody, InstancedRigidBodies, InstancedRigidBodyProps, RapierRigidBody } from '@react-three/rapier';
import { Environment, Float, MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';

// Define the interface for cursors (same as App.tsx)
interface CursorState {
  x: number;
  y: number;
  color: string;
  label: string;
}

// Map a 2D DOM screen coordinate to a 3D world coordinate at z=0
function getWorldPosition(x: number, y: number, camera: THREE.Camera, size: { width: number, height: number }) {
  const vec = new THREE.Vector3();
  const pos = new THREE.Vector3();
  
  vec.set(
    (x / size.width) * 2 - 1,
    -(y / size.height) * 2 + 1,
    0.5
  );
  vec.unproject(camera);
  vec.sub(camera.position).normalize();
  
  const distance = -camera.position.z / vec.z;
  pos.copy(camera.position).add(vec.multiplyScalar(distance));
  return pos;
}

// A Kinematic body that follows a cursor
function CursorCollider({ x, y, isLocal }: { x: number, y: number, isLocal?: boolean }) {
  const rb = useRef<RapierRigidBody>(null);
  const { camera, size } = useThree();

  useFrame(() => {
    if (rb.current) {
      const worldPos = getWorldPosition(x, y, camera, size);
      // Kinematic position update overrides standard physics, pushing dynamic objects
      rb.current.setNextKinematicTranslation({ x: worldPos.x, y: worldPos.y, z: 0 });
    }
  });

  return (
    <RigidBody ref={rb} type="kinematicPosition" colliders="ball">
      <mesh>
        <sphereGeometry args={[isLocal ? 0.8 : 0.6, 16, 16]} />
        <meshStandardMaterial color={isLocal ? "#00ffff" : "#ff00ff"} transparent opacity={0} />
      </mesh>
    </RigidBody>
  );
}

const COUNT = 300; // Number of floating reactive particles

function SwarmParticles() {
  // Generate random clustered particles
  const instances = useMemo(() => {
    const bodies: InstancedRigidBodyProps[] = [];
    for (let i = 0; i < COUNT; i++) {
      bodies.push({
        key: 'instance_' + i,
        position: [(Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 2],
        rotation: [Math.random() * Math.PI, Math.random() * Math.PI, 0],
      });
    }
    return bodies;
  }, []);

  return (
    <InstancedRigidBodies
      positions={instances.map(i => i.position as [number, number, number])}
      rotations={instances.map(i => i.rotation as [number, number, number])}
      colliders="hull"
    >
      <instancedMesh args={[undefined, undefined, COUNT]} castShadow receiveShadow>
        <octahedronGeometry args={[0.3, 0]} />
        <meshPhysicalMaterial 
          color="#aa00ff" 
          emissive="#00ffff"
          emissiveIntensity={0.15}
          roughness={0.1}
          metalness={0.1}
          transmission={0.9}
          thickness={0.5}
          ior={1.5}
        />
      </instancedMesh>
    </InstancedRigidBodies>
  );
}

function CodeToRealityStage({ scrollY }: { scrollY: number }) {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  
  // normalized scroll value between 0 and 1, assuming 2000px roughly is the bottom of the landing page
  const scrollProgress = Math.min(Math.max(scrollY / 2000, 0), 1);
  
  // Transform into liquid goop much earlier in the page
  const goopProgress = Math.min(Math.max((scrollY - 1200) / 1500, 0), 1);
  
  useFrame(() => {
    // Scroll 1 -> Scroll 3 camera dive
    const targetZ = 8 - (scrollProgress * 4);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.05);

    if (groupRef.current) {
      groupRef.current.rotation.y += 0.002;
      groupRef.current.rotation.x = scrollProgress * Math.PI;
      // Move around dynamically as you scroll into goop territory
      groupRef.current.position.y = Math.sin(goopProgress * Math.PI) * 1.25;
      groupRef.current.position.x = Math.sin(goopProgress * Math.PI * 2) * 0.75;
    }
  });

  // Calculate opacities based on scroll phases
  // Phase A: Code fragments fade out after scroll 0.3
  const phaseA = Math.max(0, 1 - (scrollProgress * 3));
  // Phase B: Wireframe peaks around 0.5
  const phaseB = scrollProgress < 0.5 ? scrollProgress * 2 : 2 - (scrollProgress * 2);
  // Phase C: Solid architectural geometry fades in after 0.5
  const phaseC = Math.max(0, (scrollProgress - 0.5) * 2);

  return (
    <group ref={groupRef}>
      {/* Phase A: Syntax Fragments */}
      <group visible={phaseA > 0}>
        <mesh position={[-3, 2, 0]}>
          <planeGeometry args={[2, 0.5]} />
          <meshBasicMaterial color="#00ffff" transparent opacity={phaseA * 0.5} />
        </mesh>
        <mesh position={[4, -1, -2]}>
          <planeGeometry args={[2.5, 0.5]} />
          <meshBasicMaterial color="#ff00ff" transparent opacity={phaseA * 0.5} />
        </mesh>
        <mesh position={[-2, -3, 1]}>
          <planeGeometry args={[1.5, 0.5]} />
          <meshBasicMaterial color="#00ff88" transparent opacity={phaseA * 0.5} />
        </mesh>
      </group>

      {/* Phase B & C: The Morphing Core Object */}
      <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
        <group scale={[1 + phaseC * 0.9, 1 + phaseC * 0.9, 1 + phaseC * 0.9]}>
          {/* Solid inner core transforming to liquid */}
          <mesh>
            <icosahedronGeometry args={[1, 64]} />
            <MeshDistortMaterial 
              color="#1a1a2e" 
              emissive="#ff00ff"
              emissiveIntensity={phaseC}
              roughness={0.2} 
              metalness={0.8} 
              transparent
              opacity={phaseC}
              depthTest={false}
              distort={0.1 + goopProgress * 0.45}
              speed={0.8 + goopProgress * 1.8}
            />
          </mesh>
          {/* Wireframe overlay */}
          <mesh scale={1.05}>
            <icosahedronGeometry args={[1, 1]} />
            <meshStandardMaterial 
              color="#00ffff" 
              wireframe={true} 
              transparent 
              opacity={phaseB * 0.8} 
            />
          </mesh>
        </group>
      </Float>
    </group>
  );
}

export default function SpatialBackground({ 
  peers, 
  localCursor,
  scrollY
}: { 
  peers: Record<string, CursorState>,
  localCursor: { x: number, y: number },
  scrollY: number
}) {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 0, 8], fov: 50 }}>
        <color attach="background" args={['#050505']} />
        <fog attach="fog" args={['#050505', 5, 25]} />
        <ambientLight intensity={0.2} />
        <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
        <pointLight position={[-10, -10, -5]} intensity={0.5} color="#ff00ff" />
        
        <React.Suspense fallback={null}>
          <Environment preset="city" />
          <CodeToRealityStage scrollY={scrollY} />

          <Physics gravity={[0, 0, 0]}>
            <SwarmParticles />
            
            {/* Local mouse physics collider */}
            <CursorCollider x={localCursor.x} y={localCursor.y} isLocal />
            
            {/* Remote peers physics colliders */}
            {Object.entries(peers).map(([id, state]) => (
              <CursorCollider key={id} x={state.x} y={state.y} />
            ))}

            {/* Boundaries to keep particles inside the screen roughly */}
            <RigidBody type="fixed" position={[0, 25, 0]}>
              <boxGeometry args={[30, 1, 10]} />
            </RigidBody>
            <RigidBody type="fixed" position={[0, -25, 0]}>
              <boxGeometry args={[30, 1, 10]} />
            </RigidBody>
            <RigidBody type="fixed" position={[25, 0, 0]}>
              <boxGeometry args={[1, 30, 10]} />
            </RigidBody>
            <RigidBody type="fixed" position={[-25, 0, 0]}>
              <boxGeometry args={[1, 30, 10]} />
            </RigidBody>
          </Physics>
        </React.Suspense>
      </Canvas>
    </div>
  );
}
