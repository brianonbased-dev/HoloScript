import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, RoundedBox, Float } from '@react-three/drei';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GuestbookEntryData {
  id: string;
  authorName: string;
  message: string;
  mood: string;
  timestamp: number;
  signed: boolean;
}

export interface GuestbookRendererProps {
  /** Guestbook entries to display */
  entries?: GuestbookEntryData[];
  /** Max entries visible at once */
  maxVisible?: number;
  /** Primary theme color */
  themeColor?: string;
  /** Accent color */
  accentColor?: string;
  /** Layout style */
  layout?: 'book' | 'wall' | 'floating';
  /** Position in scene */
  position?: [number, number, number];
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function GuestbookRenderer({
  entries = [],
  maxVisible = 8,
  themeColor = '#6366f1',
  accentColor = '#a78bfa',
  layout = 'floating',
  position = [0, 0, 0],
}: GuestbookRendererProps) {
  const groupRef = useRef<THREE.Group>(null);
  const visible = entries.slice(0, maxVisible);

  // Arrange entries in a layout
  const positions = useMemo(() => {
    return visible.map((_, i) => {
      switch (layout) {
        case 'book':
          // Stack vertically like pages
          return [0, -i * 1.2, i * 0.05] as [number, number, number];
        case 'wall':
          // Grid on a wall
          return [((i % 3) - 1) * 3.2, -Math.floor(i / 3) * 1.8, 0] as [number, number, number];
        case 'floating':
        default:
          // Spiral float
          return [
            Math.cos((i / visible.length) * Math.PI * 2) * 2.5,
            i * 0.4 - visible.length * 0.2,
            Math.sin((i / visible.length) * Math.PI * 2) * 2.5,
          ] as [number, number, number];
      }
    });
  }, [visible.length, layout]);

  return (
    <group ref={groupRef} position={position} name="guestbook">
      {/* Title */}
      <Text
        position={[0, (visible.length * 0.4) / 2 + 1, 0]}
        fontSize={0.3}
        color={themeColor}
        anchorX="center"
      >
        Guestbook ({entries.length})
      </Text>

      {/* Entries */}
      {visible.map((entry, i) => (
        <GuestbookCard
          key={entry.id}
          entry={entry}
          position={positions[i]}
          themeColor={themeColor}
          accentColor={accentColor}
          index={i}
          isFloating={layout === 'floating'}
        />
      ))}

      {/* "And N more..." indicator */}
      {entries.length > maxVisible && (
        <Text
          position={[0, -(visible.length * 0.4) / 2 - 1.2, 0]}
          fontSize={0.15}
          color="#64748b"
          anchorX="center"
        >
          ...and {entries.length - maxVisible} more
        </Text>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function GuestbookCard({
  entry,
  position,
  themeColor,
  accentColor,
  index,
  isFloating,
}: {
  entry: GuestbookEntryData;
  position: [number, number, number];
  themeColor: string;
  accentColor: string;
  index: number;
  isFloating: boolean;
}) {
  const meshRef = useRef<THREE.Group>(null);

  // Gentle rotation for floating cards
  useFrame(() => {
    if (meshRef.current && isFloating) {
      meshRef.current.rotation.y = Math.sin(Date.now() * 0.0003 + index * 0.5) * 0.15;
    }
  });

  const truncatedMsg =
    entry.message.length > 80 ? entry.message.slice(0, 77) + '...' : entry.message;

  const cardContent = (
    <group ref={meshRef}>
      {/* Card background */}
      <RoundedBox args={[2.8, 1.0, 0.06]} radius={0.06} smoothness={2}>
        <meshPhysicalMaterial
          color="#111827"
          roughness={0.4}
          metalness={0.3}
          transparent
          opacity={0.9}
        />
      </RoundedBox>

      {/* Signed indicator (green dot) */}
      {entry.signed && (
        <mesh position={[1.2, 0.35, 0.04]}>
          <circleGeometry args={[0.06, 16]} />
          <meshBasicMaterial color="#22c55e" />
        </mesh>
      )}

      {/* Mood emoji */}
      {entry.mood && (
        <Text position={[-1.2, 0.3, 0.04]} fontSize={0.18} anchorX="left" anchorY="middle">
          {entry.mood}
        </Text>
      )}

      {/* Author name */}
      <Text
        position={[-1.2 + (entry.mood ? 0.3 : 0), 0.3, 0.04]}
        fontSize={0.12}
        color={accentColor}
        anchorX="left"
        anchorY="middle"
        maxWidth={2.0}
      >
        {entry.authorName}
      </Text>

      {/* Message */}
      <Text
        position={[-1.2, -0.05, 0.04]}
        fontSize={0.1}
        color="#e2e8f0"
        anchorX="left"
        anchorY="middle"
        maxWidth={2.4}
        lineHeight={1.3}
      >
        {truncatedMsg}
      </Text>

      {/* Timestamp */}
      <Text
        position={[1.2, -0.35, 0.04]}
        fontSize={0.08}
        color="#475569"
        anchorX="right"
        anchorY="middle"
      >
        {formatRelativeTime(entry.timestamp)}
      </Text>

      {/* Accent border glow */}
      <mesh position={[0, -0.5, 0.03]}>
        <planeGeometry args={[2.6, 0.01]} />
        <meshBasicMaterial color={themeColor} transparent opacity={0.5} />
      </mesh>
    </group>
  );

  if (isFloating) {
    return (
      <Float
        speed={1 + index * 0.2}
        rotationIntensity={0.1}
        floatIntensity={0.3}
        position={position}
      >
        {cardContent}
      </Float>
    );
  }

  return <group position={position}>{cardContent}</group>;
}

// ---------------------------------------------------------------------------
// Util
// ---------------------------------------------------------------------------

function formatRelativeTime(ts: number): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h`;
  return `${Math.floor(diff / 86400_000)}d`;
}
