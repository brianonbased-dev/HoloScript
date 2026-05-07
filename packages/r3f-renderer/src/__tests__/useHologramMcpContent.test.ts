/**
 * Tests for useHologramMcpContent + resolveHologramMcpContent
 * (task_1778114362909_zp7u).
 */
import { describe, it, expect } from 'vitest';
import {
  HOLOGRAM_CONTENT_TYPES,
  buildHologramMcpResponse,
  wrapHologramMcpEnvelope,
} from '@holoscript/core';

import { resolveHologramMcpContent } from '../hooks/useHologramMcpContent';

describe('resolveHologramMcpContent - pure resolver', () => {
  it('routes a hash payload to the parallax video URL by default', () => {
    const response = buildHologramMcpResponse({
      contentType: HOLOGRAM_CONTENT_TYPES.parallax,
      payload: { kind: 'hash', hash: 'abc123' },
      text: 'A parallax card',
      producedBy: 'unit-test',
      createdAt: '2026-05-07T00:00:00.000Z',
    });

    const resolved = resolveHologramMcpContent(response);
    expect(resolved.route).toBe('parallax');
    expect(resolved.assetUrl).toBe('/api/hologram/abc123/parallax.webm');
    expect(resolved.contentKey).toBe('hash:abc123');
    expect(resolved.holoCode).toBeUndefined();
  });

  it('routes a quilt content_type to quilt.png', () => {
    const response = buildHologramMcpResponse({
      contentType: HOLOGRAM_CONTENT_TYPES.quilt,
      payload: { kind: 'hash', hash: 'def456', studioBase: 'https://studio.example' },
      text: 'A Looking Glass quilt',
      producedBy: 'unit-test',
      createdAt: '2026-05-07T00:00:00.000Z',
    });

    const resolved = resolveHologramMcpContent(response);
    expect(resolved.route).toBe('quilt');
    expect(resolved.assetUrl).toBe('https://studio.example/api/hologram/def456/quilt.png');
  });

  it('routes a mvhevc content_type to mvhevc.mp4', () => {
    const response = buildHologramMcpResponse({
      contentType: HOLOGRAM_CONTENT_TYPES.mvhevc,
      payload: { kind: 'hash', hash: 'ghi789' },
      text: 'A spatial video',
      producedBy: 'unit-test',
      createdAt: '2026-05-07T00:00:00.000Z',
    });

    const resolved = resolveHologramMcpContent(response);
    expect(resolved.route).toBe('mvhevc');
    expect(resolved.assetUrl).toBe('/api/hologram/ghi789/mvhevc.mp4');
  });

  it('routes holo-code payloads to the holo-code branch', () => {
    const holoCode = 'composition "Demo" { object "x" { geometry: "box" } }';
    const response = buildHologramMcpResponse({
      contentType: HOLOGRAM_CONTENT_TYPES.holo,
      payload: { kind: 'holo-code', holoCode },
      text: 'Demo composition',
      producedBy: 'unit-test',
      createdAt: '2026-05-07T00:00:00.000Z',
    });

    const resolved = resolveHologramMcpContent(response);
    expect(resolved.route).toBe('holo-code');
    expect(resolved.assetUrl).toBeUndefined();
    expect(resolved.holoCode).toBe(holoCode);
    expect(resolved.contentKey.startsWith('holo-code:')).toBe(true);
  });

  it('passes through url payloads as-is', () => {
    const response = buildHologramMcpResponse({
      contentType: HOLOGRAM_CONTENT_TYPES.mvhevc,
      payload: { kind: 'url', url: 'https://cdn.example/hologram.mp4', mimeType: 'video/mp4' },
      text: 'Spatial video from CDN',
      producedBy: 'unit-test',
      createdAt: '2026-05-07T00:00:00.000Z',
    });

    const resolved = resolveHologramMcpContent(response);
    expect(resolved.route).toBe('mvhevc');
    expect(resolved.assetUrl).toBe('https://cdn.example/hologram.mp4');
    expect(resolved.contentKey).toBe('url:https://cdn.example/hologram.mp4');
  });

  it('honors the preferredViewer hint when set', () => {
    const response = buildHologramMcpResponse({
      contentType: HOLOGRAM_CONTENT_TYPES.holo,
      payload: { kind: 'hash', hash: 'jkl' },
      text: 'Hologram with hint',
      producedBy: 'unit-test',
      createdAt: '2026-05-07T00:00:00.000Z',
      hints: { preferredViewer: 'quilt' },
    });

    const resolved = resolveHologramMcpContent(response);
    expect(resolved.route).toBe('quilt');
  });

  it('content keys are stable across identical payloads', () => {
    const r1 = buildHologramMcpResponse({
      contentType: HOLOGRAM_CONTENT_TYPES.holo,
      payload: { kind: 'hash', hash: 'same-hash' },
      text: 't',
      producedBy: 'unit-test',
      createdAt: '2026-05-07T00:00:00.000Z',
    });
    const r2 = buildHologramMcpResponse({
      contentType: HOLOGRAM_CONTENT_TYPES.holo,
      payload: { kind: 'hash', hash: 'same-hash' },
      text: 'different text',
      producedBy: 'unit-test',
      createdAt: '2026-05-07T00:00:00.000Z',
    });
    expect(resolveHologramMcpContent(r1).contentKey).toBe(
      resolveHologramMcpContent(r2).contentKey,
    );
  });

  it('content keys differ across different payloads', () => {
    const r1 = buildHologramMcpResponse({
      contentType: HOLOGRAM_CONTENT_TYPES.holo,
      payload: { kind: 'hash', hash: 'A' },
      text: 't',
      producedBy: 'unit-test',
      createdAt: '2026-05-07T00:00:00.000Z',
    });
    const r2 = buildHologramMcpResponse({
      contentType: HOLOGRAM_CONTENT_TYPES.holo,
      payload: { kind: 'hash', hash: 'B' },
      text: 't',
      producedBy: 'unit-test',
      createdAt: '2026-05-07T00:00:00.000Z',
    });
    expect(resolveHologramMcpContent(r1).contentKey).not.toBe(
      resolveHologramMcpContent(r2).contentKey,
    );
  });

  it('integrates with wrapHologramMcpEnvelope round-trip', () => {
    const response = buildHologramMcpResponse({
      contentType: HOLOGRAM_CONTENT_TYPES.holo,
      payload: { kind: 'holo-code', holoCode: 'composition "x" {}' },
      text: 't',
      producedBy: 'unit-test',
      createdAt: '2026-05-07T00:00:00.000Z',
    });
    const envelope = wrapHologramMcpEnvelope(response);
    // The envelope's hologramContent is what callers pass into the hook.
    const resolved = resolveHologramMcpContent(envelope.hologramContent);
    expect(resolved.route).toBe('holo-code');
  });
});
