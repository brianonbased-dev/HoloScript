/**
 * MediaRecorder + WebGL canvas (R3F) — capability probe and MIME selection.
 *
 * captureStream() on a WebGL-backed canvas is supported in modern Chromium/WebKit,
 * but codec availability varies. Some browsers need a fallback MIME or produce
 * empty tracks if the GL surface is not actively composited — callers should
 * offer WebCodecs / frame export when quality or reliability matters.
 */

/** Shown in devtools / optional UI when diagnosing empty recordings. */
export const WEBGL_MEDIA_RECORDER_NOTES =
  'WebGL canvases use HTMLCanvasElement.captureStream(). If the recording is black or empty, try: lower FPS, ensure the frame loop is running, or use the WebCodecs export path in videoExporter.';

const WEBM_CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const;

export function getBestWebmMimeForMediaRecorder(): string {
  if (typeof MediaRecorder === 'undefined') {
    return 'video/webm';
  }
  for (const mime of WEBM_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return 'video/webm';
}

export function hasCanvasCaptureStream(): boolean {
  return typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

export interface WebglMediaCaptureSupport {
  captureStream: boolean;
  mediaRecorder: boolean;
  chosenMime: string;
}

export function probeWebglMediaCaptureSupport(): WebglMediaCaptureSupport {
  const captureStream = hasCanvasCaptureStream();
  const mediaRecorder = typeof MediaRecorder !== 'undefined';
  return {
    captureStream,
    mediaRecorder,
    chosenMime: getBestWebmMimeForMediaRecorder(),
  };
}
