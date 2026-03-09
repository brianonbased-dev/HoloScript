/**
 * PhysicsProvider — Rapier3D rigid body physics integration
 *
 * Wraps sceneGraph nodes tagged with @physics trait:
 *   @physics type:"dynamic"|"static"|"kinematic"
 *            shape:"box"|"sphere"|"capsule"
 *            mass:1.0  restitution:0.5  friction:0.5
 *
 * Integrates with the R3F render loop via useFrame.
 * Keeps a registry of nodeId → body handle for position sync.
 *
 * Usage: mount PhysicsProvider once inside <Canvas>
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { useSceneGraphStore } from '@/lib/stores';
import type { SceneNode } from '@/lib/stores';
import { usePhysicsStore } from '@/lib/physicsStore';

// ─── Physics step ─────────────────────────────────────────────────────────────

const STEP_MS = 1000 / 60; // 60 Hz
let acc = 0;

// ─── Trait helpers ────────────────────────────────────────────────────────────

function getPhysicsTrait(node: SceneNode) {
  return node.traits.find((t) => t.name === 'physics');
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function PhysicsProvider() {
  const nodes = useSceneGraphStore((s) => s.nodes);
  const updateNode = useSceneGraphStore((s) => s.updateNode);
  const { world, bodyMap, setWorld } = usePhysicsStore();
  const initRef = useRef(false);

  // Init Rapier world
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    import('@dimforge/rapier3d-compat').then(async (RAPIER) => {
      await RAPIER.init();
      const w = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
      setWorld(w);
    });
  }, [setWorld]);

  // Sync scene graph → rigid bodies
  useEffect(() => {
    if (!world) return;

    import('@dimforge/rapier3d-compat').then((RAPIER) => {
      nodes.forEach((node) => {
        const phys = getPhysicsTrait(node);
        if (!phys || bodyMap.has(node.id)) return;

        const [px, py, pz] = node.position;
        const bodyType =
          phys.properties.type === 'static'
            ? RAPIER.RigidBodyType.Fixed
            : phys.properties.type === 'kinematic'
              ? RAPIER.RigidBodyType.KinematicPositionBased
              : RAPIER.RigidBodyType.Dynamic;

        const bodyDesc = new RAPIER.RigidBodyDesc(bodyType).setTranslation(px, py, pz);
        const body = world.createRigidBody(bodyDesc);

        const shape = phys.properties.shape ?? 'box';
        let colliderDesc: InstanceType<typeof RAPIER.ColliderDesc>;

        if (shape === 'sphere') {
          colliderDesc = RAPIER.ColliderDesc.ball(0.5);
        } else if (shape === 'capsule') {
          colliderDesc = RAPIER.ColliderDesc.capsule(0.5, 0.25);
        } else {
          colliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5);
        }

        const restitution = Number(phys.properties.restitution ?? 0.3);
        const friction = Number(phys.properties.friction ?? 0.5);
        colliderDesc.setRestitution(restitution).setFriction(friction);

        world.createCollider(colliderDesc, body);
        bodyMap.set(node.id, body.handle);
      });
    });
  }, [world, nodes, bodyMap]);

  // Step world + sync back to scene graph
  useFrame((_, delta) => {
    if (!world) return;

    acc += delta * 1000;
    while (acc >= STEP_MS) {
      world.timestep = STEP_MS / 1000;
      world.step();
      acc -= STEP_MS;
    }

    // Write positions back to store for dynamic bodies
    bodyMap.forEach((handle, nodeId) => {
      const body = world.getRigidBody(handle);
      if (!body || body.isSleeping()) return;
      if (body.bodyType() !== 0 /* Dynamic */) return;

      const t = body.translation();
      updateNode(nodeId, { position: [t.x, t.y, t.z] });
    });
  });

  return null;
}
