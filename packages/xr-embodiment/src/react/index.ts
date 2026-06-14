/**
 * @holoscript/xr-embodiment/react — thin R3F (@react-three/fiber + /xr) wrappers
 * over the framework-light three.js core, so React Three Fiber scenes get the
 * SAME user locomotion and agent-NPC embodiment as the raw-three ImmersiveViewer.
 */

export { useXRLocomotion } from './useXRLocomotion';
export { AgentAvatar } from './AgentAvatar';
export type { AgentAvatarProps } from './AgentAvatar';

// Re-export the framework-light core so a React consumer can import everything
// from one place if it prefers.
export {
  XRLocomotionController,
  AgentAvatarTracker,
  colourForEntity,
  readThumbsticks,
} from '../three';
export type {
  XRLocomotionConfig,
  AgentAvatarOptions,
  WorldStateSource,
  StickState,
  StickVector,
} from '../three';
