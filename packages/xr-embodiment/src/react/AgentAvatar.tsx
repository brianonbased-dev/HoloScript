import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { AgentAvatarTracker, type AgentAvatarOptions } from '../three/AgentAvatarTracker';

export type AgentAvatarProps = Omit<AgentAvatarOptions, 'scene'>;

/**
 * <AgentAvatar entityId="..." /> — declarative NPC body for R3F scenes. Wraps
 * AgentAvatarTracker: adds the body to the Canvas scene, polls authoritative
 * world state, and lerps the body toward it each frame. Renders nothing itself
 * (the body is added imperatively to the three.js scene).
 */
export function AgentAvatar(props: AgentAvatarProps): null {
  const scene = useThree((s) => s.scene) as unknown as THREE.Scene;
  const ref = useRef<AgentAvatarTracker | null>(null);

  useEffect(() => {
    const tracker = new AgentAvatarTracker({ scene, ...props });
    ref.current = tracker;
    return () => {
      tracker.dispose();
      ref.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, props.entityId]);

  useFrame(() => {
    ref.current?.update();
  });

  return null;
}

/**
 * <AgentAvatars ids={["brittney", ...]} /> — mount one agent-generic body per
 * entity id, so any number of BYOK agents share one scene (D.094). Each body
 * gets a deterministic colour from its id. Renders nothing itself.
 */
export function AgentAvatars({
  ids,
  ...rest
}: { ids: string[] } & Omit<AgentAvatarProps, 'entityId'>): React.JSX.Element {
  return (
    <>
      {ids.map((id) => (
        <AgentAvatar key={id} entityId={id} {...rest} />
      ))}
    </>
  );
}
