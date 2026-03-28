import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Float, RoundedBox, Html, Sphere, Ring, Edges } from '@react-three/drei';
import * as THREE from 'three';

// Use type imports since this is a decoupled UI renderer
import type { HoloMeshWorldState } from '../../../mcp-server/src/holomesh/crdt-sync';
import { FeedParser, type SpatialEntity } from '../../../core/src/parser/FeedParser';

export function SpatialFeedRenderer({ worldState }: { worldState: HoloMeshWorldState }) {
  const feedParser = useRef(new FeedParser());
  const [entities, setEntities] = useState<SpatialEntity[]>([]);
  const [temporalState, setTemporalState] = useState(100); // 100% is present time

  useEffect(() => {
    // Initial fetch
    try {
      const source = worldState.getFeedSource();
      feedParser.current.onFeedUpdate(source);
      setEntities(feedParser.current.getSpatialEntities());
    } catch (e) {
      console.warn('Empty or invalid initial feed', e);
    }

    // Subscribe to CRDT text changes
    const subscription = worldState.subscribe(() => {
      try {
        const source = worldState.getFeedSource();
        feedParser.current.onFeedUpdate(source);
        setEntities([...feedParser.current.getSpatialEntities()]);
      } catch (e) {
        // Parsing errors during typing
      }
    });
    
    return () => {
      // worldState.unsubscribe(subscription)?
    };
  }, [worldState]);

  return (
    <group name="spatial-feed-container">
      {/* Time-Travel Debug Scrubber Overlay */}
      <Html position={[0, -5, 0]} transform center>
        <div style={{ background: 'rgba(0,0,0,0.8)', padding: '10px 20px', borderRadius: '8px', color: '#0ff', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '300px' }}>
          <label style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>
            Temporal CRDT Scrubber
          </label>
          <input 
            type="range" 
            min="0" max="100" 
            value={temporalState} 
            onChange={e => setTemporalState(Number(e.target.value))}
            style={{ width: '100%', cursor: 'pointer' }}
          />
          <div style={{ fontSize: '10px', marginTop: '5px', opacity: 0.7 }}>
            {temporalState === 100 ? 'Live (Frontier)' : `Version Index: ${temporalState}%`}
          </div>
        </div>
      </Html>

      {entities.map(entity => (
        <FeedEntity key={entity.id} entity={entity} temporalState={temporalState} />
      ))}
    </group>
  );
}

function FeedEntity({ entity, temporalState }: { entity: SpatialEntity; temporalState: number }) {
  const ref = useRef<THREE.Group>(null);
  
  // Velocity vector from AST (Time travel dampens physics)
  const velocity = useMemo(() => {
    const timeScale = temporalState === 100 ? 1 : 0; // Freeze physics if scrubbing backward
    return new THREE.Vector3(
      (entity.velocity?.[0] || 0) * timeScale,
      (entity.velocity?.[1] || 0) * timeScale,
      (entity.velocity?.[2] || 0) * timeScale
    );
  }, [entity.velocity, temporalState]);

  // Apply velocity each frame
  useFrame((state, delta) => {
    if (ref.current && velocity.lengthSq() > 0) {
      ref.current.position.addScaledVector(velocity, delta);
    }
  });

  // Calculate colors based on tier
  const colors = [
    '#ffffff', // Default
    '#4ade80', // Tier 1 (Green)
    '#3b82f6', // Tier 2 (Blue)
    '#8b5cf6'  // Tier 3 (Purple)
  ];
  const color = colors[Math.min(entity.tier || 1, 3)];

  // Extrapolate traits based on AST
  const hasWoT = entity.traits.has('WoTThing') || entity.traits.has('MQTTSource');
  const hasTensorOp = entity.traits.has('TensorOp') || entity.traits.has('NeuralForge');
  const hasZK = entity.traits.has('ZKPrivate') || entity.traits.has('ZeroKnowledgeProof');

  return (
    <group 
      ref={ref} 
      position={[entity.position.x, entity.position.y, entity.position.z]}
    >
      <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.5}>
        {hasWoT && <IoTNode color={color} />}
        {hasTensorOp && <SNNNode color={color} />}
        {hasZK && <ZKShieldNode color={color} />}
        <InsightMesh text={entity.content} author={entity.author} color={color} isPast={temporalState < 100} />
      </Float>
    </group>
  );
}

// Subcomponents for specialized traits
function IoTNode({ color }: { color: string }) {
  return (
    <group position={[0, 1.5, 0]}>
      <Sphere args={[0.2, 16, 16]}>
        <meshBasicMaterial color={color} wireframe />
      </Sphere>
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Html position={[0, 1, 0]}>
        <div style={{ color, fontSize: '10px', whiteSpace: 'nowrap', textShadow: '0 0 5px #000' }}>[IoT Data Stream]</div>
      </Html>
    </group>
  );
}

function SNNNode({ color }: { color: string }) {
  return (
    <group position={[0, -1.5, 0]}>
      <Ring args={[0.5, 0.6, 32]}>
        <meshBasicMaterial color="#f0f" side={THREE.DoubleSide} transparent opacity={0.6} />
      </Ring>
      <Html position={[1, 0, 0]}>
        <div style={{ color: '#f0f', fontSize: '10px', whiteSpace: 'nowrap' }}>[TensorOp Compiled]</div>
      </Html>
    </group>
  );
}

function ZKShieldNode({ color }: { color: string }) {
  return (
    <group position={[0, 0, 0]}>
      <Sphere args={[2.5, 32, 32]}>
        <meshPhysicalMaterial color="#0ff" transmission={0.9} opacity={0.3} transparent wireframe roughness={0} />
      </Sphere>
      <Html position={[-2.5, 0, 0]}>
        <div style={{ color: '#0ff', fontSize: '10px', padding: '2px', border: '1px solid #0ff', borderRadius: '3px' }}>ZK-Verified</div>
      </Html>
    </group>
  );
}

function InsightMesh({ text, author, color, isPast }: { text: string; author: string; color: string; isPast?: boolean }) {
  return (
    <group>
      {/* Background Panel */}
      <RoundedBox args={[4, 2, 0.2]} radius={0.1} smoothness={4}>
        <meshPhysicalMaterial 
          color={isPast ? "#333333" : "#1a1b26"} 
          transparent={true} 
          opacity={isPast ? 0.4 : 0.8}
          roughness={isPast ? 0.8 : 0.2}
          metalness={0.8}
          transmission={0.5}
        />
      </RoundedBox>

      {/* Glow Effect */}
      <pointLight 
        color={color} 
        intensity={0.5} 
        distance={5} 
        position={[0, 0, 0.5]} 
      />

      {/* Avatar/Author Chip */}
      <group position={[-1.6, 0.6, 0.11]}>
        <mesh>
          <circleGeometry args={[0.2, 32]} />
          <meshBasicMaterial color={color} />
        </mesh>
        <Text
          position={[0.3, 0, 0]}
          fontSize={0.15}
          color={color}
          anchorX="left"
          anchorY="middle"
          maxWidth={3}
        >
          {author.replace('did:peer:', '').slice(0, 16)}...
        </Text>
      </group>

      {/* Insight Text */}
      <Text
        position={[0, -0.1, 0.11]}
        fontSize={0.2}
        color="white"
        anchorX="center"
        anchorY="middle"
        maxWidth={3.5}
        lineHeight={1.2}
      >
        {text}
      </Text>
      
      {/* HTML overlay for accessibility/selection if needed */}
      <Html position={[0, -1.2, 0]} transform>
        <div style={{ opacity: 0 }} aria-label={`Insight by ${author}: ${text}`}></div>
      </Html>
    </group>
  );
}
