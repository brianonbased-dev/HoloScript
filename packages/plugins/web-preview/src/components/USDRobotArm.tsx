import { useEffect, useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { USDParser, USDScene, USDMesh, _USDJoint } from '../parsers/USDParser';

/**
 * Robot Arm Renderer from USD
 * Loads and renders actual HoloScript-compiled USD file
 */
export function USDRobotArm() {
  const [scene, setScene] = useState<USDScene | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const jointRefs = useRef<Map<string, THREE.Group>>(new Map());
  const [_jointAngles, setJointAngles] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    fetch('/assets/arm_validated.usd')
      .then((res) => {
        return res.text();
      })
      .then((usdContent) => {
        const parser = new USDParser();
        const parsedScene = parser.parse(usdContent);
        setScene(parsedScene);
        setLoading(false);

        // Initialize joint angles
        const angles = new Map<string, number>();
        parsedScene.joints.forEach((joint) => {
          angles.set(joint.name, 0);
        });
        setJointAngles(angles);
      })
      .catch((err) => {
        console.error('🔴 USDRobotArm: Error loading USD:', err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Animate joints
  useFrame(({ clock }) => {
    if (!scene) return;

    const t = clock.getElapsedTime();
    const newAngles = new Map<string, number>();

    scene.joints.forEach((joint, index) => {
      // Different animation for each joint
      const angle = Math.sin(t * (0.5 + index * 0.2)) * 0.5;
      newAngles.set(joint.name, angle);

      const group = jointRefs.current.get(joint.child);
      if (group) {
        // Apply rotation based on axis
        if (joint.axis === 'X') group.rotation.x = angle;
        else if (joint.axis === 'Y') group.rotation.y = angle;
        else if (joint.axis === 'Z') group.rotation.z = angle;
      }
    });

    setJointAngles(newAngles);
  });

  if (loading) {
    return (
      <group position={[0, 0.8, 0]}>
        <mesh>
          <boxGeometry args={[0.2, 0.2, 0.2]} />
          <meshStandardMaterial color="#2196f3" />
        </mesh>
      </group>
    );
  }

  if (error || !scene) {
    console.error('🔴 USDRobotArm: Render error or no scene');
    return (
      <group position={[0, 0.8, 0]}>
        <mesh>
          <sphereGeometry args={[0.2]} />
          <meshStandardMaterial color="#f44336" />
        </mesh>
      </group>
    );
  }

  // Build hierarchy based on joints
  const meshMap = new Map<string, USDMesh>();
  scene.meshes.forEach((mesh) => meshMap.set(mesh.name, mesh));

  // Find root meshes (not children of any joint)
  const childMeshes = new Set(scene.joints.map((j) => j.child));
  const rootMeshes = scene.meshes.filter((m) => !childMeshes.has(m.name));

  const renderMeshLocal = (mesh: USDMesh) => {
    const color = mesh.color || [0.8, 0.8, 0.8];

    // Determine visual style based on mesh type and name
    let material: React.ReactElement;
    let additionalDetails: React.ReactElement[] = [];

    if (mesh.name === 'base') {
      // Base gets heavy industrial look with platform
      material = (
        <meshStandardMaterial
          color="#1a237e"
          metalness={0.9}
          roughness={0.2}
          envMapIntensity={1.5}
        />
      );
      // Add mounting details
      additionalDetails = [
        <mesh key="platform" position={[0, -0.05, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.5, 0.1, 0.5]} />
          <meshStandardMaterial color="#0d47a1" metalness={0.9} roughness={0.15} />
        </mesh>,
      ];
    } else if (mesh.name.includes('link')) {
      // Links get structural industrial look with motor housing
      const linkColor = mesh.name === 'link1' ? '#388e3c' : '#ff6f00';
      material = (
        <meshStandardMaterial
          color={linkColor}
          metalness={0.75}
          roughness={0.35}
          envMapIntensity={1.2}
        />
      );
      // Add motor housing at base of link
      const motorColor = mesh.name === 'link1' ? '#1565c0' : '#f57c00';
      additionalDetails = [
        <mesh
          key="motor"
          position={[0, -(mesh.height || 0.5) / 2, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
          receiveShadow
        >
          <cylinderGeometry args={[0.12, 0.12, 0.14, 32]} />
          <meshStandardMaterial color={motorColor} metalness={0.9} roughness={0.15} />
        </mesh>,
        <mesh
          key="motor-cap1"
          position={[0, -(mesh.height || 0.5) / 2, 0.075]}
          castShadow
          receiveShadow
        >
          <cylinderGeometry args={[0.1, 0.1, 0.02, 32]} />
          <meshStandardMaterial color={motorColor} metalness={0.95} roughness={0.05} />
        </mesh>,
        <mesh
          key="motor-cap2"
          position={[0, -(mesh.height || 0.5) / 2, -0.075]}
          castShadow
          receiveShadow
        >
          <cylinderGeometry args={[0.1, 0.1, 0.02, 32]} />
          <meshStandardMaterial color={motorColor} metalness={0.95} roughness={0.05} />
        </mesh>,
      ];
    } else if (mesh.name === 'end_effector') {
      // End effector gets gripper-like appearance
      material = (
        <meshStandardMaterial
          color="#c62828"
          metalness={0.85}
          roughness={0.2}
          emissive="#c62828"
          emissiveIntensity={0.1}
        />
      );
      // Add status LED
      additionalDetails = [
        <mesh key="led" position={[0, 0, (mesh.radius || 0.08) + 0.01]}>
          <sphereGeometry args={[0.01, 16, 16]} />
          <meshStandardMaterial
            color="#00ff00"
            emissive="#00ff00"
            emissiveIntensity={2}
            toneMapped={false}
          />
        </mesh>,
      ];
    } else {
      // Default industrial metal
      material = (
        <meshStandardMaterial
          color={new THREE.Color(color[0], color[1], color[2])}
          metalness={0.8}
          roughness={0.3}
          envMapIntensity={1.0}
        />
      );
    }

    let geometry: React.ReactElement;

    if (mesh.type === 'Cylinder') {
      geometry = (
        <cylinderGeometry args={[mesh.radius || 0.1, mesh.radius || 0.1, mesh.height || 0.1, 32]} />
      );
    } else if (mesh.type === 'Sphere') {
      geometry = <sphereGeometry args={[mesh.radius || 0.1, 32, 32]} />;
    } else {
      geometry = <boxGeometry args={[0.1, 0.1, 0.1]} />;
    }

    return (
      <>
        <mesh key={mesh.name} castShadow receiveShadow>
          {geometry}
          {material}
        </mesh>
        {additionalDetails}
      </>
    );
  };

  const renderHierarchy = (meshName: string, depth = 0): React.ReactElement => {
    const mesh = meshMap.get(meshName);
    if (!mesh) return <></>;

    // Find joints where this mesh is the parent
    const childJoints = scene.joints.filter((j) => j.parent === meshName);

    const pos = mesh.position || [0, 0, 0];

    return (
      <group
        key={meshName}
        position={pos as [number, number, number]}
        ref={(ref) => {
          if (ref) jointRefs.current.set(meshName, ref);
        }}
      >
        {/* Render mesh at local origin since group is already positioned */}
        {renderMeshLocal(mesh)}

        {/* Render child joints and their connected bodies */}
        {childJoints.map((joint) => {
          const jointPos = joint.localPos0 || [0, 0, 0];
          const childMesh = meshMap.get(joint.child);

          // Calculate child's position relative to this joint
          // Child's absolute position minus (parent position + joint offset)
          const childAbsPos = childMesh?.position || [0, 0, 0];
          const parentAbsPos = pos;
          const childRelPos = [
            childAbsPos[0] - (parentAbsPos[0] + jointPos[0]),
            childAbsPos[1] - (parentAbsPos[1] + jointPos[1]),
            childAbsPos[2] - (parentAbsPos[2] + jointPos[2]),
          ];

          return (
            <group
              key={joint.name}
              position={jointPos as [number, number, number]}
              ref={(ref) => {
                if (ref) jointRefs.current.set(joint.child, ref);
              }}
            >
              <group position={childRelPos as [number, number, number]}>
                {renderHierarchy(joint.child, depth + 1)}
              </group>
            </group>
          );
        })}
      </group>
    );
  };

  // SIMPLE MODE: Just render all meshes flat (for debugging)
  const _renderAllMeshesFlat = () => {
    return scene.meshes.map((mesh) => {
      const pos = mesh.position || [0, 0, 0];
      const color = mesh.color || [0.8, 0.8, 0.8];

      let geometry: React.ReactElement;

      if (mesh.type === 'Cylinder') {
        const r = mesh.radius || 0.1;
        const h = mesh.height || 0.1;
        geometry = <cylinderGeometry args={[r, r, h, 16]} />;
      } else if (mesh.type === 'Sphere') {
        geometry = <sphereGeometry args={[mesh.radius || 0.1, 16, 16]} />;
      } else {
        geometry = <boxGeometry args={[0.1, 0.1, 0.1]} />;
      }

      return (
        <mesh key={mesh.name} position={[pos[0], pos[1], pos[2]]} castShadow>
          {geometry}
          <meshStandardMaterial
            color={new THREE.Color(color[0], color[1], color[2])}
            metalness={0.7}
            roughness={0.3}
          />
        </mesh>
      );
    });
  };

  return (
    <group position={[0, 0, 0]}>
      {/* Debug marker - green sphere to show USD mode is active */}
      <mesh position={[-2, 1, 0]}>
        <sphereGeometry args={[0.1]} />
        <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={1} />
      </mesh>

      {/* Render hierarchical robot arm based on joints */}
      {rootMeshes.map((mesh) => renderHierarchy(mesh.name))}

      {/* Shadow plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <shadowMaterial opacity={0.3} />
      </mesh>
    </group>
  );
}
