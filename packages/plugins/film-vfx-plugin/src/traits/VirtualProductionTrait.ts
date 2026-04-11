/**
 * @virtual_production trait — LED wall virtual production (VP) configuration
 *
 * Manages LED volume/wall configuration, camera frustum tracking,
 * inner/outer frustum rendering, genlock sync, and stage calibration.
 * Designed for ICVFX (In-Camera Visual Effects) workflows.
 *
 * @module @holoscript/plugin-film-vfx
 */

// ============================================================================
// Types
// ============================================================================

export type SyncMode =
  | 'genlock'
  | 'framelock'
  | 'freerun'
  | 'timecode'
  | 'ntp';

export type LEDPanelLayout =
  | 'flat_wall'
  | 'curved_wall'
  | 'three_wall'
  | 'full_volume'
  | 'ceiling_floor'
  | 'custom';

export interface FrustumConfig {
  /** Camera sensor width in mm */
  sensorWidth: number;
  /** Camera sensor height in mm */
  sensorHeight: number;
  /** Current focal length in mm */
  focalLength: number;
  /** Near clip plane in meters */
  nearClip: number;
  /** Far clip plane in meters */
  farClip: number;
  /** Inner frustum overscan percentage (0-50) */
  overscan?: number;
  /** Multi-sample anti-aliasing level for inner frustum */
  msaa?: 1 | 2 | 4 | 8;
}

export interface LEDWallConfig {
  /** Wall identifier */
  id: string;
  /** Panel layout type */
  layout: LEDPanelLayout;
  /** Physical dimensions in meters [width, height] */
  dimensions: [number, number];
  /** Panel pixel resolution [horizontal, vertical] */
  resolution: [number, number];
  /** Pixel pitch in mm */
  pixelPitch: number;
  /** Wall position relative to stage origin [x, y, z] meters */
  position: [number, number, number];
  /** Wall rotation [pitch, yaw, roll] degrees */
  rotation: [number, number, number];
  /** Curve radius in meters (for curved walls, 0 = flat) */
  curveRadius?: number;
  /** nDisplay cluster node name */
  nDisplayNode?: string;
}

export interface CameraTrackingConfig {
  /** Tracking system type */
  system: 'stype' | 'ncam' | 'mo-sys' | 'optitrack' | 'vive' | 'antilatency' | 'custom';
  /** Tracking latency in ms (for compensation) */
  latency?: number;
  /** Tracking offset from camera body [x, y, z] mm */
  offset?: [number, number, number];
  /** Enable lens encoder data */
  lensEncoding?: boolean;
  /** Enable lens distortion correction */
  distortionCorrection?: boolean;
}

export interface VirtualProductionConfig {
  /** Stage identifier */
  stageId: string;
  /** LED wall configurations */
  walls: LEDWallConfig[];
  /** Camera frustum configuration */
  frustum: FrustumConfig;
  /** Camera tracking system */
  tracking: CameraTrackingConfig;
  /** Synchronization mode */
  syncMode: SyncMode;
  /** Target frame rate */
  frameRate: number;
  /** Color space for LED output */
  colorSpace?: 'srgb' | 'rec709' | 'rec2020' | 'aces_cg' | 'dci_p3';
  /** Enable light card system */
  lightCards?: boolean;
  /** Inner frustum render priority (higher = more GPU) */
  innerFrustumPriority?: number;
  /** Outer frustum quality (0-1, lower = faster) */
  outerFrustumQuality?: number;
  /** Enable green screen compositing for ceiling gaps */
  greenScreenFill?: boolean;
  /** Stage calibration data file path */
  calibrationFile?: string;
  /** Enable real-time color calibration */
  realtimeColorCalibration?: boolean;
}

// ============================================================================
// Trait Handler
// ============================================================================

export interface VirtualProductionTraitHandler {
  name: 'virtual_production';
  defaultConfig: VirtualProductionConfig;
  onAttach(entity: unknown, config: VirtualProductionConfig): void;
  onDetach(entity: unknown): void;
  onUpdate(entity: unknown, config: Partial<VirtualProductionConfig>): void;
  onEvent(entity: unknown, event: string, payload: unknown): void;
}

export function createVirtualProductionHandler(): VirtualProductionTraitHandler {
  return {
    name: 'virtual_production',
    defaultConfig: {
      stageId: 'stage_main',
      walls: [
        {
          id: 'main_wall',
          layout: 'curved_wall',
          dimensions: [20, 6],
          resolution: [7680, 2160],
          pixelPitch: 2.6,
          position: [0, 3, -10],
          rotation: [0, 0, 0],
          curveRadius: 12,
        },
      ],
      frustum: {
        sensorWidth: 36,
        sensorHeight: 24,
        focalLength: 35,
        nearClip: 0.1,
        farClip: 1000,
        overscan: 10,
        msaa: 4,
      },
      tracking: {
        system: 'stype',
        latency: 1,
        lensEncoding: true,
        distortionCorrection: true,
      },
      syncMode: 'genlock',
      frameRate: 23.976,
      colorSpace: 'aces_cg',
      lightCards: true,
      innerFrustumPriority: 10,
      outerFrustumQuality: 0.5,
    },
    onAttach(entity: unknown, config: VirtualProductionConfig): void {
      // Initialize VP stage: connect walls, start tracking, configure frustum
      void entity;
      void config;
    },
    onDetach(entity: unknown): void {
      // Disconnect walls, stop tracking, release GPU resources
      void entity;
    },
    onUpdate(entity: unknown, config: Partial<VirtualProductionConfig>): void {
      // Update frustum, tracking, sync mode, or wall config in real-time
      void entity;
      void config;
    },
    onEvent(entity: unknown, event: string, payload: unknown): void {
      // Handle events: 'calibrate', 'snapshot', 'record_start', 'record_stop',
      // 'switch_environment', 'blackout_walls', 'freeze_frame'
      void entity;
      void event;
      void payload;
    },
  };
}
