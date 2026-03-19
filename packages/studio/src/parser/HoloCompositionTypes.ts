/**
 * Re-export HoloComposition types from @holoscript/core.
 * StudioBridge.ts imports from '../parser/HoloCompositionTypes',
 * so this shim resolves the path within the studio package.
 */
export type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloObjectProperty,
  HoloSpatialGroup,
  HoloLight,
  HoloCamera,
  HoloTimeline,
  HoloTimelineEntry,
  HoloValue,
  HoloGroupProperty,
  HoloLightProperty,
  HoloCameraProperty,
  HoloParseResult,
  HoloParseError,
  HoloParseWarning,
} from '@holoscript/core' as any;
