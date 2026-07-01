import { describe, expect, it } from 'vitest';

import { GET, POST } from './route';

type DescribeItRouteBody = {
  success?: boolean;
  error?: string;
  examples?: Array<{ id: string; prompt: string }>;
  plan?: {
    planText: string;
    planHash: string;
    generatedFilePath: string;
    previewPath: string;
  };
  generated?: {
    path: string;
    kind: '.holo';
    contents: string;
    hash: string;
  };
  receipt?: {
    promptHash: string;
    planHash: string;
    generatedFiles: Array<{ path: string; hash: string }>;
    target: string;
    previewPath: string;
    smokeResult: { status: string; errors: string[] };
    custody: {
      holokey: string;
      umbrellaRoute: string[];
      triadReceipt: { generatedArtifact: string };
    };
  };
  smokeResult?: { status: string; errors: string[] };
};

describe('/api/studio/describe-it', () => {
  it('returns the five first-run examples', async () => {
    const response = GET();
    const body = (await response.json()) as DescribeItRouteBody;

    expect(response.status).toBe(200);
    expect(body.examples?.map((example) => example.id)).toEqual([
      'spatial-app',
      'iot-device',
      'digital-twin',
      'agent-team',
      'robotics-scene',
    ]);
  });

  it('builds a reviewable plan before generation', async () => {
    const response = await POST(
      makeRequest({
        mode: 'plan',
        prompt: 'A digital twin for a warehouse.',
        target: 'digital-twin',
      })
    );
    const body = (await response.json()) as DescribeItRouteBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.plan?.planText).toContain('- Generate native .holo source');
    expect(body.plan?.generatedFilePath).toMatch(/\.holo$/);
    expect(body.plan?.previewPath).toContain('/api/preview?sceneId=');
  });

  it('generates a .holo preview, smoke result, and complete receipt', async () => {
    const response = await POST(
      makeRequest({
        mode: 'generate',
        prompt: 'A robotics scene with ROS2 telemetry.',
        target: 'robotics-scene',
        planText: '- Generate native .holo source\n- Run parser smoke',
      })
    );
    const body = (await response.json()) as DescribeItRouteBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.generated?.kind).toBe('.holo');
    expect(body.generated?.path).toBe(body.plan?.generatedFilePath);
    expect(body.generated?.contents).toContain('composition "DescribeItPreview"');
    expect(body.smokeResult?.status).toBe('pass');
    expect(body.receipt?.promptHash).toBeTruthy();
    expect(body.receipt?.planHash).toBe(body.plan?.planHash);
    expect(body.receipt?.generatedFiles[0]?.hash).toBe(body.generated?.hash);
    expect(body.receipt?.target).toBe('WebXR/WebGPU preview');
    expect(body.receipt?.previewPath).toBe(body.plan?.previewPath);
    expect(body.receipt?.custody.holokey).toContain('holokey');
    expect(body.receipt?.custody.umbrellaRoute).toContain('smoke-test');
    expect(body.receipt?.custody.triadReceipt.generatedArtifact).toBe(body.generated?.hash);
  });

  it('returns fail smoke when preview availability fails', async () => {
    const response = await POST(
      makeRequest({
        mode: 'generate',
        prompt: 'A spatial app for field work.',
        previewAvailable: false,
      })
    );
    const body = (await response.json()) as DescribeItRouteBody;

    expect(response.status).toBe(200);
    expect(body.smokeResult?.status).toBe('fail');
    expect(body.smokeResult?.errors).toContain('preview path unavailable');
    expect(body.receipt?.smokeResult.status).toBe('fail');
  });

  it('rejects missing prompts', async () => {
    const response = await POST(makeRequest({ mode: 'plan', prompt: '' }));
    const body = (await response.json()) as DescribeItRouteBody;

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toContain('prompt');
  });
});

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/studio/describe-it', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
