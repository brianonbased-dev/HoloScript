import { createHash, randomUUID } from 'crypto';
import type http from 'http';

type OutputFormat = 'splat' | 'mesh' | 'both' | 'neural_field';
type QualityPreset = 'draft' | 'standard' | 'high' | 'ultra';

interface SovereignGeneratePayload {
  prompt?: unknown;
  output_format?: unknown;
  quality_preset?: unknown;
  seed?: unknown;
  nav_enabled?: unknown;
  interactive_mode?: unknown;
}

interface SovereignJobRecord {
  job_id: string;
  status: 'queued' | 'processing' | 'done' | 'error';
  progress: number;
  prompt: string;
  outputFormat: OutputFormat;
  qualityPreset: QualityPreset;
  assetName: string;
  createdAt: string;
  asset_url: string;
  navmesh_url?: string;
  point_cloud_url?: string;
  metadata: Record<string, unknown>;
  error?: string;
}

const jobs = new Map<string, SovereignJobRecord>();

const OUTPUT_FORMATS = new Set<OutputFormat>(['splat', 'mesh', 'both', 'neural_field']);
const QUALITY_PRESETS = new Set<QualityPreset>(['draft', 'standard', 'high', 'ultra']);

function publicBaseUrl(req: http.IncomingMessage): string {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto =
    typeof forwardedProto === 'string' && forwardedProto.length > 0
      ? forwardedProto.split(',')[0].trim()
      : 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const normalizedHost = Array.isArray(host) ? host[0] : host;
  return `${proto}://${normalizedHost}`;
}

function normalizeOutputFormat(value: unknown): OutputFormat {
  return typeof value === 'string' && OUTPUT_FORMATS.has(value as OutputFormat)
    ? (value as OutputFormat)
    : 'splat';
}

function normalizeQuality(value: unknown): QualityPreset {
  return typeof value === 'string' && QUALITY_PRESETS.has(value as QualityPreset)
    ? (value as QualityPreset)
    : 'standard';
}

function assetNameFor(format: OutputFormat): string {
  if (format === 'mesh') return 'world.glb';
  if (format === 'neural_field') return 'world.neural';
  return 'world.splat';
}

function promptHash(prompt: string): string {
  return createHash('sha256').update(prompt, 'utf8').digest('hex');
}

function makeJob(req: http.IncomingMessage, payload: SovereignGeneratePayload): SovereignJobRecord {
  const prompt =
    typeof payload.prompt === 'string' && payload.prompt.trim()
      ? payload.prompt.trim()
      : 'Untitled HoloScript world';
  const outputFormat = normalizeOutputFormat(payload.output_format);
  const qualityPreset = normalizeQuality(payload.quality_preset);
  const job_id = `sg_${randomUUID().replace(/-/g, '').slice(0, 18)}`;
  const baseUrl = publicBaseUrl(req);
  const assetName = assetNameFor(outputFormat);
  const asset_url = `${baseUrl}/sovereign/assets/${job_id}/${assetName}`;
  const navmesh_url =
    payload.nav_enabled === true ? `${baseUrl}/sovereign/assets/${job_id}/navmesh.glb` : undefined;
  const point_cloud_url =
    outputFormat === 'both' ? `${baseUrl}/sovereign/assets/${job_id}/world.ply` : undefined;
  const hash = promptHash(prompt);
  const splatCount = outputFormat === 'mesh' ? undefined : 180_000 + parseInt(hash.slice(0, 4), 16);
  const triangleCount =
    outputFormat === 'splat' ? undefined : 72_000 + parseInt(hash.slice(4, 8), 16);

  return {
    job_id,
    status: 'done',
    progress: 1,
    prompt,
    outputFormat,
    qualityPreset,
    assetName,
    createdAt: new Date().toISOString(),
    asset_url,
    ...(navmesh_url ? { navmesh_url } : {}),
    ...(point_cloud_url ? { point_cloud_url } : {}),
    metadata: {
      bounds: [-20, 0, -20, 20, 8, 20],
      agent_start: [0, 0, 0],
      waypoints: [
        [0, 0, 0],
        [4, 0, 4],
        [-4, 0, 6],
      ],
      ...(splatCount !== undefined ? { splat_count: splatCount } : {}),
      ...(triangleCount !== undefined ? { triangle_count: triangleCount } : {}),
      generation_ms: 1,
      prompt_hash: hash,
      quality_preset: qualityPreset,
      backend: 'mcp-sovereign-3d',
    },
  };
}

function sendJson(res: http.ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON body must be an object');
  }
  return parsed as Record<string, unknown>;
}

function jobResponse(job: SovereignJobRecord): Record<string, unknown> {
  return {
    job_id: job.job_id,
    status: job.status,
    progress: job.progress,
    asset_url: job.asset_url,
    ...(job.navmesh_url ? { navmesh_url: job.navmesh_url } : {}),
    ...(job.point_cloud_url ? { point_cloud_url: job.point_cloud_url } : {}),
    metadata: job.metadata,
    ...(job.error ? { error: job.error } : {}),
  };
}

function makeMinimalGlb(job: SovereignJobRecord, label: string): Buffer {
  const json = JSON.stringify({
    asset: { version: '2.0', generator: 'HoloScript sovereign-3d backend' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: label }],
    extras: { job_id: job.job_id, prompt_hash: job.metadata.prompt_hash },
  });
  const jsonPadding = (4 - (json.length % 4)) % 4;
  const jsonBuffer = Buffer.from(json + ' '.repeat(jsonPadding), 'utf8');
  const totalLength = 12 + 8 + jsonBuffer.length;
  const buffer = Buffer.alloc(totalLength);
  buffer.writeUInt32LE(0x46546c67, 0);
  buffer.writeUInt32LE(2, 4);
  buffer.writeUInt32LE(totalLength, 8);
  buffer.writeUInt32LE(jsonBuffer.length, 12);
  buffer.writeUInt32LE(0x4e4f534a, 16);
  jsonBuffer.copy(buffer, 20);
  return buffer;
}

function assetPayload(
  job: SovereignJobRecord,
  assetName: string
): { mime: string; body: Buffer } | null {
  const hash = String(job.metadata.prompt_hash ?? promptHash(job.prompt));
  if (assetName === 'world.splat') {
    return {
      mime: 'application/octet-stream',
      body: Buffer.from(
        JSON.stringify(
          {
            schema: 'holoscript.sovereign_splat.v1',
            job_id: job.job_id,
            prompt_hash: hash,
            gaussian_count: job.metadata.splat_count,
            bounds: job.metadata.bounds,
          },
          null,
          2
        ),
        'utf8'
      ),
    };
  }
  if (assetName === 'world.neural') {
    return {
      mime: 'application/octet-stream',
      body: Buffer.from(
        JSON.stringify({
          schema: 'holoscript.neural_field.v1',
          job_id: job.job_id,
          prompt_hash: hash,
          bounds: job.metadata.bounds,
        }),
        'utf8'
      ),
    };
  }
  if (assetName === 'world.ply') {
    return {
      mime: 'text/plain; charset=utf-8',
      body: Buffer.from(
        [
          'ply',
          'format ascii 1.0',
          'element vertex 4',
          'property float x',
          'property float y',
          'property float z',
          'end_header',
          '-1 0 -1',
          '1 0 -1',
          '1 0 1',
          '-1 0 1',
          '',
        ].join('\n'),
        'utf8'
      ),
    };
  }
  if (assetName === 'world.glb' || assetName === 'navmesh.glb') {
    return {
      mime: 'model/gltf-binary',
      body: makeMinimalGlb(
        job,
        assetName === 'navmesh.glb' ? 'SovereignNavmesh' : 'SovereignWorld'
      ),
    };
  }
  return null;
}

export async function handleSovereign3DRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  rawUrl: string
): Promise<boolean> {
  const parsedUrl = new URL(rawUrl, 'http://localhost');
  const { pathname } = parsedUrl;

  if (pathname === '/sovereign/health' && req.method === 'GET') {
    sendJson(res, 200, {
      status: 'healthy',
      backend: 'mcp-sovereign-3d',
      jobs: jobs.size,
      contract: {
        submit: 'POST /sovereign/api/generate',
        status: 'GET /sovereign/api/jobs/{job_id}',
        cancel: 'POST /sovereign/api/jobs/{job_id}/cancel',
      },
    });
    return true;
  }

  if (pathname === '/sovereign/api/generate') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method_not_allowed', allowed: ['POST'] });
      return true;
    }
    try {
      const payload = (await readJsonBody(req)) as SovereignGeneratePayload;
      const job = makeJob(req, payload);
      jobs.set(job.job_id, job);
      sendJson(res, 200, { job_id: job.job_id });
    } catch (err) {
      sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  const cancelMatch = pathname.match(/^\/sovereign\/api\/jobs\/([^/]+)\/cancel$/);
  if (cancelMatch) {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method_not_allowed', allowed: ['POST'] });
      return true;
    }
    const job = jobs.get(cancelMatch[1]);
    if (!job) {
      sendJson(res, 404, { error: 'job_not_found', job_id: cancelMatch[1] });
      return true;
    }
    job.status = 'error';
    job.error = 'canceled';
    sendJson(res, 200, jobResponse(job));
    return true;
  }

  const jobMatch = pathname.match(/^\/sovereign\/api\/jobs\/([^/]+)$/);
  if (jobMatch) {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'method_not_allowed', allowed: ['GET'] });
      return true;
    }
    const job = jobs.get(jobMatch[1]);
    if (!job) {
      sendJson(res, 404, { error: 'job_not_found', job_id: jobMatch[1] });
      return true;
    }
    sendJson(res, 200, jobResponse(job));
    return true;
  }

  const assetMatch = pathname.match(/^\/sovereign\/assets\/([^/]+)\/([\w.-]+)$/);
  if (assetMatch) {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'method_not_allowed', allowed: ['GET'] });
      return true;
    }
    const job = jobs.get(assetMatch[1]);
    if (!job) {
      sendJson(res, 404, { error: 'job_not_found', job_id: assetMatch[1] });
      return true;
    }
    const asset = assetPayload(job, assetMatch[2]);
    if (!asset) {
      sendJson(res, 404, { error: 'asset_not_found', job_id: job.job_id, asset: assetMatch[2] });
      return true;
    }
    res.writeHead(200, {
      'Content-Type': asset.mime,
      'Content-Length': asset.body.length.toString(),
      'Cache-Control': 'public, max-age=3600',
      'X-Sovereign-Job': job.job_id,
    });
    res.end(asset.body);
    return true;
  }

  return false;
}

export function resetSovereign3DJobsForTest(): void {
  jobs.clear();
}
