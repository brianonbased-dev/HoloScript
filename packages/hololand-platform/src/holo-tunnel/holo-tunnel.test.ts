import { afterEach, describe, expect, it } from 'vitest';

import {
  buildHoloTunnelLiveUrl,
  buildHoloTunnelSharePacket,
  buildHoloTunnelWsUrl,
  normalizeHoloTunnelRelayBase,
  resolveHoloTunnelClientToken,
} from './index';

const originalToken = process.env.HOLOTUNNEL_CLIENT_TOKEN;

afterEach(() => {
  if (originalToken === undefined) {
    delete process.env.HOLOTUNNEL_CLIENT_TOKEN;
  } else {
    process.env.HOLOTUNNEL_CLIENT_TOKEN = originalToken;
  }
});

describe('HoloTunnel URL helpers', () => {
  it('normalizes websocket relay URLs to the HTTPS relay base', () => {
    expect(normalizeHoloTunnelRelayBase('wss://relay.example/tunnel-ws/')).toBe(
      'https://relay.example'
    );
    expect(buildHoloTunnelWsUrl('https://relay.example/')).toBe(
      'wss://relay.example/tunnel-ws'
    );
    expect(buildHoloTunnelLiveUrl('ws://relay.example/tunnel-ws')).toBe(
      'http://relay.example/live'
    );
  });

  it('builds sanitized share packets for HoloLand access surfaces', () => {
    expect(
      buildHoloTunnelSharePacket({
        directUrl: 'https://relay.example/t/abc',
        relayBase: 'wss://relay.example/tunnel-ws',
        worldId: 'world-1',
        sessionName: 'Workshop Preview',
        sourceRef: 'scenes/workshop.holo',
        createdBy: 'studio',
        expiresAt: '2026-05-19T12:00:00.000Z',
      })
    ).toEqual({
      schemaVersion: 'holoscript.holotunnel.share-packet.v1',
      worldId: 'world-1',
      sessionName: 'Workshop Preview',
      stableUrl: 'https://relay.example/live',
      directUrl: 'https://relay.example/t/abc',
      sourceRef: 'scenes/workshop.holo',
      createdBy: 'studio',
      expiresAt: '2026-05-19T12:00:00.000Z',
    });
  });

  it('prefers explicit client tokens over environment tokens', () => {
    process.env.HOLOTUNNEL_CLIENT_TOKEN = 'env-token';

    expect(resolveHoloTunnelClientToken()).toBe('env-token');
    expect(resolveHoloTunnelClientToken('explicit-token')).toBe('explicit-token');
  });
});
