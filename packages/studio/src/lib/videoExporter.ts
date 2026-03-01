/**
 * videoExporter.ts — Video/GIF Export Engine
 *
 * Capture canvas frames and encode to video or animated GIF.
 */

export interface VideoExportConfig {
  format: 'mp4' | 'webm' | 'gif';
  width: number;
  height: number;
  fps: number;
  duration: number;        // seconds
  quality: number;         // 0..1
  codec?: string;
  loop?: boolean;          // GIF only
}

export interface ExportProgress {
  phase: 'capturing' | 'encoding' | 'done' | 'error';
  framesCaputred: number;
  totalFrames: number;
  percent: number;
  estimatedSizeBytes: number;
}

export interface VideoExportResult {
  format: VideoExportConfig['format'];
  blob: Blob | null;
  sizeBytes: number;
  frames: number;
  duration: number;
  downloadUrl: string;
}

const DEFAULT_CONFIG: VideoExportConfig = {
  format: 'webm',
  width: 1920,
  height: 1080,
  fps: 30,
  duration: 5,
  quality: 0.8,
};

/**
 * Calculate total frame count for an export config.
 */
export function totalFrames(config: Partial<VideoExportConfig>): number {
  const c = { ...DEFAULT_CONFIG, ...config };
  return Math.ceil(c.fps * c.duration);
}

/**
 * Estimate output file size in bytes.
 */
export function estimateFileSize(config: Partial<VideoExportConfig>): number {
  const c = { ...DEFAULT_CONFIG, ...config };
  const pixels = c.width * c.height;
  const frames = totalFrames(c);

  // Rough compression ratios per format
  const bytesPerPixelPerFrame: Record<VideoExportConfig['format'], number> = {
    gif: 0.5,   // Heavily dithered, ~0.5 bytes/pixel/frame
    webm: 0.08, // VP8/VP9 compression
    mp4: 0.06,  // H.264 compression
  };

  return Math.round(pixels * frames * bytesPerPixelPerFrame[c.format] * c.quality);
}

/**
 * Get recommended codec for format.
 */
export function recommendedCodec(format: VideoExportConfig['format']): string {
  switch (format) {
    case 'mp4': return 'avc1.42E01E'; // H.264 Baseline
    case 'webm': return 'vp9';
    case 'gif': return 'gif';
  }
}

/**
 * Get MIME type for a video format.
 */
export function mimeType(format: VideoExportConfig['format']): string {
  switch (format) {
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'gif': return 'image/gif';
  }
}

/**
 * Check if MediaRecorder supports a given format.
 */
export function isFormatSupported(format: VideoExportConfig['format']): boolean {
  if (typeof MediaRecorder === 'undefined') return false;
  return MediaRecorder.isTypeSupported(mimeType(format));
}

/**
 * Create an export progress tracker.
 */
export function createProgress(config: Partial<VideoExportConfig>): ExportProgress {
  const frames = totalFrames(config);
  return {
    phase: 'capturing',
    framesCaputred: 0,
    totalFrames: frames,
    percent: 0,
    estimatedSizeBytes: estimateFileSize(config),
  };
}

/**
 * Update progress after a frame is captured.
 */
export function advanceProgress(progress: ExportProgress): ExportProgress {
  const captured = progress.framesCaputred + 1;
  const percent = Math.round((captured / progress.totalFrames) * 100);
  const phase = captured >= progress.totalFrames ? 'encoding' : 'capturing';
  return { ...progress, framesCaputred: captured, percent, phase };
}

/**
 * Generate a filename for the export.
 */
export function exportFilename(projectName: string, format: VideoExportConfig['format']): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const ext = format === 'gif' ? 'gif' : format;
  return `${projectName}-${timestamp}.${ext}`;
}
