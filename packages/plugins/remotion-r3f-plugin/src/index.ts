/**
 * @holoscript/remotion-r3f-plugin — Remotion + react-three-fiber live-capture stub.
 *
 * Research: ai-ecosystem/research/2026-04-21_remotion-r3f-live-capture-patterns.md
 * Universal-IR matrix: docs/universal-ir-coverage.md (cinematic capture column)
 *
 * Status: STUB. Real Remotion composition ingestion + R3F frame-capture
 * integration are future work; current scope maps Remotion composition
 * metadata to .holo @cinematic + @timeline traits.
 */

export interface RemotionComposition {
  id: string;
  width: number;
  height: number;
  fps: number;
  duration_frames: number;
  props?: Record<string, unknown>;
}

export interface R3FCaptureConfig {
  composition_id: string;
  scene_ref: string; // e.g. component path
  camera_mode: 'fixed' | 'tracking' | 'orbit';
  render_passes?: Array<'color' | 'depth' | 'normal' | 'id'>;
}

export interface HoloCinematicEmission {
  trait: { kind: '@cinematic'; target_id: string; params: Record<string, unknown> };
  timeline: { kind: '@timeline'; target_id: string; params: Record<string, unknown> };
  duration_seconds: number;
  frame_count: number;
}

export function bindRemotionR3F(comp: RemotionComposition, capture: R3FCaptureConfig): HoloCinematicEmission {
  const duration_seconds = comp.duration_frames / Math.max(1, comp.fps);
  return {
    trait: {
      kind: '@cinematic',
      target_id: comp.id,
      params: {
        resolution: [comp.width, comp.height],
        fps: comp.fps,
        camera_mode: capture.camera_mode,
        render_passes: capture.render_passes ?? ['color'],
        scene_ref: capture.scene_ref,
      },
    },
    timeline: {
      kind: '@timeline',
      target_id: `${comp.id}:timeline`,
      params: {
        duration_frames: comp.duration_frames,
        duration_seconds,
      },
    },
    duration_seconds,
    frame_count: comp.duration_frames,
  };
}
