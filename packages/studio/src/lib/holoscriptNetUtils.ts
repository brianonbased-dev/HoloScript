/**
 * holoscriptNetUtils.ts
 *
 * Utility functions for integrating with holoscript.net web services.
 */

const API_BASE_URL = 'https://api.holoscript.net';
const PLAY_BASE_URL = 'https://play.holoscript.net';
const COLLAB_BASE_URL = 'wss://collab.holoscript.net';

export function getPlaygroundUrl(sceneId: string, options?: { autoStart?: boolean }): string {
  const url = new URL(PLAY_BASE_URL);
  url.searchParams.set('scene', sceneId);
  if (options?.autoStart) {
    url.searchParams.set('autoStart', 'true');
  }
  return url.toString();
}

export function getEmbedUrl(sceneId: string): string {
  return `${API_BASE_URL}/embed/${sceneId}`;
}

export function getPreviewUrl(sceneId: string): string {
  return `${API_BASE_URL}/preview/${sceneId}`;
}

export function getQrCodeUrl(sceneId: string): string {
  return `${API_BASE_URL}/qr/${sceneId}`;
}

export function getCollabUrl(roomId: string): string {
  return `${COLLAB_BASE_URL}/${roomId}`;
}

export function generateTwitterPlayerTags(sceneId: string, title: string): string {
  return `
<meta name="twitter:card" content="player" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:player" content="${API_BASE_URL}/render/${sceneId}" />
<meta name="twitter:player:width" content="1280" />
<meta name="twitter:player:height" content="720" />
  `.trim();
}

export function generateIframeSnippet(sceneId: string, width = '100%', height = '500px'): string {
  return `<iframe src="${getEmbedUrl(sceneId)}" width="${width}" height="${height}" frameborder="0" allow="xr-spatial-tracking; fullscreen"></iframe>`;
}

export function validateScenePayloadSize(
  payloadBytes: number,
  maxBytes = 10 * 1024 * 1024
): { valid: boolean; error?: string } {
  if (payloadBytes > maxBytes) {
    return {
      valid: false,
      error: `Payload size ${payloadBytes} exceeds maximum allowed size of ${maxBytes} bytes.`,
    };
  }
  return { valid: true };
}
