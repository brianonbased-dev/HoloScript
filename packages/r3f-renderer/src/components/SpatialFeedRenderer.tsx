import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Float, RoundedBox, Html } from '@react-three/drei';
import * as THREE from 'three';

// Use type imports since this is a decoupled UI renderer
import type { HoloMeshWorldState } from '../../../mcp-server/src/holomesh/crdt-sync';
import { FeedParser, type SpatialEntity } from '../../../core/src/parser/FeedParser';

export function SpatialFeedRenderer({ worldState }: { worldState: HoloMeshWorldState }) {
  const feedParser = useRef(new FeedParser());
  const [entities, setEntities] = useState<SpatialEntity[]>([]);

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
      {entities.map(entity => (
        <FeedEntity key={entity.id} entity={entity} />
      ))}
    </group>
  );
}

function FeedEntity({ entity }: { entity: SpatialEntity }) {
  const ref = useRef<THREE.Group>(null);
  
  // Velocity vector from AST
  const velocity = useMemo(() => {
    return new THREE.Vector3(
      entity.velocity?.[0] || 0,
      entity.velocity?.[1] || 0,
      entity.velocity?.[2] || 0
    );
  }, [entity.velocity]);

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

  return (
    <group 
      ref={ref} 
      position={[entity.position.x, entity.position.y, entity.position.z]}
    >
      <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.5}>
        <InsightMesh text={entity.content} author={entity.author} color={color} />
      </Float>
    </group>
  );
}

function InsightMesh({ text, author, color }: { text: string; author: string; color: string }) {
  return (
    <group>
      {/* Background Panel */}
      <RoundedBox args={[4, 2, 0.2]} radius={0.1} smoothness={4}>
        <meshPhysicalMaterial 
          color="#1a1b26" 
          transparent={true} 
          opacity={0.8}
          roughness={0.2}
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
