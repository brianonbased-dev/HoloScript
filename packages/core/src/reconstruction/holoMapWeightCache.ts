/**
 * HoloMap weight cache — content-addressed local storage.
 *
 * Browser: IndexedDB (persistent across sessions).
 * Node.js: os.tmpdir() / os.homedir() file cache.
 *
 * Keys are normalized weightCid digests (lowercase hex64).
 * Values are ArrayBuffers (weight blobs).
 */

import { normalizeWeightCidDigest } from './holoMapWeightLoader';

const DB_NAME = 'HoloMapWeightCache';
const STORE_NAME = 'weights';
const DB_VERSION = 1;

// ---------------------------------------------------------------------------
// Browser: IndexedDB
// ---------------------------------------------------------------------------

async function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
  });
}

async function idbGet(db: IDBDatabase, key: string): Promise<ArrayBuffer | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => {
      const result = req.result;
      if (result instanceof ArrayBuffer) resolve(result);
      else if (result && typeof result.byteLength === 'number') resolve(result);
      else resolve(undefined);
    };
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(db: IDBDatabase, key: string, value: ArrayBuffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// Node: filesystem cache
// ---------------------------------------------------------------------------

interface NodeCacheDeps {
  readFile(path: string): Promise<Buffer>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  mkdir(path: string, opts: { recursive: boolean }): Promise<void>;
  stat(path: string): Promise<{ isFile(): boolean }>;
  tmpdir(): string;
  homedir(): string;
}

let nodeCacheDeps: NodeCacheDeps | null = null;

async function getNodeCacheDeps(): Promise<NodeCacheDeps | null> {
  if (nodeCacheDeps) return nodeCacheDeps;
  try {
    const fs = await import('node:fs/promises');
    const os = await import('node:os');
    const path = await import('node:path');
    nodeCacheDeps = {
      readFile: (p) => fs.readFile(p),
      writeFile: (p, d) => fs.writeFile(p, d),
      mkdir: (p, o) => fs.mkdir(p, o),
      stat: (p) => fs.stat(p),
      tmpdir: () => os.tmpdir(),
      homedir: () => os.homedir(),
    };
    return nodeCacheDeps;
  } catch {
    return null;
  }
}

async function nodeCachePath(deps: NodeCacheDeps, cid: string): Promise<string> {
  const path = await import('node:path');
  const base = process.env.HOLOMAP_WEIGHT_CACHE_DIR
    ?? path.join(deps.homedir(), '.cache', 'holoscript', 'holomap-weights');
  return path.join(base, `${cid}.bin`);
}

async function nodeCacheGet(deps: NodeCacheDeps, cid: string): Promise<ArrayBuffer | undefined> {
  const p = await nodeCachePath(deps, cid);
  try {
    const buf = await deps.readFile(p);
    if (buf.buffer) return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return undefined;
  } catch {
    return undefined;
  }
}

async function nodeCachePut(deps: NodeCacheDeps, cid: string, value: ArrayBuffer): Promise<void> {
  const p = await nodeCachePath(deps, cid);
  const path = await import('node:path');
  const dir = path.dirname(p);
  await deps.mkdir(dir, { recursive: true });
  await deps.writeFile(p, new Uint8Array(value));
}

// ---------------------------------------------------------------------------
// Unified cache API
// ---------------------------------------------------------------------------

function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

/**
 * Check if a weight blob is cached locally (no verification — caller must CID-check after load).
 */
export async function getCachedWeightBlob(weightCid: string): Promise<ArrayBuffer | undefined> {
  const cid = normalizeWeightCidDigest(weightCid);

  if (isIndexedDBAvailable()) {
    try {
      const db = await openIndexedDB();
      const cached = await idbGet(db, cid);
      db.close();
      return cached;
    } catch {
      // IndexedDB failure is not fatal — fall through to network
    }
  }

  const deps = await getNodeCacheDeps();
  if (deps) {
    return nodeCacheGet(deps, cid);
  }

  return undefined;
}

/**
 * Store a verified weight blob in the local cache.
 */
export async function putCachedWeightBlob(weightCid: string, value: ArrayBuffer): Promise<void> {
  const cid = normalizeWeightCidDigest(weightCid);

  if (isIndexedDBAvailable()) {
    try {
      const db = await openIndexedDB();
      await idbPut(db, cid, value);
      db.close();
      return;
    } catch {
      // IndexedDB write failure — fall through to Node cache if available
    }
  }

  const deps = await getNodeCacheDeps();
  if (deps) {
    await nodeCachePut(deps, cid, value);
  }
}
