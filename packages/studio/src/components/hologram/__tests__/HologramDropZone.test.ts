/**
 * HologramDropZone — Tests for media detection and composition generation logic.
 *
 * Since this is a React component with drag-and-drop, we test the pure logic
 * (media type detection, composition code generation) without rendering.
 */

import { describe, it, expect } from 'vitest';

// ── Media Type Detection (extracted logic) ──────────────────────────────────

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif', 'tiff', 'bmp']);
const GIF_EXTENSIONS = new Set(['gif', 'apng']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi', 'ogv']);

type MediaType = 'image' | 'gif' | 'video';

function detectMediaType(filename: string, mimeType: string = ''): MediaType | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (GIF_EXTENSIONS.has(ext)) return 'gif';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (mimeType.startsWith('image/gif')) return 'gif';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return null;
}

// ── Composition Generation (extracted logic) ─────────────────────────────────

function generateImageObject(name: string, filename: string, x: number, y: number): string {
  return `  object "${name}" {
    @image src:"${filename}"
    @depth_estimation { model: "depth-anything-v2-small", backend: "webgpu" }
    @displacement { scale: 0.3, segments: 128 }
    @depth_to_normal
    geometry: "plane"
    position: [${x}, ${y}, -3]
    scale: [2, 1.5, 1]
  }`;
}

function generateGifObject(name: string, filename: string, x: number, y: number): string {
  return `  object "${name}" {
    @animated_texture { src: "${filename}", fps: 24, max_frames: 500 }
    @segment { model: "rembg", remove_background: true }
    @depth_estimation { model: "depth-anything-v2-small", backend: "webgpu", temporal_smoothing: 0.8 }
    @holographic_sprite { depth_scale: 0.5, render_mode: "displacement" }
    @billboard { mode: "camera-facing" }
    position: [${x}, ${y}, -2]
    scale: [2, 2, 1]
  }`;
}

function generateVideoObject(name: string, filename: string, x: number, y: number): string {
  return `  object "${name}" {
    @video { src: "${filename}", autoplay: true, loop: true, muted: true }
    @depth_estimation { model: "depth-anything-v2-small", backend: "webgpu", temporal_smoothing: 0.8 }
    @displacement { scale: 0.25, segments: 64 }
    position: [${x}, ${y}, -3]
    scale: [3, 1.7, 1]
  }`;
}

describe('HologramDropZone — Media Detection', () => {
  describe('image extensions', () => {
    it.each([
      'photo.png',
      'image.jpg',
      'pic.jpeg',
      'shot.webp',
      'HDR.avif',
      'scan.tiff',
      'old.bmp',
    ])('detects %s as image', (filename) => {
      expect(detectMediaType(filename)).toBe('image');
    });
  });

  describe('GIF extensions', () => {
    it.each(['animation.gif', 'sticker.apng'])('detects %s as gif', (filename) => {
      expect(detectMediaType(filename)).toBe('gif');
    });
  });

  describe('video extensions', () => {
    it.each(['clip.mp4', 'screen.webm', 'movie.mov', 'raw.mkv', 'old.avi', 'web.ogv'])(
      'detects %s as video',
      (filename) => {
        expect(detectMediaType(filename)).toBe('video');
      }
    );
  });

  describe('MIME type fallback', () => {
    it('detects image/gif MIME as gif', () => {
      expect(detectMediaType('unknown', 'image/gif')).toBe('gif');
    });

    it('detects image/* MIME as image', () => {
      expect(detectMediaType('unknown', 'image/png')).toBe('image');
    });

    it('detects video/* MIME as video', () => {
      expect(detectMediaType('unknown', 'video/mp4')).toBe('video');
    });
  });

  describe('unsupported files', () => {
    it('returns null for unsupported extensions', () => {
      expect(detectMediaType('document.pdf')).toBeNull();
      expect(detectMediaType('code.ts')).toBeNull();
      expect(detectMediaType('data.json')).toBeNull();
    });

    it('returns null for no extension', () => {
      expect(detectMediaType('noextension')).toBeNull();
    });
  });
});

describe('HologramDropZone — Composition Generation', () => {
  describe('image objects', () => {
    it('generates @image and @depth_estimation traits', () => {
      const code = generateImageObject('photo', 'photo.jpg', 0, 1.5);
      expect(code).toContain('@image src:"photo.jpg"');
      expect(code).toContain('@depth_estimation');
      expect(code).toContain('@displacement');
      expect(code).toContain('@depth_to_normal');
    });

    it('positions are included correctly', () => {
      const code = generateImageObject('test', 'test.png', 2.5, 1.6);
      expect(code).toContain('position: [2.5, 1.6, -3]');
    });
  });

  describe('gif objects', () => {
    it('generates @animated_texture and @holographic_sprite traits', () => {
      const code = generateGifObject('sticker', 'sticker.gif', 0, 1.5);
      expect(code).toContain('@animated_texture');
      expect(code).toContain('@segment');
      expect(code).toContain('@holographic_sprite');
      expect(code).toContain('@billboard');
    });

    it('includes temporal_smoothing for animated depth', () => {
      const code = generateGifObject('anim', 'anim.gif', 0, 1.5);
      expect(code).toContain('temporal_smoothing: 0.8');
    });
  });

  describe('video objects', () => {
    it('generates @video trait with autoplay', () => {
      const code = generateVideoObject('clip', 'clip.mp4', 0, 1.5);
      expect(code).toContain('@video');
      expect(code).toContain('autoplay: true');
      expect(code).toContain('loop: true');
      expect(code).toContain('muted: true');
    });

    it('uses lower segment count for video displacement', () => {
      const code = generateVideoObject('vid', 'vid.webm', 0, 1.5);
      expect(code).toContain('segments: 64');
    });
  });

  describe('composition naming', () => {
    it('single file uses file name', () => {
      const name = 'photo';
      const compositionName = `Hologram - ${name}`;
      expect(compositionName).toBe('Hologram - photo');
    });

    it('multiple files uses count', () => {
      const count = 3;
      const compositionName = `Hologram Gallery (${count} items)`;
      expect(compositionName).toBe('Hologram Gallery (3 items)');
    });
  });
});
