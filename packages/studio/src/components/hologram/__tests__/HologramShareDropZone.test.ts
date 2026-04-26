// @vitest-environment node
/**
 * HologramShareDropZone — pure-logic tests.
 *
 * Exercises the helpers used by the React shell: media detection, FormData
 * construction, response validation, and share-URL composition.
 *
 * The full drag-drop -> upload -> copy flow is exercised by an e2e
 * Playwright test (deferred to Sprint 2 (B)).
 */

import { describe, it, expect } from 'vitest';

import {
  buildShareUploadFormData,
  detectMediaSourceKind,
  isValidUploadResponse,
  shareUrlForHash,
} from '../hologramShareLogic';

describe('detectMediaSourceKind', () => {
  it.each([
    ['photo.png', undefined, 'image'],
    ['photo.jpg', undefined, 'image'],
    ['photo.jpeg', undefined, 'image'],
    ['photo.webp', undefined, 'image'],
    ['photo.avif', undefined, 'image'],
    ['photo.bmp', undefined, 'image'],
    ['anim.gif', undefined, 'gif'],
    ['anim.apng', undefined, 'gif'],
    ['vid.mp4', undefined, 'video'],
    ['vid.webm', undefined, 'video'],
    ['vid.mov', undefined, 'video'],
    ['vid.mkv', undefined, 'video'],
  ])('detects %s as %s', (name, mime, expected) => {
    expect(detectMediaSourceKind(name, mime)).toBe(expected);
  });

  it('falls back to MIME type when extension is unknown', () => {
    expect(detectMediaSourceKind('blob', 'image/png')).toBe('image');
    expect(detectMediaSourceKind('blob', 'image/gif')).toBe('gif');
    expect(detectMediaSourceKind('blob', 'video/mp4')).toBe('video');
  });

  it('returns null for unsupported types', () => {
    expect(detectMediaSourceKind('doc.pdf')).toBeNull();
    expect(detectMediaSourceKind('code.ts')).toBeNull();
    expect(detectMediaSourceKind('noext')).toBeNull();
    expect(detectMediaSourceKind('weird', 'application/json')).toBeNull();
  });
});

describe('buildShareUploadFormData', () => {
  const META = {
    sourceKind: 'image',
    width: 4,
    height: 4,
    frames: 1,
    modelId: 'm',
    backend: 'cpu',
    inferenceMs: 1,
    createdAt: '2026-04-25T00:00:00.000Z',
    schemaVersion: 1,
  };

  it('always includes meta + depth.bin + normal.bin', () => {
    const fd = buildShareUploadFormData({
      meta: META,
      depthBin: new Uint8Array([1, 2, 3]),
      normalBin: new Uint8Array([4, 5, 6]),
    });
    expect(fd.get('meta')).toBe(JSON.stringify(META));
    expect(fd.get('depth.bin')).toBeInstanceOf(Blob);
    expect(fd.get('normal.bin')).toBeInstanceOf(Blob);
  });

  it('omits optional render fields when absent', () => {
    const fd = buildShareUploadFormData({
      meta: META,
      depthBin: new Uint8Array(0),
      normalBin: new Uint8Array(0),
    });
    expect(fd.get('quilt.png')).toBeNull();
    expect(fd.get('mvhevc.mp4')).toBeNull();
    expect(fd.get('parallax.webm')).toBeNull();
  });

  it('includes optional render fields when present', () => {
    const fd = buildShareUploadFormData({
      meta: META,
      depthBin: new Uint8Array(0),
      normalBin: new Uint8Array(0),
      quiltPng: new Uint8Array([0x89]),
      mvhevcMp4: new Uint8Array([0x00]),
      parallaxWebm: new Uint8Array([0x1a]),
    });
    expect(fd.get('quilt.png')).toBeInstanceOf(Blob);
    expect(fd.get('mvhevc.mp4')).toBeInstanceOf(Blob);
    expect(fd.get('parallax.webm')).toBeInstanceOf(Blob);
  });
});

describe('isValidUploadResponse', () => {
  it('accepts a well-formed response', () => {
    expect(
      isValidUploadResponse({ hash: 'a'.repeat(64), written: true })
    ).toBe(true);
    expect(
      isValidUploadResponse({ hash: 'a'.repeat(64), written: false, url: '/g/a' })
    ).toBe(true);
  });

  it('rejects malformed hash', () => {
    expect(isValidUploadResponse({ hash: 'A'.repeat(64), written: true })).toBe(false);
    expect(isValidUploadResponse({ hash: 'a'.repeat(63), written: true })).toBe(false);
    expect(isValidUploadResponse({ hash: '../etc/passwd', written: true })).toBe(false);
  });

  it('rejects missing fields', () => {
    expect(isValidUploadResponse({ hash: 'a'.repeat(64) })).toBe(false);
    expect(isValidUploadResponse({ written: true })).toBe(false);
    expect(isValidUploadResponse({})).toBe(false);
    expect(isValidUploadResponse(null)).toBe(false);
    expect(isValidUploadResponse(undefined)).toBe(false);
    expect(isValidUploadResponse('string')).toBe(false);
  });

  it('rejects wrong types', () => {
    expect(isValidUploadResponse({ hash: 12345, written: true })).toBe(false);
    expect(isValidUploadResponse({ hash: 'a'.repeat(64), written: 'yes' })).toBe(false);
  });
});

describe('shareUrlForHash', () => {
  it('returns /g/<hash> for valid hash', () => {
    expect(shareUrlForHash('a'.repeat(64))).toBe(`/g/${'a'.repeat(64)}`);
  });

  it('returns "#" for invalid hash', () => {
    expect(shareUrlForHash('A'.repeat(64))).toBe('#');
    expect(shareUrlForHash('short')).toBe('#');
    expect(shareUrlForHash('../etc/passwd')).toBe('#');
    expect(shareUrlForHash('')).toBe('#');
  });
});
