import { NextRequest } from 'next/server';

/**
 * GET /api/physics — physics trait preset catalog
 * Returns physics body type presets with @physics traitSnippets.
 */

export type PhysicsBodyType = 'rigid' | 'soft' | 'kinematic' | 'static' | 'trigger' | 'cloth' | 'vehicle' | 'character';

export interface PhysicsPreset {
  id: string;
  name: string;
  type: PhysicsBodyType;
  description: string;
  emoji: string;
  defaults: {
    mass: number;
    friction: number;
    restitution: number;
    linearDamping: number;
    angularDamping: number;
    gravityScale: number;
    collisionShape: string;
  };
  traitSnippet: string;
}

const PRESETS: PhysicsPreset[] = [
  {
    id: 'rigid-body', name: 'Rigid Body', type: 'rigid', emoji: '🧱',
    description: 'Standard dynamic solid object — falls, collides, tumbles with realistic physics',
    defaults: { mass: 1.0, friction: 0.5, restitution: 0.3, linearDamping: 0.01, angularDamping: 0.05, gravityScale: 1.0, collisionShape: 'box' },
    traitSnippet: `  @physics {
    type: "rigid"
    mass: 1.0
    friction: 0.5
    restitution: 0.3
    collisionShape: "box"
    gravityScale: 1.0
  }`,
  },
  {
    id: 'static-body', name: 'Static Body', type: 'static', emoji: '🏔️',
    description: 'Immovable solid — perfect for floors, walls, and terrain',
    defaults: { mass: 0, friction: 0.8, restitution: 0.1, linearDamping: 0, angularDamping: 0, gravityScale: 0, collisionShape: 'mesh' },
    traitSnippet: `  @physics {
    type: "static"
    friction: 0.8
    restitution: 0.1
    collisionShape: "mesh"
  }`,
  },
  {
    id: 'kinematic', name: 'Kinematic', type: 'kinematic', emoji: '🎯',
    description: 'Animated body that affects rigid bodies but is not affected by forces',
    defaults: { mass: 1.0, friction: 0.5, restitution: 0.0, linearDamping: 0, angularDamping: 0, gravityScale: 0, collisionShape: 'capsule' },
    traitSnippet: `  @physics {
    type: "kinematic"
    friction: 0.5
    collisionShape: "capsule"
  }`,
  },
  {
    id: 'trigger', name: 'Trigger Zone', type: 'trigger', emoji: '🔘',
    description: 'Non-collidable sensor zone — fires events when objects overlap',
    defaults: { mass: 0, friction: 0, restitution: 0, linearDamping: 0, angularDamping: 0, gravityScale: 0, collisionShape: 'sphere' },
    traitSnippet: `  @physics {
    type: "trigger"
    collisionShape: "sphere"
    isTrigger: true
  }`,
  },
  {
    id: 'soft-body', name: 'Soft Body', type: 'soft', emoji: '🫀',
    description: 'Deformable elastic object — jelly, foam, organs',
    defaults: { mass: 0.5, friction: 0.6, restitution: 0.8, linearDamping: 0.1, angularDamping: 0.1, gravityScale: 1.0, collisionShape: 'convex' },
    traitSnippet: `  @physics {
    type: "soft"
    mass: 0.5
    stiffness: 0.3
    damping: 0.1
    pressureCoeff: 0.0
  }`,
  },
  {
    id: 'cloth', name: 'Cloth / Fabric', type: 'cloth', emoji: '🧣',
    description: 'Simulated cloth sheet with pinned corners and wind response',
    defaults: { mass: 0.1, friction: 0.4, restitution: 0.0, linearDamping: 0.2, angularDamping: 0.1, gravityScale: 1.0, collisionShape: 'plane' },
    traitSnippet: `  @physics {
    type: "cloth"
    mass: 0.1
    stretchStiffness: 0.9
    bendStiffness: 0.1
    pinCorners: true
  }`,
  },
  {
    id: 'vehicle', name: 'Vehicle', type: 'vehicle', emoji: '🚗',
    description: 'Wheeled vehicle body with suspension and drive configs',
    defaults: { mass: 1500, friction: 0.7, restitution: 0.1, linearDamping: 0.05, angularDamping: 0.1, gravityScale: 1.0, collisionShape: 'box' },
    traitSnippet: `  @physics {
    type: "vehicle"
    mass: 1500
    friction: 0.7
    wheelRadius: 0.35
    suspensionLength: 0.2
    driveType: "all"
  }`,
  },
  {
    id: 'character', name: 'Character Controller', type: 'character', emoji: '🧍',
    description: 'CCD character controller with step-up and slope limit',
    defaults: { mass: 70, friction: 0.0, restitution: 0.0, linearDamping: 0, angularDamping: 0, gravityScale: 1.0, collisionShape: 'capsule' },
    traitSnippet: `  @physics {
    type: "character"
    height: 1.8
    radius: 0.3
    stepHeight: 0.35
    slopeLimit: 45
    gravityScale: 1.0
  }`,
  },
];

declare global { var __physicsPresets__: PhysicsPreset[] | undefined; }
const store = globalThis.__physicsPresets__ ?? (globalThis.__physicsPresets__ = [...PRESETS]);

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.toLowerCase() ?? '';
  const type = request.nextUrl.searchParams.get('type') as PhysicsBodyType | null;
  let results = store;
  if (type) results = results.filter((p) => p.type === type);
  if (q) results = results.filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
  const types = [...new Set(store.map((p) => p.type))];
  return Response.json({ presets: results, total: results.length, types });
}
