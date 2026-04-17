/**
 * worldSimulationBridge.ts — Studio-side bridge for real-time generative world streaming.
 *
 * Responsibilities:
 *  - Discover nodes using @world_generator traits from AST-like structures.
 *  - Subscribe to world generation runtime events.
 *  - Normalize generation progress/results into a stream model consumable by Studio UI/runtime.
 */

export type GenerativeAssetKind = 'gaussian_splat' | 'mesh' | 'neural_stream';

export interface GenerativeAssetRef {
  kind: GenerativeAssetKind;
  url: string;
}

export interface WorldSimulationStream {
  nodeId: string;
  generationId?: string;
  status: 'idle' | 'generating' | 'ready' | 'error';
  progress: number;
  assets: GenerativeAssetRef[];
  error?: string;
  updatedAtMs: number;
}

export interface WorldGeneratorTraitInfo {
  nodeId: string;
  prompt?: string;
  engine?: string;
  format?: string;
  quality?: string;
}

export interface WorldSimulationBridgeEvent {
  type: 'stream:updated';
  stream: WorldSimulationStream;
}

export type WorldSimulationBridgeListener = (event: WorldSimulationBridgeEvent) => void;

export interface EventBusLike {
  on(event: string, listener: (data: unknown) => void): void;
  off?(event: string, listener: (data: unknown) => void): void;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function toNodeId(data: Record<string, unknown>): string | undefined {
  const direct = data.nodeId;
  if (typeof direct === 'string' && direct.length > 0) return direct;

  const node = toRecord(data.node);
  if (!node) return undefined;
  const id = node.id;
  if (typeof id === 'string' && id.length > 0) return id;

  const name = node.name;
  if (typeof name === 'string' && name.length > 0) return name;

  return undefined;
}

function extensionOf(url: string): string {
  const clean = url.split('?')[0].split('#')[0];
  const dot = clean.lastIndexOf('.');
  if (dot < 0) return '';
  return clean.slice(dot).toLowerCase();
}

function inferAssetKind(url: string): GenerativeAssetKind {
  const ext = extensionOf(url);
  if (ext === '.splat' || ext === '.spz' || ext === '.ply') return 'gaussian_splat';
  if (ext === '.stream' || ext === '.nf' || ext === '.nfield') return 'neural_stream';
  return 'mesh';
}

export function extractWorldGeneratorTraitNodes(astLike: unknown): WorldGeneratorTraitInfo[] {
  const results: WorldGeneratorTraitInfo[] = [];
  const seen = new Set<string>();

  const walk = (node: unknown) => {
    const rec = toRecord(node);
    if (!rec) return;

    const nodeIdCandidate =
      (typeof rec.id === 'string' && rec.id) ||
      (typeof rec.name === 'string' && rec.name) ||
      undefined;

    const traitsRaw = rec.traits;

    // Holo AST flavor: traits as array of {name, config|params}
    if (Array.isArray(traitsRaw)) {
      for (const tr of traitsRaw) {
        const trait = toRecord(tr);
        if (!trait || trait.name !== 'world_generator') continue;

        const cfg = toRecord(trait.config) ?? toRecord(trait.params) ?? {};
        if (nodeIdCandidate && !seen.has(nodeIdCandidate)) {
          seen.add(nodeIdCandidate);
          results.push({
            nodeId: nodeIdCandidate,
            prompt: typeof cfg.prompt === 'string' ? cfg.prompt : undefined,
            engine: typeof cfg.engine === 'string' ? cfg.engine : undefined,
            format: typeof cfg.format === 'string' ? cfg.format : undefined,
            quality: typeof cfg.quality === 'string' ? cfg.quality : undefined,
          });
        }
      }
    }

    // HS+ flavor: traits as Map-like object (serialized forms)
    if (traitsRaw instanceof Map && traitsRaw.has('world_generator')) {
      const cfg = toRecord(traitsRaw.get('world_generator')) ?? {};
      if (nodeIdCandidate && !seen.has(nodeIdCandidate)) {
        seen.add(nodeIdCandidate);
        results.push({
          nodeId: nodeIdCandidate,
          prompt: typeof cfg.prompt === 'string' ? cfg.prompt : undefined,
          engine: typeof cfg.engine === 'string' ? cfg.engine : undefined,
          format: typeof cfg.format === 'string' ? cfg.format : undefined,
          quality: typeof cfg.quality === 'string' ? cfg.quality : undefined,
        });
      }
    }

    for (const value of Object.values(rec)) {
      if (!value) continue;
      if (Array.isArray(value)) {
        value.forEach((item) => walk(item));
      } else if (typeof value === 'object') {
        walk(value);
      }
    }
  };

  walk(astLike);
  return results;
}

export class WorldSimulationBridge {
  private streams = new Map<string, WorldSimulationStream>();
  private listeners = new Set<WorldSimulationBridgeListener>();
  private detachFns: Array<() => void> = [];

  connect(eventBus: EventBusLike): () => void {
    const bind = (event: string, handler: (data: unknown) => void) => {
      eventBus.on(event, handler);
      this.detachFns.push(() => {
        eventBus.off?.(event, handler);
      });
    };

    bind('world:generation_started', (data) => this.onGenerationStarted(data));
    bind('world:generation_progress', (data) => this.onGenerationProgress(data));
    bind('world:generation_complete', (data) => this.onGenerationComplete(data));
    bind('world:generation_error', (data) => this.onGenerationError(data));
    bind('world:stream_ready', (data) => this.onStreamReady(data));

    return () => this.disconnect();
  }

  disconnect(): void {
    this.detachFns.forEach((f) => f());
    this.detachFns = [];
  }

  seedFromAst(astLike: unknown): WorldGeneratorTraitInfo[] {
    const traits = extractWorldGeneratorTraitNodes(astLike);
    const now = Date.now();
    for (const t of traits) {
      if (!this.streams.has(t.nodeId)) {
        this.streams.set(t.nodeId, {
          nodeId: t.nodeId,
          status: 'idle',
          progress: 0,
          assets: [],
          updatedAtMs: now,
        });
      }
    }
    return traits;
  }

  getStream(nodeId: string): WorldSimulationStream | undefined {
    const stream = this.streams.get(nodeId);
    return stream ? { ...stream, assets: [...stream.assets] } : undefined;
  }

  getStreams(): WorldSimulationStream[] {
    return [...this.streams.values()].map((s) => ({ ...s, assets: [...s.assets] }));
  }

  subscribe(listener: WorldSimulationBridgeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(stream: WorldSimulationStream): void {
    const ev: WorldSimulationBridgeEvent = { type: 'stream:updated', stream };
    this.listeners.forEach((l) => l(ev));
  }

  private upsert(nodeId: string, patch: Partial<WorldSimulationStream>): void {
    const now = Date.now();
    const prev = this.streams.get(nodeId) ?? {
      nodeId,
      status: 'idle' as const,
      progress: 0,
      assets: [],
      updatedAtMs: now,
    };

    const next: WorldSimulationStream = {
      ...prev,
      ...patch,
      updatedAtMs: now,
    };

    this.streams.set(nodeId, next);
    this.emit({ ...next, assets: [...next.assets] });
  }

  private onGenerationStarted(data: unknown): void {
    const rec = toRecord(data);
    if (!rec) return;
    const nodeId = toNodeId(rec);
    if (!nodeId) return;

    this.upsert(nodeId, {
      generationId: typeof rec.generationId === 'string' ? rec.generationId : undefined,
      status: 'generating',
      progress: 0,
      error: undefined,
      assets: [],
    });
  }

  private onGenerationProgress(data: unknown): void {
    const rec = toRecord(data);
    if (!rec) return;
    const nodeId = toNodeId(rec);
    if (!nodeId) return;

    const rawProgress = typeof rec.progress === 'number' ? rec.progress : 0;
    const progress = Math.max(0, Math.min(1, rawProgress));
    this.upsert(nodeId, {
      status: 'generating',
      progress,
    });
  }

  private onGenerationComplete(data: unknown): void {
    const rec = toRecord(data);
    if (!rec) return;
    const nodeId = toNodeId(rec);
    if (!nodeId) return;

    const assets: GenerativeAssetRef[] = [];
    const assetUrl = typeof rec.assetUrl === 'string' ? rec.assetUrl : undefined;
    const pointCloudUrl = typeof rec.pointCloudUrl === 'string' ? rec.pointCloudUrl : undefined;

    if (assetUrl) {
      assets.push({ kind: inferAssetKind(assetUrl), url: assetUrl });
    }
    if (pointCloudUrl) {
      assets.push({ kind: 'gaussian_splat', url: pointCloudUrl });
    }

    this.upsert(nodeId, {
      generationId: typeof rec.generationId === 'string' ? rec.generationId : undefined,
      status: 'ready',
      progress: 1,
      assets,
      error: undefined,
    });
  }

  private onStreamReady(data: unknown): void {
    const rec = toRecord(data);
    if (!rec) return;
    const nodeId = toNodeId(rec);
    if (!nodeId) return;

    const streamUrl = typeof rec.streamUrl === 'string' ? rec.streamUrl : undefined;
    if (!streamUrl) return;

    this.upsert(nodeId, {
      status: 'ready',
      progress: 1,
      assets: [{ kind: 'neural_stream', url: streamUrl }],
      error: undefined,
    });
  }

  private onGenerationError(data: unknown): void {
    const rec = toRecord(data);
    if (!rec) return;
    const nodeId = toNodeId(rec);
    if (!nodeId) return;

    this.upsert(nodeId, {
      status: 'error',
      error: typeof rec.error === 'string' ? rec.error : 'World generation failed',
    });
  }
}

export default WorldSimulationBridge;
