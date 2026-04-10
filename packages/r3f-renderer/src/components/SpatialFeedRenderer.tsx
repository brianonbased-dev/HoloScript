import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Float, RoundedBox, Html, Sphere, Ring, Edges } from '@react-three/drei';
import * as THREE from 'three';

import { AgentRoomRenderer } from './AgentRoomRenderer';
import { RoomPortalRenderer } from './RoomPortalRenderer';
import { GuestbookRenderer } from './GuestbookRenderer';
import { BadgeHolographicRenderer } from './BadgeHolographicRenderer';

export interface SpatialEntity {
  id: string;
  author: string;
  content: string;
  position: { x: number; y: number; z: number };
  velocity?: [number, number, number];
  tier?: number;
  traits: Map<string, Record<string, unknown>>;
}

export interface HoloMeshWorldState {
  getFeedSource(): any;
  subscribe(callback: () => void): any;
}


export function SpatialFeedRenderer({ worldState }: { worldState: HoloMeshWorldState }) {
  const feedParserRef = useRef<any>(null);
  const [entities, setEntities] = useState<SpatialEntity[]>([]);
  const [temporalState, setTemporalState] = useState(100); // 100% is present time

  // GAPS (Geometric And Physics Scaling) Budget Profiler
  const lodLevel = useMemo(() => {
    if (entities.length >= 300) return 'ultra-low';
    if (entities.length >= 100) return 'low';
    if (entities.length >= 30) return 'medium';
    return 'high';
  }, [entities.length]);

  // Dummy the initial fetch to avoid FeedParser dependency which imports node:crypto
  useEffect(() => {
    try {
      const source = worldState.getFeedSource();
      // Placeholder: in a real implementation we would rely on props for entities
      // instead of parsing the CRDT string inside the renderer.
    } catch (_e) {
      console.warn('Empty or invalid initial feed', _e);
    }

    const _subscription = worldState.subscribe(() => {
      // Placeholder subscription handler
    });

    return () => {
    };
  }, [worldState]);

  return (
    <group name="spatial-feed-container">
      {/* Time-Travel Debug Scrubber Overlay */}
      <Html position={[0, -5, 0]} transform center>
        <div
          style={{
            background: 'rgba(0,0,0,0.8)',
            padding: '10px 20px',
            borderRadius: '8px',
            color: '#0ff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '300px',
          }}
        >
          <label
            style={{
              fontSize: '12px',
              textTransform: 'uppercase',
              letterSpacing: '2px',
              marginBottom: '8px',
            }}
          >
            Temporal CRDT Scrubber
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={temporalState}
            onChange={(e) => setTemporalState(Number(e.target.value))}
            style={{ width: '100%', cursor: 'pointer' }}
          />
          <div style={{ fontSize: '10px', marginTop: '5px', opacity: 0.7 }}>
            {temporalState === 100 ? 'Live (Frontier)' : `Version Index: ${temporalState}%`}
          </div>
          <div
            style={{
              fontSize: '10px',
              marginTop: '5px',
              color: lodLevel === 'ultra-low' ? '#f00' : '#0ff',
            }}
          >
            GAPS Level: {lodLevel.toUpperCase()} (Nodes: {entities.length})
          </div>
        </div>
      </Html>

      {entities.map((entity) => (
        <FeedEntity
          key={entity.id}
          entity={entity}
          temporalState={temporalState}
          lodLevel={lodLevel}
        />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Tier color palette
// ---------------------------------------------------------------------------

const TIER_COLORS = ['#ffffff', '#4ade80', '#3b82f6', '#8b5cf6'] as const;

// ---------------------------------------------------------------------------
// Trait data extraction helpers
// ---------------------------------------------------------------------------

type TraitMap = Map<string, Record<string, unknown>>;
type BadgeTier = 'bronze' | 'silver' | 'gold' | 'diamond';
const VALID_BADGE_TIERS = ['bronze', 'silver', 'gold', 'diamond'];

function getTraitConfig(traits: TraitMap, ...names: string[]): Record<string, unknown> | undefined {
  for (const name of names) {
    const cfg = traits.get(name);
    if (cfg) return cfg;
  }
  return undefined;
}

function extractRoomProps(cfg: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!cfg) return {};
  const result: Record<string, unknown> = {};
  if (cfg.environment) result.environment = String(cfg.environment);
  if (cfg.surface_material) result.surfaceMaterial = String(cfg.surface_material);
  if (cfg.dimensions) result.dimensions = cfg.dimensions;
  if (cfg.accent_color) result.accentColor = String(cfg.accent_color);
  if (Array.isArray(cfg.furniture)) result.furniture = cfg.furniture;
  if (typeof cfg.visitor_count === 'number') result.visitorCount = cfg.visitor_count;
  if (typeof cfg.max_visitors === 'number') result.maxVisitors = cfg.max_visitors;
  return result;
}

function extractGuestbookEntries(cfg: Record<string, unknown> | undefined) {
  if (!cfg) return [];
  const raw = cfg.entries;
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 8).map((e: Record<string, unknown>, i: number) => ({
    id: (e.id as string) ?? `gb-${i}`,
    authorName: (e.authorName as string) ?? (e.author as string) ?? 'Anonymous',
    message: (e.message as string) ?? '',
    mood: (e.mood as string) ?? '',
    timestamp: (e.timestamp as number) ?? 0,
    signed: (e.signed as boolean) ?? false,
  }));
}

function extractBadges(cfg: Record<string, unknown> | undefined, fallbackName: string) {
  if (!cfg) return [];
  const raw = cfg.badges;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((b: Record<string, unknown>, i: number) => ({
      id: (b.id as string) ?? `badge-${i}`,
      name: (b.name as string) ?? (b.title as string) ?? 'Badge',
      description: (b.description as string) ?? '',
      icon: (b.icon as string) ?? '🏆',
      tier: (VALID_BADGE_TIERS.includes(b.tier as string) ? b.tier : 'bronze') as BadgeTier,
      earnedAt: (b.earnedAt as number) ?? 0,
    }));
  }
  // Fallback: single badge from entity content
  return [
    {
      id: 'badge-0',
      name: fallbackName,
      description: String(cfg.description ?? 'Spatial Badge'),
      icon: String(cfg.icon ?? '🏆'),
      tier: (VALID_BADGE_TIERS.includes(String(cfg.tier))
        ? String(cfg.tier)
        : 'silver') as BadgeTier,
      earnedAt: typeof cfg.earnedAt === 'number' ? cfg.earnedAt : 0,
    },
  ];
}

function extractPortalProps(cfg: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!cfg) return {};
  const result: Record<string, unknown> = {};
  if (cfg.label) result.label = String(cfg.label);
  if (cfg.style) result.style = String(cfg.style);
  if (typeof cfg.is_active === 'boolean') result.isActive = cfg.is_active;
  if (typeof cfg.traversals === 'number') result.traversals = cfg.traversals;
  return result;
}

// ---------------------------------------------------------------------------
// FeedEntity
// ---------------------------------------------------------------------------

function FeedEntity({
  entity,
  temporalState,
  lodLevel,
}: {
  entity: SpatialEntity;
  temporalState: number;
  lodLevel: string;
}) {
  const ref = useRef<THREE.Group>(null);

  // Velocity vector from AST (Time travel dampens physics)
  const velocity = useMemo(() => {
    const timeScale = temporalState === 100 ? 1 : 0;
    return new THREE.Vector3(
      (entity.velocity?.[0] || 0) * timeScale,
      (entity.velocity?.[1] || 0) * timeScale,
      (entity.velocity?.[2] || 0) * timeScale
    );
  }, [entity.velocity, temporalState]);

  useFrame((_, delta) => {
    if (ref.current && velocity.lengthSq() > 0) {
      ref.current.position.addScaledVector(velocity, delta);
    }
  });

  const color = TIER_COLORS[Math.min(entity.tier || 1, 3)];
  const authorShort = useMemo(
    () => entity.author.replace('did:peer:', '').slice(0, 16),
    [entity.author]
  );

  // Memoized trait detection — avoids repeated Map lookups on re-render
  const traitFlags = useMemo(() => {
    const t = entity.traits;
    return {
      wot: t.has('WoTThing') || t.has('MQTTSource'),
      tensor: t.has('TensorOp') || t.has('NeuralForge'),
      zk: t.has('ZKPrivate') || t.has('ZeroKnowledgeProof'),
      room: t.has('AgentRoom') || t.has('MySpace'),
      portal: t.has('RoomPortal') || t.has('Wormhole'),
      guestbook: t.has('Guestbook'),
      badge: t.has('Badge') || t.has('HolographicBadge'),
    };
  }, [entity.traits]);

  // Memoized trait config extraction — only recomputes when traits change
  const roomProps = useMemo(
    () =>
      extractRoomProps(
        traitFlags.room ? getTraitConfig(entity.traits, 'AgentRoom', 'MySpace') : undefined
      ),
    [entity.traits, traitFlags.room]
  );
  const portalProps = useMemo(
    () =>
      extractPortalProps(
        traitFlags.portal ? getTraitConfig(entity.traits, 'RoomPortal', 'Wormhole') : undefined
      ),
    [entity.traits, traitFlags.portal]
  );
  const guestbookEntries = useMemo(
    () =>
      extractGuestbookEntries(
        traitFlags.guestbook ? getTraitConfig(entity.traits, 'Guestbook') : undefined
      ),
    [entity.traits, traitFlags.guestbook]
  );
  const badgeData = useMemo(
    () =>
      extractBadges(
        traitFlags.badge ? getTraitConfig(entity.traits, 'Badge', 'HolographicBadge') : undefined,
        entity.content
      ),
    [entity.traits, traitFlags.badge, entity.content]
  );

  const isUltraLow = lodLevel === 'ultra-low';
  const isLow = lodLevel === 'low';

  // Spatial trait entities suppress the generic InsightCard at normal LOD
  const hasSpatialRenderer =
    traitFlags.room || traitFlags.portal || traitFlags.guestbook || traitFlags.badge;
  const shouldRenderInsightCard = !hasSpatialRenderer;

  const content = (
    <>
      {traitFlags.wot && !isUltraLow && <IoTNode color={color} />}
      {traitFlags.tensor && !isUltraLow && <SNNNode />}
      {traitFlags.zk && !isUltraLow && <ZKShieldNode lodLevel={lodLevel} />}

      {traitFlags.room && !isUltraLow && (
        <AgentRoomRenderer
          roomName={entity.content}
          ownerName={authorShort}
          themeColor={color}
          {...roomProps}
        />
      )}
      {traitFlags.portal && !isUltraLow && (
        <RoomPortalRenderer
          targetRoom={entity.content}
          targetDid={entity.author}
          color={color}
          {...portalProps}
        />
      )}
      {traitFlags.guestbook && !isUltraLow && (
        <GuestbookRenderer
          entries={guestbookEntries}
          themeColor={color}
          layout={isLow ? 'wall' : 'floating'}
        />
      )}
      {traitFlags.badge && !isUltraLow && (
        <BadgeHolographicRenderer
          badges={badgeData}
          display={isLow ? 'icon' : 'holographic'}
          themeColor={color}
        />
      )}

      {(shouldRenderInsightCard || isUltraLow) && (
        <InsightMesh
          text={entity.content}
          author={entity.author}
          color={color}
          isPast={temporalState < 100}
          lodLevel={lodLevel}
        />
      )}
    </>
  );

  return (
    <group ref={ref} position={[entity.position.x, entity.position.y, entity.position.z]}>
      {isUltraLow || isLow ? (
        content
      ) : (
        <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.5}>
          {content}
        </Float>
      )}
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
        <div style={{ color, fontSize: '10px', whiteSpace: 'nowrap', textShadow: '0 0 5px #000' }}>
          [IoT Data Stream]
        </div>
      </Html>
    </group>
  );
}

function SNNNode() {
  return (
    <group position={[0, -1.5, 0]}>
      <Ring args={[0.5, 0.6, 32]}>
        <meshBasicMaterial color="#f0f" side={THREE.DoubleSide} transparent opacity={0.6} />
      </Ring>
      <Html position={[1, 0, 0]}>
        <div style={{ color: '#f0f', fontSize: '10px', whiteSpace: 'nowrap' }}>
          [TensorOp Compiled]
        </div>
      </Html>
    </group>
  );
}

function ZKShieldNode({ lodLevel }: { lodLevel: string }) {
  const isLow = lodLevel === 'low' || lodLevel === 'ultra-low';
  return (
    <group position={[0, 0, 0]}>
      {!isLow && (
        <Sphere args={[2.5, 32, 32]}>
          <meshPhysicalMaterial
            color="#0ff"
            transmission={0.9}
            opacity={0.3}
            transparent
            wireframe
            roughness={0}
          />
        </Sphere>
      )}
      <Html position={[-2.5, 0, 0]}>
        <div
          style={{
            color: '#0ff',
            fontSize: '10px',
            padding: '2px',
            border: '1px solid #0ff',
            borderRadius: '3px',
          }}
        >
          ZK-Verified
        </div>
      </Html>
    </group>
  );
}

function InsightMesh({
  text,
  author,
  color,
  isPast,
  lodLevel,
}: {
  text: string;
  author: string;
  color: string;
  isPast?: boolean;
  lodLevel: string;
}) {
  const isHigh = lodLevel === 'high';
  const isUltraLow = lodLevel === 'ultra-low';

  return (
    <group>
      {/* Background Panel */}
      {isUltraLow ? (
        <mesh>
          <boxGeometry args={[4, 2, 0.2]} />
          <meshBasicMaterial color={isPast ? '#333333' : '#1a1b26'} />
        </mesh>
      ) : (
        <RoundedBox args={[4, 2, 0.2]} radius={0.1} smoothness={isHigh ? 4 : 1}>
          <meshPhysicalMaterial
            color={isPast ? '#333333' : '#1a1b26'}
            transparent={true}
            opacity={isPast ? 0.4 : 0.8}
            roughness={isPast ? 0.8 : 0.2}
            metalness={0.8}
            transmission={isHigh ? 0.5 : 0}
          />
        </RoundedBox>
      )}

      {/* Glow Effect only on High/Medium */}
      {!isUltraLow && lodLevel !== 'low' && (
        <pointLight color={color} intensity={0.5} distance={5} position={[0, 0, 0.5]} />
      )}

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
