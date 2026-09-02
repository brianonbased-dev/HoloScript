/**
 * Machine-worn XR — devices an agent can put on to prove a build, so a human
 * only has to experience the finished thing.
 *
 * See `SyntheticHeadset` for what a witness receipt does and does not prove.
 */
export {
  SyntheticHeadset,
  DEVICE_CATALOG,
  BUTTON_ORDER,
  HAND_JOINTS,
  type SyntheticHeadsetOptions,
  type HeadsetModel,
  type DeviceDescriptor,
  type Handedness,
  type ButtonName,
  // `Vec3` is deliberately NOT re-exported: core already publishes one from
  // `audio/AudioTypes` with the identical `{ x, y, z }` shape, so the two are
  // interchangeable and a second public name would only be ambiguity. Import
  // `Vec3` from `@holoscript/core` as before.
  type Quat,
  type ReadonlyPoint,
  type SyntheticTransform,
  type SyntheticPose,
  type SyntheticSpace,
  type SyntheticGamepad,
  type SyntheticInputSource,
  type WitnessAction,
  type WitnessExpectation,
  type WitnessReceipt,
} from './SyntheticHeadset';
