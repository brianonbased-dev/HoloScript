/**
 * An embedding index stored as one file per code area, searched shard by shard
 * inside a fixed memory budget.
 *
 * Why (2026-10-05): the HoloScript HoloEmbed index was one 1.5 GB file read
 * whole into memory. On the shared laptop that tripped the 2 GB free-RAM floor;
 * the Jetson meant to serve every project has 7.6 GB total with ~1.8 GB free.
 * Sharding keeps every shard an ordinary EmbeddingIndex binary, so search
 * logic is reused unchanged, and lets a refresh rewrite only shards whose
 * content changed (unchanged shards are hard-linked from the previous
 * generation).
 *
 * Results equal the unsharded index: lexical scores are per-entry (no corpus
 * statistics), every file lives in exactly one shard, and the final pick is the
 * same "best per file first, then fill" rule applied to the union of each
 * shard's top-K.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { EmbeddingIndex, type EmbeddingIndexOptions, type SearchResult } from './EmbeddingIndex';

export const EMBEDDING_SHARD_MANIFEST = 'embedding-shards.json';
export const EMBEDDING_SHARD_SCHEMA = 'holoscript.embedding-shards.v1';

export interface EmbeddingShardEntry {
  key: string;
  file: string;
  count: number;
  bytes: number;
  sha256: string;
}

export interface EmbeddingShardManifest {
  schema: typeof EMBEDDING_SHARD_SCHEMA;
  provider: string;
  dimension: number;
  totalEntries: number;
  shards: EmbeddingShardEntry[];
}

type Filters = { language?: string; type?: string; file?: string };

/** packages/<x>, services/<x>, apps/<x> and similar get their own shard; other paths shard by first folder. */
export function shardKeyForPath(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').replace(/^\.\//, '').split('/').filter(Boolean);
  if (parts.length <= 1) return '.';
  const grouped = new Set(['packages', 'services', 'apps', 'tools', 'libs', 'crates', 'modules']);
  if (grouped.has(parts[0]) && parts.length > 2) return `${parts[0]}/${parts[1]}`;
  return parts[0];
}

function shardFileName(key: string): string {
  const slug = key.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 60) || 'root';
  const digest = crypto.createHash('sha256').update(key).digest('hex').slice(0, 10);
  return `${slug}-${digest}.bin`;
}

export function readEmbeddingShardManifest(directory: string): EmbeddingShardManifest | null {
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(directory, EMBEDDING_SHARD_MANIFEST), 'utf-8')
    ) as EmbeddingShardManifest;
    return manifest.schema === EMBEDDING_SHARD_SCHEMA ? manifest : null;
  } catch {
    return null;
  }
}

/**
 * Write `index` into `directory` as shards plus a manifest. A shard whose bytes
 * match the same key in `previous` is hard-linked instead of rewritten.
 * Returns the manifest and its sha256 (the identity a graph envelope binds).
 */
export function writeEmbeddingShards(
  index: EmbeddingIndex,
  directory: string,
  previous?: { directory: string; manifest: EmbeddingShardManifest } | null
): { manifest: EmbeddingShardManifest; sha256: string; rewritten: number; linked: number } {
  fs.mkdirSync(directory, { recursive: true });
  const previousByKey = new Map((previous?.manifest.shards ?? []).map((s) => [s.key, s]));
  const shards: EmbeddingShardEntry[] = [];
  let rewritten = 0;
  let linked = 0;
  const parts = [...index.partitionByFile(shardKeyForPath).entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  );
  for (const [key, part] of parts) {
    const buffer = part.serializeBinary();
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const file = shardFileName(key);
    const target = path.join(directory, file);
    const prior = previousByKey.get(key);
    let reused = false;
    if (prior && prior.sha256 === sha256 && previous) {
      try {
        fs.linkSync(path.join(previous.directory, prior.file), target);
        reused = true;
      } catch {
        reused = false;
      }
    }
    if (!reused) fs.writeFileSync(target, buffer);
    if (reused) linked += 1;
    else rewritten += 1;
    shards.push({ key, file, count: part.size, bytes: buffer.length, sha256 });
  }
  const manifest: EmbeddingShardManifest = {
    schema: EMBEDDING_SHARD_SCHEMA,
    provider: index.providerName,
    dimension: index.dimension,
    totalEntries: index.size,
    shards,
  };
  const json = JSON.stringify(manifest);
  fs.writeFileSync(path.join(directory, EMBEDDING_SHARD_MANIFEST), json);
  return {
    manifest,
    sha256: crypto.createHash('sha256').update(json).digest('hex'),
    rewritten,
    linked,
  };
}

export interface ShardedEmbeddingIndexOptions {
  /** Provider used to embed queries; must match the manifest's provider. */
  indexOptions: EmbeddingIndexOptions;
  /** Bytes of shard data kept loaded between queries (default 512 MiB). */
  memoryBudgetBytes?: number;
}

export class ShardedEmbeddingIndex {
  private readonly loaded = new Map<string, { index: EmbeddingIndex; bytes: number }>();
  private loadedBytes = 0;
  private readonly budget: number;

  constructor(
    private readonly directory: string,
    private readonly manifest: EmbeddingShardManifest,
    private readonly options: ShardedEmbeddingIndexOptions
  ) {
    this.budget = options.memoryBudgetBytes ?? 512 * 1024 * 1024;
    const providerName = options.indexOptions.provider?.name;
    if (providerName && providerName !== manifest.provider) {
      throw new Error(
        `ShardedEmbeddingIndex: shards were built by '${manifest.provider}' but the query provider is '${providerName}'`
      );
    }
  }

  get size(): number {
    return this.manifest.totalEntries;
  }

  get shardCount(): number {
    return this.manifest.shards.length;
  }

  /** Bytes of shard data currently held in memory. */
  get residentBytes(): number {
    return this.loadedBytes;
  }

  search(query: string, topK = 10): Promise<SearchResult[]> {
    return this.fanOut(topK, false, (shard) => shard.search(query, topK));
  }

  searchWithFilters(query: string, topK: number, filters?: Filters): Promise<SearchResult[]> {
    return this.fanOut(topK, false, (shard) => shard.searchWithFilters(query, topK, filters));
  }

  searchHybrid(query: string, topK = 10): Promise<SearchResult[]> {
    return this.searchHybridWithFilters(query, topK);
  }

  searchHybridWithFilters(query: string, topK: number, filters?: Filters): Promise<SearchResult[]> {
    return this.fanOut(topK, true, (shard) => shard.searchHybridWithFilters(query, topK, filters));
  }

  /**
   * Every shard as one in-memory EmbeddingIndex, for build-side work (refresh,
   * seeding). Serving never calls this; it is the full-memory path.
   */
  materialize(): EmbeddingIndex {
    const parts = this.manifest.shards.map((shard) =>
      EmbeddingIndex.deserializeBinary(fs.readFileSync(path.join(this.directory, shard.file)), {
        ...this.options.indexOptions,
        useWorkers: false,
      })
    );
    return EmbeddingIndex.merge(parts, this.options.indexOptions);
  }

  async dispose(): Promise<void> {
    this.loaded.clear();
    this.loadedBytes = 0;
  }

  private async fanOut(
    topK: number,
    hybrid: boolean,
    run: (shard: EmbeddingIndex) => Promise<SearchResult[]>
  ): Promise<SearchResult[]> {
    if (topK <= 0) return [];
    const candidates: SearchResult[] = [];
    for (const shard of this.manifest.shards) {
      candidates.push(...(await run(this.acquire(shard))));
      this.trim(shard.key);
    }
    candidates.sort((a, b) => {
      if (hybrid && Boolean(a.exactMatch) !== Boolean(b.exactMatch)) return a.exactMatch ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      return (b.vectorScore ?? 0) - (a.vectorScore ?? 0);
    });
    return pickDiverse(candidates, topK);
  }

  private acquire(shard: EmbeddingShardEntry): EmbeddingIndex {
    const hit = this.loaded.get(shard.key);
    if (hit) {
      // Refresh LRU position.
      this.loaded.delete(shard.key);
      this.loaded.set(shard.key, hit);
      return hit.index;
    }
    const buffer = fs.readFileSync(path.join(this.directory, shard.file));
    const index = EmbeddingIndex.deserializeBinary(buffer, {
      ...this.options.indexOptions,
      useWorkers: false,
    });
    this.loaded.set(shard.key, { index, bytes: buffer.length });
    this.loadedBytes += buffer.length;
    return index;
  }

  /** Evict least-recently-used shards (never the one just used) until under budget. */
  private trim(keepKey: string): void {
    for (const [key, value] of this.loaded) {
      if (this.loadedBytes <= this.budget) return;
      if (key === keepKey) continue;
      this.loaded.delete(key);
      this.loadedBytes -= value.bytes;
    }
    if (this.loadedBytes > this.budget) {
      const kept = this.loaded.get(keepKey);
      if (kept) {
        this.loaded.delete(keepKey);
        this.loadedBytes -= kept.bytes;
      }
    }
  }
}

function pickDiverse(scored: SearchResult[], topK: number): SearchResult[] {
  const selected: SearchResult[] = [];
  const chosen = new Set<SearchResult>();
  const seenFiles = new Set<string>();
  for (const item of scored) {
    const fileKey = item.file.replace(/\\/g, '/').toLowerCase();
    if (seenFiles.has(fileKey)) continue;
    selected.push(item);
    chosen.add(item);
    seenFiles.add(fileKey);
    if (selected.length >= topK) return selected;
  }
  for (const item of scored) {
    if (chosen.has(item)) continue;
    selected.push(item);
    if (selected.length >= topK) return selected;
  }
  return selected;
}
