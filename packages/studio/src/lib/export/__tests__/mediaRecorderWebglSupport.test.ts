// @vitest-environment jsdom

import { describe, expect, it, afterEach } from 'vitest';
import {
  getBestWebmMimeForMediaRecorder,
  hasCanvasCaptureStream,
  probeWebglMediaCaptureSupport,
} from '../mediaRecorderWebglSupport';

describe('mediaRecorderWebglSupport', () => {
  const origMR = globalThis.MediaRecorder;
  const origCapture =
    typeof HTMLCanvasElement !== 'undefined'
      ? HTMLCanvasElement.prototype.captureStream
      : undefined;

  afterEach(() => {
    globalThis.MediaRecorder = origMR;
    if (typeof HTMLCanvasElement !== 'undefined') {
      if (origCapture) {
        HTMLCanvasElement.prototype.captureStream = origCapture;
      } else {
        delete (HTMLCanvasElement.prototype as { captureStream?: unknown }).captureStream;
      }
    }
  });

  it('getBestWebmMimeForMediaRecorder picks first supported candidate', () => {
    globalThis.MediaRecorder = class {
      static isTypeSupported(type: string) {
        return type === 'video/webm;codecs=vp8';
      }
    } as typeof MediaRecorder;

    expect(getBestWebmMimeForMediaRecorder()).toBe('video/webm;codecs=vp8');
  });

  it('getBestWebmMimeForMediaRecorder falls back when nothing matches', () => {
    globalThis.MediaRecorder = class {
      static isTypeSupported() {
        return false;
      }
    } as typeof MediaRecorder;

    expect(getBestWebmMimeForMediaRecorder()).toBe('video/webm');
  });

  it('hasCanvasCaptureStream reflects prototype', () => {
    HTMLCanvasElement.prototype.captureStream = function () {
      return {} as MediaStream;
    };
    expect(hasCanvasCaptureStream()).toBe(true);
    delete (HTMLCanvasElement.prototype as { captureStream?: unknown }).captureStream;
    expect(hasCanvasCaptureStream()).toBe(false);
  });

  it('probeWebglMediaCaptureSupport aggregates flags', () => {
    globalThis.MediaRecorder = class {
      static isTypeSupported(type: string) {
        return type.includes('vp9');
      }
    } as typeof MediaRecorder;
    HTMLCanvasElement.prototype.captureStream = function () {
      return {} as MediaStream;
    };

    const p = probeWebglMediaCaptureSupport();
    expect(p.captureStream).toBe(true);
    expect(p.mediaRecorder).toBe(true);
    expect(p.chosenMime).toBe('video/webm;codecs=vp9');
  });
});
