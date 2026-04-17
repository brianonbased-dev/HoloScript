import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { PDBLoader } from 'three/examples/jsm/loaders/PDBLoader.js';
import { R3FNode } from '@holoscript/core';

export function BiologicalMeshNode({ node }: { node: R3FNode }) {
  const { props } = node;
  const pdbData = props.pdb_data || props.pdbData;
  const isLigand = node.props.hsType === 'molecule';
  
  const pdb = useMemo(() => {
    if (!pdbData) return null;
    const loader = new PDBLoader();
    try {
      return loader.parse(pdbData);
    } catch (e) {
      console.error("Failed to parse PDB", e);
      return null;
    }
  }, [pdbData]);

  const groupRef = useRef<THREE.Group>(null);

  if (!pdb) {
    // Fallback biological-looking blob if no data
    return (
      <mesh>
        <torusKnotGeometry args={[1, 0.3, 128, 16]} />
        <meshPhysicalMaterial 
          color={isLigand ? "#4ade80" : "#8b5cf6"} 
          transmission={0.5} 
          thickness={1.0} 
          roughness={0.2} 
        />
      </mesh>
    );
  }

  const { geometryAtoms, geometryBonds } = pdb;
  
  // Center the biological structure
  useMemo(() => {
    if (!geometryAtoms || !geometryBonds) return;
    geometryAtoms.computeBoundingBox();
    const box = geometryAtoms.boundingBox;
    if (box) {
      const center = new THREE.Vector3();
      box.getCenter(center);
      geometryAtoms.translate(-center.x, -center.y, -center.z);
      geometryBonds.translate(-center.x, -center.y, -center.z);
      
      // Also scale it down slightly so it fits in a typical HoloScript scene (1 unit = 1m)
      // Proteins are in Angstroms, so ~50 Angstroms across. We can scale by 0.1 to make it 5m.
      geometryAtoms.scale(0.1, 0.1, 0.1);
      geometryBonds.scale(0.1, 0.1, 0.1);
    }
  }, [geometryAtoms, geometryBonds]);

  const numAtoms = geometryAtoms.attributes.position.count;
  const atomPositions = geometryAtoms.attributes.position.array;
  const atomColors = geometryAtoms.attributes.color.array;

  return (
    <group ref={groupRef}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={numAtoms} array={atomPositions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={numAtoms} array={atomColors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={isLigand ? 0.4 : 0.2} vertexColors={true} />
      </points>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={geometryBonds.attributes.position.count} array={geometryBonds.attributes.position.array} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial color="#ffffff" opacity={0.15} transparent />
      </lineSegments>
    </group>
  );
}
