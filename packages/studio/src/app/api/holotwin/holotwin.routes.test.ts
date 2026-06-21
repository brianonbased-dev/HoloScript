import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { POST as compilePost } from './compile/route';
import { GET as connectGet, POST as connectPost } from './connect/route';
import { POST as disconnectPost } from './disconnect/route';
import { POST as mapPost } from './map/route';
import { DELETE as streamDelete, POST as streamPost } from './stream/route';
import { resetHoloTwinRuntimeForTests } from './_runtime';

const HOLOTWIN_CODE = `composition "Studio HoloTwin" {
  object "HumiditySensor" {
    @quilt {
      device: "go"
      views: 4
      columns: 2
      rows: 2
      resolution: [128, 128]
      baseline: 0.02
      focusDistance: 0.15
    }
    geometry: "box"
    color: "#4ECDC4"
  }
}`;

function request(path: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('HoloTwin Studio API routes', () => {
  beforeEach(() => {
    resetHoloTwinRuntimeForTests();
  });

  it('shares session state across connect, map, compile, stream, and disconnect routes', async () => {
    const connectRes = await connectPost(
      request('/api/holotwin/connect', {
        physicalId: 'farm-001',
        protocol: 'mqtt',
        connectionString: 'memory://farm-001',
        displayDevice: 'go',
      })
    );
    const connectBody = (await connectRes.json()) as Record<string, unknown>;
    expect(connectBody.ok).toBe(true);
    expect(connectBody.connectionProbe).toMatchObject({ mode: 'simulated' });
    const sessionId = String(connectBody.sessionId);

    const mapRes = await mapPost(
      request('/api/holotwin/map', {
        sessionId,
        mappings: [
          {
            sensor_key: 'humidity',
            scene_property: 'HumiditySensor.color',
            transform: 'color',
            min: 0,
            max: 100,
          },
        ],
      })
    );
    const mapBody = (await mapRes.json()) as Record<string, unknown>;
    expect(mapBody.mappingsCount).toBe(1);

    const compileRes = await compilePost(
      request('/api/holotwin/compile', {
        sessionId,
        device: 'go',
        holoCode: HOLOTWIN_CODE,
        quiltConfig: {
          views: 4,
          columns: 2,
          rows: 2,
          resolution: [128, 128],
          baseline: 0.02,
          focusDistance: 0.15,
        },
      })
    );
    const compileBody = (await compileRes.json()) as Record<string, unknown>;
    expect(compileBody.stub).toBe(false);
    expect(compileBody.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(compileBody.url).toMatch(/^data:image\/png;base64,/);
    const quilt = compileBody.quilt as Record<string, unknown>;
    const receipt = quilt.receipt as Record<string, unknown>;
    expect(receipt.pngBase64).toMatch(/^iVBOR/);

    const streamRes = await streamPost(
      request('/api/holotwin/stream', {
        sessionId,
        recompileIntervalMs: 100,
        autoStop: true,
      })
    );
    const streamBody = (await streamRes.json()) as Record<string, unknown>;
    expect(streamBody.streaming).toBe(true);
    expect(streamBody.lastFrameHash).toMatch(/^sha256:[0-9a-f]{64}$/);

    const sessionsRes = await connectGet();
    const sessionsBody = (await sessionsRes.json()) as {
      count: number;
      sessions: Array<Record<string, unknown>>;
    };
    expect(sessionsBody.count).toBe(1);
    expect(sessionsBody.sessions[0]?.streaming).toBe(true);
    expect(sessionsBody.sessions[0]?.quiltHash).toMatch(/^sha256:[0-9a-f]{64}$/);

    const stopRes = await streamDelete(request('/api/holotwin/stream', { sessionId }));
    const stopBody = (await stopRes.json()) as Record<string, unknown>;
    expect(stopBody.streaming).toBe(false);

    const disconnectRes = await disconnectPost(request('/api/holotwin/disconnect', { sessionId }));
    const disconnectBody = (await disconnectRes.json()) as Record<string, unknown>;
    expect(disconnectBody.ok).toBe(true);
  });
});
