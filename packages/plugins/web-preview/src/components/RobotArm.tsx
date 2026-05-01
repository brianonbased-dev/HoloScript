import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Professional Industrial Robot Arm (6-Axis Style)
 * Realistic details: motor housings, cable conduits, detailed gripper
 */
export function RobotArm() {
  const joint1Ref = useRef<THREE.Group>(null);
  const joint2Ref = useRef<THREE.Group>(null);
  const gripperRef = useRef<THREE.Group>(null);

  const [joint1Angle, setJoint1Angle] = useState(0);
  const [joint2Angle, setJoint2Angle] = useState(0);
  const [gripperOpen, setGripperOpen] = useState(0);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    setJoint1Angle(Math.sin(t * 0.5) * 0.5);
    setJoint2Angle(Math.sin(t * 0.7) * 0.4);
    setGripperOpen(Math.abs(Math.sin(t * 2)) * 0.15);
  });

  if (joint1Ref.current) joint1Ref.current.rotation.z = joint1Angle;
  if (joint2Ref.current) joint2Ref.current.rotation.z = joint2Angle;

  return (
    <group position={[0, 0.8, 0]}>
      {/* Heavy Duty Base Platform */}
      <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.1, 0.5]} />
        <meshStandardMaterial color="#1a237e" metalness={0.9} roughness={0.2} />
      </mesh>
      {/* Base mounting bolts */}
      {[-0.18, 0.18].map((x, i) =>
        [-0.18, 0.18].map((z, j) => (
          <mesh key={`${i}-${j}`} position={[x, 0.11, z]} castShadow>
            <cylinderGeometry args={[0.015, 0.015, 0.03, 8]} />
            <meshStandardMaterial color="#424242" metalness={0.95} roughness={0.1} />
          </mesh>
        ))
      )}

      {/* Rotating Base Column */}
      <mesh position={[0, 0.15, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.2, 0.15, 16]} />
        <meshStandardMaterial color="#283593" metalness={0.85} roughness={0.25} />
      </mesh>

      {/* Joint 1 - Shoulder Assembly */}
      <group ref={joint1Ref} position={[0, 0.23, 0]}>
        {/* Main motor housing (cylindrical body) */}
        <mesh position={[0, 0, 0]} castShadow rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.12, 0.12, 0.16, 16]} />
          <meshStandardMaterial color="#1565c0" metalness={0.9} roughness={0.15} />
        </mesh>

        {/* Motor end caps */}
        <mesh position={[0, 0, 0.085]} castShadow>
          <cylinderGeometry args={[0.1, 0.1, 0.02, 16]} />
          <meshStandardMaterial color="#0d47a1" metalness={0.95} roughness={0.05} />
        </mesh>
        <mesh position={[0, 0, -0.085]} castShadow>
          <cylinderGeometry args={[0.1, 0.1, 0.02, 16]} />
          <meshStandardMaterial color="#0d47a1" metalness={0.95} roughness={0.05} />
        </mesh>

        {/* Upper Arm Assembly */}
        <group position={[0.14, 0, 0]}>
          {/* Main structural beam (I-beam style) */}
          <mesh position={[0.4, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <boxGeometry args={[0.1, 0.8, 0.08]} />
            <meshStandardMaterial color="#388e3c" metalness={0.75} roughness={0.35} />
          </mesh>

          {/* I-beam flanges */}
          <mesh position={[0.4, 0, 0.042]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <boxGeometry args={[0.08, 0.76, 0.012]} />
            <meshStandardMaterial color="#2e7d32" metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh position={[0.4, 0, -0.042]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <boxGeometry args={[0.08, 0.76, 0.012]} />
            <meshStandardMaterial color="#2e7d32" metalness={0.8} roughness={0.3} />
          </mesh>

          {/* Cable conduit along arm */}
          <mesh position={[0.4, 0.045, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.012, 0.012, 0.7, 8]} />
            <meshStandardMaterial color="#212121" metalness={0.6} roughness={0.5} />
          </mesh>

          {/* Joint 2 - Elbow Assembly */}
          <group ref={joint2Ref} position={[0.82, 0, 0]}>
            {/* Elbow motor housing */}
            <mesh position={[0, 0, 0]} castShadow rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.1, 0.1, 0.14, 16]} />
              <meshStandardMaterial color="#f57c00" metalness={0.9} roughness={0.15} />
            </mesh>

            {/* Motor end caps */}
            <mesh position={[0, 0, 0.075]} castShadow>
              <cylinderGeometry args={[0.085, 0.085, 0.02, 16]} />
              <meshStandardMaterial color="#e65100" metalness={0.95} roughness={0.05} />
            </mesh>

            {/* Forearm Assembly */}
            <group position={[0.13, 0, 0]}>
              {/* Forearm structural beam */}
              <mesh position={[0.4, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
                <boxGeometry args={[0.08, 0.8, 0.06]} />
                <meshStandardMaterial color="#ff6f00" metalness={0.75} roughness={0.35} />
              </mesh>

              {/* Cable conduit */}
              <mesh position={[0.4, 0.038, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.01, 0.01, 0.75, 8]} />
                <meshStandardMaterial color="#212121" metalness={0.6} roughness={0.5} />
              </mesh>

              {/* Wrist Assembly */}
              <mesh position={[0.82, 0, 0]} castShadow rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.06, 0.06, 0.1, 16]} />
                <meshStandardMaterial color="#d32f2f" metalness={0.85} roughness={0.2} />
              </mesh>

              {/* Professional Gripper Hand */}
              <group ref={gripperRef} position={[0.88, 0, 0]}>
                {/* Gripper base/palm */}
                <mesh position={[0, 0, 0]} castShadow rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.045, 0.05, 0.1, 12]} />
                  <meshStandardMaterial color="#c62828" metalness={0.9} roughness={0.15} />
                </mesh>

                {/* Pneumatic cylinders for fingers */}
                <mesh position={[0.03, 0.025, 0]} castShadow rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.008, 0.008, 0.04, 8]} />
                  <meshStandardMaterial color="#616161" metalness={0.9} roughness={0.2} />
                </mesh>
                <mesh position={[0.03, -0.025, 0]} castShadow rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.008, 0.008, 0.04, 8]} />
                  <meshStandardMaterial color="#616161" metalness={0.9} roughness={0.2} />
                </mesh>

                {/* Left Finger Assembly */}
                <group position={[0, gripperOpen, 0]}>
                  {/* Finger base */}
                  <mesh position={[0.06, 0, 0]} castShadow>
                    <boxGeometry args={[0.1, 0.025, 0.035]} />
                    <meshStandardMaterial color="#9e9e9e" metalness={0.95} roughness={0.1} />
                  </mesh>
                  {/* Finger joint */}
                  <mesh position={[0.115, 0, 0]} castShadow>
                    <cylinderGeometry args={[0.015, 0.015, 0.04, 8]} />
                    <meshStandardMaterial color="#757575" metalness={0.9} roughness={0.15} />
                  </mesh>
                  {/* Finger tip with grip pads */}
                  <mesh position={[0.14, 0, 0]} castShadow>
                    <boxGeometry args={[0.04, 0.022, 0.032]} />
                    <meshStandardMaterial color="#616161" metalness={0.85} roughness={0.2} />
                  </mesh>
                  {/* Rubber grip pads */}
                  <mesh position={[0.161, 0, 0]} castShadow>
                    <boxGeometry args={[0.003, 0.018, 0.028]} />
                    <meshStandardMaterial color="#1a1a1a" metalness={0.1} roughness={0.9} />
                  </mesh>
                </group>

                {/* Right Finger Assembly (mirror) */}
                <group position={[0, -gripperOpen, 0]}>
                  <mesh position={[0.06, 0, 0]} castShadow>
                    <boxGeometry args={[0.1, 0.025, 0.035]} />
                    <meshStandardMaterial color="#9e9e9e" metalness={0.95} roughness={0.1} />
                  </mesh>
                  <mesh position={[0.115, 0, 0]} castShadow>
                    <cylinderGeometry args={[0.015, 0.015, 0.04, 8]} />
                    <meshStandardMaterial color="#757575" metalness={0.9} roughness={0.15} />
                  </mesh>
                  <mesh position={[0.14, 0, 0]} castShadow>
                    <boxGeometry args={[0.04, 0.022, 0.032]} />
                    <meshStandardMaterial color="#616161" metalness={0.85} roughness={0.2} />
                  </mesh>
                  <mesh position={[0.161, 0, 0]} castShadow>
                    <boxGeometry args={[0.003, 0.018, 0.028]} />
                    <meshStandardMaterial color="#1a1a1a" metalness={0.1} roughness={0.9} />
                  </mesh>
                </group>

                {/* Status LEDs */}
                <mesh position={[0, 0, 0.055]}>
                  <sphereGeometry args={[0.008, 12, 12]} />
                  <meshStandardMaterial
                    color="#00ff00"
                    emissive="#00ff00"
                    emissiveIntensity={2}
                    toneMapped={false}
                  />
                </mesh>
                <mesh position={[0.02, 0, 0.055]}>
                  <sphereGeometry args={[0.006, 12, 12]} />
                  <meshStandardMaterial
                    color="#2196f3"
                    emissive="#2196f3"
                    emissiveIntensity={1.5}
                    toneMapped={false}
                  />
                </mesh>
              </group>
            </group>
          </group>
        </group>
      </group>

      {/* Shadow plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <shadowMaterial opacity={0.3} />
      </mesh>
    </group>
  );
}
