/**
 * holoscript-net-utility.scenario.ts — LIVING-SPEC: Web Developer Integration
 *
 * Persona: Alex — a web developer integrating HoloScript scenes into external platforms.
 * They rely on holoscript.net endpoints to:
 *   - Embed 3D scenes in React/marketing websites
 *   - Route multiplayer collaboration via WebSockets
 *   - Generate smart QR codes for physical activations
 *   - Inject Twitter/X social preview player tags
 *
 * Run: npx vitest run src/__tests__/scenarios/holoscript-net-utility.scenario.ts
 */

import { describe, it, expect } from 'vitest';
import {
  getPlaygroundUrl,
  getEmbedUrl,
  getPreviewUrl,
  getQrCodeUrl,
  getCollabUrl,
  generateTwitterPlayerTags,
  generateIframeSnippet,
  validateScenePayloadSize
} from '../../lib/holoscriptNetUtils';

describe('Scenario: Web Developer Integration — HoloScript.net Utilities', () => {
  const sceneId = 'abc12345';
  const roomId = 'room-alpha-99';

  describe('1. URL Generation', () => {
    it('getPlaygroundUrl() resolves to play.holoscript.net with query params', () => {
      const url = getPlaygroundUrl(sceneId);
      expect(url).toBe(`https://play.holoscript.net/?scene=${sceneId}`);
      
      const autoStartUrl = getPlaygroundUrl(sceneId, { autoStart: true });
      expect(autoStartUrl).toBe(`https://play.holoscript.net/?scene=${sceneId}&autoStart=true`);
    });

    it('getEmbedUrl() resolves to api.holoscript.net/embed endpoint', () => {
      const url = getEmbedUrl(sceneId);
      expect(url).toBe(`https://api.holoscript.net/embed/${sceneId}`);
    });

    it('getPreviewUrl() resolves to api.holoscript.net/preview endpoint', () => {
      const url = getPreviewUrl(sceneId);
      expect(url).toBe(`https://api.holoscript.net/preview/${sceneId}`);
    });
  });

  describe('2. Metadata Tags', () => {
    it('generateTwitterPlayerTags() outputs valid meta tags for social media previews', () => {
      const title = 'My Cool Scene';
      const tags = generateTwitterPlayerTags(sceneId, title);
      
      expect(tags).toContain('<meta name="twitter:card" content="player" />');
      expect(tags).toContain(`<meta name="twitter:title" content="${title}" />`);
      expect(tags).toContain(`<meta name="twitter:player" content="https://api.holoscript.net/render/${sceneId}" />`);
    });

    it('generateIframeSnippet() generates a responsive iframe code block', () => {
      const snippet = generateIframeSnippet(sceneId);
      
      expect(snippet).toContain('<iframe');
      expect(snippet).toContain(`src="https://api.holoscript.net/embed/${sceneId}"`);
      expect(snippet).toContain('allow="xr-spatial-tracking; fullscreen"');
      expect(snippet).toContain('width="100%"');
      expect(snippet).toContain('height="500px"');
    });
  });

  describe('3. Collaboration Sync Links', () => {
    it('getCollabUrl() resolves to wss://collab.holoscript.net WebSocket URL', () => {
      const url = getCollabUrl(roomId);
      expect(url).toBe(`wss://collab.holoscript.net/${roomId}`);
    });
  });

  describe('4. QR Code Generation', () => {
    it('getQrCodeUrl() resolves to api.holoscript.net/qr endpoint', () => {
      const url = getQrCodeUrl(sceneId);
      expect(url).toBe(`https://api.holoscript.net/qr/${sceneId}`);
    });
  });

  describe('5. REST API Limits', () => {
    it('validateScenePayloadSize() returns valid for small payloads', () => {
      const result = validateScenePayloadSize(5 * 1024 * 1024); // 5MB
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('validateScenePayloadSize() returns invalid with error message for payloads exceeding max limits', () => {
      const maxBytes = 10 * 1024 * 1024; // 10MB default
      const result = validateScenePayloadSize(15 * 1024 * 1024); // 15MB
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain(`exceeds maximum allowed size of ${maxBytes}`);
    });
  });
});
