/**
 * HoloScene custom element attribute types
 */

export type HoloSceneTarget =
  | "webxr"
  | "threejs"
  | "babylon"
  | "unity"
  | "godot"
  | "visionos"
  | "android-xr"
  | "auto";

export type HoloSceneFallback = "threejs" | "canvas2d" | "static-image" | "none";

export type HoloSceneLoadingState = "idle" | "loading" | "compiling" | "rendering" | "error";

export interface HoloSceneAttributes {
  src?: string;
  inline?: string;
  target?: HoloSceneTarget;
  fallback?: HoloSceneFallback;
  width?: string | number;
  height?: string | number;
  autoplay?: boolean;
  vr?: boolean;
  ar?: boolean;
  loading?: boolean;
  class?: string;
}

export interface HoloSceneLoadEvent {
  type: "holo-load";
  source: string;
  target: HoloSceneTarget;
  compileTimeMs: number;
}

export interface HoloSceneErrorEvent {
  type: "holo-error";
  message: string;
  source?: string;
}
