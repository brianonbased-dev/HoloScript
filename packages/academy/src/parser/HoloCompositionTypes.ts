/**
 * Studio-local HoloComposition type shim.
 *
 * The published @holoscript/core declarations expose only a subset of the
 * parser surface StudioBridge expects, so this file re-exports the available
 * public types and defines lightweight compatible interfaces for the rest.
 */

import type {
  HoloComposition,
  HoloLight as CoreHoloLight,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloParseError,
  HoloParseResult,
  HoloSpatialGroup,
} from '@holoscript/core';

export type CoreHoloCamera = any;
export type HoloValue = any;

export type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloParseError,
  HoloParseResult,
  HoloSpatialGroup,
};

export interface HoloObjectProperty {
  type: 'ObjectProperty';
  key: string;
  value: HoloValue;
}

export interface HoloGroupProperty {
  type: 'GroupProperty';
  key: string;
  value: HoloValue;
}

export interface HoloLightProperty {
  type: 'LightProperty';
  key: string;
  value: HoloValue;
}

export interface HoloCameraProperty {
  type: 'CameraProperty';
  key: string;
  value: HoloValue;
}

export interface HoloTimelineEntry {
  type: 'TimelineEntry';
  time: number;
  action: unknown;
}

export interface HoloTimeline {
  type: 'Timeline';
  name: string;
  entries: HoloTimelineEntry[];
  autoplay?: boolean;
  loop?: boolean;
}

export interface HoloCamera extends CoreHoloCamera {
  name?: string;
  properties?: HoloCameraProperty[];
}

export interface HoloLight extends CoreHoloLight {
  name?: string;
  properties?: HoloLightProperty[];
}

export interface HoloParseWarning {
  message: string;
  line?: number;
  column?: number;
}
