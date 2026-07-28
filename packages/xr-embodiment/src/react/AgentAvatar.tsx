import { useEffect, useRef, type ReactElement } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { AgentAvatarTracker, type AgentAvatarOptions } from '../three/AgentAvatarTracker';

/**
 * Portable agent mind — structural interface (mirrors CharacterMind in holoscript-agent).
 * Kept local so xr-embodiment has no runtime dep on holoscript-agent; any object with
 * these two methods satisfies it (TypeScript structural typing).
 */
export interface PortableMind {
  identity(): { wallet?: string; agentId?: string };
  loadMemory(
    query?: string,
    limit?: number
  ): Promise<Array<{ id?: string; content: string; score?: number }>>;
}

export type AgentAvatarProps = Omit<AgentAvatarOptions, 'scene'> & {
  /**
   * When set, the avatar is also a live mind-bearer: identity() and loadMemory() are called at
   * spawn, firing onMindLoaded so the caller can display the agent's wallet + memories (D.102 E5b).
   * Build via buildPortableMind from @holoscript/holoscript-agent/portable-mind and pass the result.
   */
  mind?: PortableMind;
  /** Called once the mind is loaded, with the agent's identity and recalled memories. */
  onMindLoaded?: (
    identity: { wallet?: string; agentId?: string },
    memories: Array<{ id?: string; content: string }>
  ) => void;
};

/**
 * <AgentAvatar entityId="..." /> — declarative NPC body for R3F scenes. Wraps
 * AgentAvatarTracker: adds the body to the Canvas scene, polls authoritative
 * world state, and lerps the body toward it each frame. Renders nothing itself
 * (the body is added imperatively to the three.js scene).
 *
 * With `mind` + `onMindLoaded`, completes the D.102 node→headset carry (E5b): the
 * same wallet-keyed identity + private:<wallet> memory that ran on the Jetson inhabits
 * the headset body, proving one continuous agent across substrates.
 */
export function AgentAvatar({ mind, onMindLoaded, ...props }: AgentAvatarProps): null {
  const scene = useThree((s) => s.scene) as unknown as THREE.Scene;
  const ref = useRef<AgentAvatarTracker | null>(null);

  useEffect(() => {
    const tracker = new AgentAvatarTracker({ scene, ...props });
    ref.current = tracker;

    // E5b: bind portable mind at avatar spawn — load identity + memories into the body.
    if (mind && onMindLoaded) {
      void (async () => {
        try {
          const identity = mind.identity();
          const memories = await mind.loadMemory(undefined, 50);
          onMindLoaded(identity, memories);
        } catch {
          // Degrade gracefully — body exists without mind rather than crashing the scene.
        }
      })();
    }

    return () => {
      tracker.dispose();
      ref.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, props.entityId, mind]);

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
}: { ids: string[] } & Omit<AgentAvatarProps, 'entityId'>): ReactElement {
  return (
    <>
      {ids.map((id) => (
        <AgentAvatar key={id} entityId={id} {...rest} />
      ))}
    </>
  );
}
