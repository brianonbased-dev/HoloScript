/**
 * @holoscript/xr-embodiment/three — framework-light (zero React) WebXR embodiment.
 *
 * USER embodiment (XRLocomotionController + readThumbsticks) and NPC embodiment
 * (AgentAvatarTracker) as plain three.js, for raw `renderer.xr` consumers like
 * the studio ImmersiveViewer. R3F wrappers live under ../react.
 */

export { XRLocomotionController } from './XRLocomotionController';
export type { XRLocomotionConfig } from './XRLocomotionController';
export { readThumbsticks } from './readThumbsticks';
export type { StickState, StickVector } from './readThumbsticks';
export { AgentAvatarTracker, colourForEntity } from './AgentAvatarTracker';
export type { WorldStateSource, AgentAvatarOptions } from './AgentAvatarTracker';
