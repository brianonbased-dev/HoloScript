/**
 * PagedKVCache - page-based key/value cache for streaming attention.
 *
 * Mirrors the FlashInfer paged-KV approach used by lingbot-map, but targets
 * WebGPU buffers instead of CUDA. Fixed-size pages keep allocation predictable.
 *
 * The cache owns deterministic CPU mirrors and uses the stateless WebGPU
 * append/lookup kernels when a device is provided. Headless CI gets the same
 * semantics through the CPU path.
 *
 * @version 0.1.0
 */

import {
  createPagedKVAppendKernel,
  createPagedKVLookupKernel,
  type PagedKVAppendKernel,
  type PagedKVLookupKernel,
} from './pagedKVKernels';

// =============================================================================
// TYPES
// =============================================================================

export interface KVCacheConfig {
  /** Tokens per page (must align with attention block size) */
  pageSize: number;
  /** Max pages resident on GPU - oldest pages evict to CPU when exceeded */
  maxResidentPages: number;
  /** Hidden dim of the attention layer */
  hiddenDim: number;
  /** Number of attention heads */
  numHeads: number;
  /** Number of transformer layers */
  numLayers: number;
  /** Optional WebGPU device. Omit for deterministic CPU fallback. */
  device?: GPUDevice | null;
}

export interface PageRef {
  /** Page index in the global page table */
  pageId: number;
  /** Layer index this page belongs to */
  layer: number;
  /** Residency: on-device, on-host (CPU), or evicted */
  residency: 'device' | 'host' | 'evicted';
  /** First token index covered by this page */
  firstToken: number;
  /** Last token index covered by this page */
  lastToken: number;
}

export interface PagedKVCache {
  readonly config: KVCacheConfig;

  /** Reserve a new page for the given layer */
  allocatePage(layer: number, firstToken: number): PageRef;

  /** Look up all resident pages for a layer, in token order */
  residentPagesForLayer(layer: number): PageRef[];

  /** Evict oldest pages past the residency cap; return evicted refs */
  evictOldest(count: number): PageRef[];

  /** Total resident memory in bytes (device + host) */
  memoryUsage(): { device: number; host: number };

  /** Release all pages and free GPU buffers */
  dispose(): Promise<void>;

  /**
   * Append K/V vectors for a layer. `keyVectors` and `valueVectors` are flat
   * [numTokens * hiddenDim] arrays. When `firstToken` is omitted, the cache
   * appends after the last token written for that layer.
   */
  append(
    layer: number,
    keyVectors: Float32Array,
    valueVectors?: Float32Array,
    firstToken?: number
  ): Promise<PageRef[]>;

  /** Retrieve a contiguous K/V token range from the cache. */
  lookup(
    layer: number,
    startToken: number,
    tokenCount: number
  ): Promise<{ keys: Float32Array; values: Float32Array }>;
}

// =============================================================================
// FACTORY
// =============================================================================

interface PageState extends PageRef {
  logicalPage: number;
  physicalPage: number | null;
  lastAccess: number;
  hostKeys?: Float32Array;
  hostValues?: Float32Array;
}

interface LayerState {
  pages: Map<number, PageState>;
  nextToken: number;
}

const PAGE_TABLE_EMPTY = 0xffffffff;

export function createPagedKVCache(config: KVCacheConfig): PagedKVCache {
  validateConfig(config);

  const layers: LayerState[] = Array.from({ length: config.numLayers }, () => ({
    pages: new Map<number, PageState>(),
    nextToken: 0,
  }));
  const pageBytes = config.pageSize * config.hiddenDim * Float32Array.BYTES_PER_ELEMENT;
  const keyPages = new Float32Array(config.maxResidentPages * config.pageSize * config.hiddenDim);
  const valuePages = new Float32Array(config.maxResidentPages * config.pageSize * config.hiddenDim);
  const freePhysicalPages = Array.from({ length: config.maxResidentPages }, (_, i) => i).reverse();
  const appendKernel: PagedKVAppendKernel | null = config.device
    ? createPagedKVAppendKernel(config.device)
    : null;
  const lookupKernel: PagedKVLookupKernel | null = config.device
    ? createPagedKVLookupKernel(config.device)
    : null;
  const residentPageStates = new Set<PageState>();
  let disposed = false;
  let nextPageId = 0;
  let accessClock = 0;
  let devicePageCount = 0;
  let hostPageCount = 0;

  function assertLive(): void {
    if (disposed) throw new Error('PagedKVCache has been disposed.');
  }

  function validateLayer(layer: number): void {
    if (!Number.isInteger(layer) || layer < 0 || layer >= config.numLayers) {
      throw new Error(`PagedKVCache layer ${layer} out of range 0..${config.numLayers - 1}`);
    }
  }

  function pageSnapshot(page: PageState): PageRef {
    return {
      pageId: page.pageId,
      layer: page.layer,
      residency: page.residency,
      firstToken: page.firstToken,
      lastToken: page.lastToken,
    };
  }

  function pageOffset(physicalPage: number): number {
    return physicalPage * config.pageSize * config.hiddenDim;
  }

  function copyResidentPage(page: PageState, keys: Float32Array, values: Float32Array): void {
    if (page.physicalPage === null) return;
    const offset = pageOffset(page.physicalPage);
    const end = offset + config.pageSize * config.hiddenDim;
    keys.set(keyPages.subarray(offset, end));
    values.set(valuePages.subarray(offset, end));
  }

  function zeroPhysicalPage(physicalPage: number): void {
    const offset = pageOffset(physicalPage);
    const end = offset + config.pageSize * config.hiddenDim;
    keyPages.fill(0, offset, end);
    valuePages.fill(0, offset, end);
  }

  function residentPages(): PageState[] {
    return Array.from(residentPageStates);
  }

  function evictPage(page: PageState): PageRef {
    if (page.physicalPage === null) return pageSnapshot(page);

    const hostKeys = new Float32Array(config.pageSize * config.hiddenDim);
    const hostValues = new Float32Array(config.pageSize * config.hiddenDim);
    copyResidentPage(page, hostKeys, hostValues);
    zeroPhysicalPage(page.physicalPage);
    freePhysicalPages.push(page.physicalPage);
    page.physicalPage = null;
    page.hostKeys = hostKeys;
    page.hostValues = hostValues;
    page.residency = 'host';
    residentPageStates.delete(page);
    devicePageCount -= 1;
    hostPageCount += 1;
    return pageSnapshot(page);
  }

  function evictOldestInternal(count: number, protectedPage?: PageState): PageRef[] {
    if (count <= 0) return [];
    const victims = residentPages()
      .filter((page) => page !== protectedPage)
      .sort((a, b) => a.lastAccess - b.lastAccess)
      .slice(0, count);
    return victims.map((page) => evictPage(page));
  }

  function allocatePhysicalPage(protectedPage?: PageState): number {
    if (freePhysicalPages.length === 0) {
      evictOldestInternal(1, protectedPage);
    }
    const physicalPage = freePhysicalPages.pop();
    if (physicalPage === undefined) {
      throw new Error('PagedKVCache could not allocate a resident page.');
    }
    zeroPhysicalPage(physicalPage);
    return physicalPage;
  }

  function ensurePageResident(page: PageState): void {
    if (page.residency === 'device' && page.physicalPage !== null) {
      page.lastAccess = ++accessClock;
      return;
    }
    const physicalPage = allocatePhysicalPage(page);
    page.physicalPage = physicalPage;
    if (page.residency === 'host') hostPageCount -= 1;
    page.residency = 'device';
    residentPageStates.add(page);
    devicePageCount += 1;
    page.lastAccess = ++accessClock;
    if (page.hostKeys) {
      keyPages.set(page.hostKeys, pageOffset(physicalPage));
      page.hostKeys = undefined;
    }
    if (page.hostValues) {
      valuePages.set(page.hostValues, pageOffset(physicalPage));
      page.hostValues = undefined;
    }
  }

  function allocatePageInternal(layer: number, logicalPage: number): PageState {
    const layerState = layers[layer]!;
    const existing = layerState.pages.get(logicalPage);
    if (existing) {
      ensurePageResident(existing);
      return existing;
    }

    const physicalPage = allocatePhysicalPage();
    const page: PageState = {
      pageId: nextPageId++,
      logicalPage,
      layer,
      residency: 'device',
      firstToken: logicalPage * config.pageSize,
      lastToken: logicalPage * config.pageSize + config.pageSize - 1,
      physicalPage,
      lastAccess: ++accessClock,
    };
    layerState.pages.set(logicalPage, page);
    residentPageStates.add(page);
    devicePageCount += 1;
    return page;
  }

  function buildPageTable(layer: number, logicalPages: Iterable<number>): Uint32Array {
    const requiredPages = Array.from(new Set(logicalPages)).sort((a, b) => a - b);
    const maxLogicalPage = requiredPages[requiredPages.length - 1] ?? 0;
    const pageTable = new Uint32Array(maxLogicalPage + 1);
    pageTable.fill(PAGE_TABLE_EMPTY);
    const layerState = layers[layer]!;
    for (const logicalPage of requiredPages) {
      const page = layerState.pages.get(logicalPage);
      if (page) {
        ensurePageResident(page);
        pageTable[logicalPage] = page.physicalPage ?? PAGE_TABLE_EMPTY;
      }
    }
    return pageTable;
  }

  function appendCpuInPlace(
    pages: Float32Array,
    touchedPages: ReadonlyMap<number, PageState>,
    vectors: Float32Array,
    startToken: number
  ): void {
    const numVecs = vectors.length / config.hiddenDim;
    for (let v = 0; v < numVecs; v += 1) {
      const token = startToken + v;
      const logicalPage = Math.floor(token / config.pageSize);
      const inPage = token % config.pageSize;
      const physicalPage = touchedPages.get(logicalPage)?.physicalPage;
      if (physicalPage === undefined || physicalPage === null) {
        throw new Error(`PagedKVCache append misses resident logical page ${logicalPage}.`);
      }
      const base = physicalPage * config.pageSize * config.hiddenDim;
      for (let d = 0; d < config.hiddenDim; d += 1) {
        pages[base + inPage * config.hiddenDim + d] = vectors[v * config.hiddenDim + d]!;
      }
    }
  }

  function lookupCpuDirect(
    pages: Float32Array,
    layerState: LayerState,
    tokenCount: number,
    startToken: number
  ): Float32Array {
    const out = new Float32Array(tokenCount * config.hiddenDim);
    for (let v = 0; v < tokenCount; v += 1) {
      const logicalSlot = startToken + v;
      const logicalPage = Math.floor(logicalSlot / config.pageSize);
      const inPage = logicalSlot % config.pageSize;
      const physicalPage = layerState.pages.get(logicalPage)?.physicalPage;
      if (physicalPage === undefined || physicalPage === null) {
        throw new Error(`PagedKVCache lookup misses resident logical page ${logicalPage}.`);
      }
      const base = physicalPage * config.pageSize * config.hiddenDim;
      for (let d = 0; d < config.hiddenDim; d += 1) {
        out[v * config.hiddenDim + d] = pages[base + inPage * config.hiddenDim + d]!;
      }
    }
    return out;
  }

  return {
    config,

    allocatePage(layer: number, firstToken: number): PageRef {
      assertLive();
      validateLayer(layer);
      if (!Number.isInteger(firstToken) || firstToken < 0) {
        throw new Error(`PagedKVCache firstToken must be a non-negative integer, got ${firstToken}`);
      }
      const logicalPage = Math.floor(firstToken / config.pageSize);
      return pageSnapshot(allocatePageInternal(layer, logicalPage));
    },

    residentPagesForLayer(layer: number): PageRef[] {
      assertLive();
      validateLayer(layer);
      return Array.from(residentPageStates)
        .filter((page) => page.layer === layer)
        .sort((a, b) => a.firstToken - b.firstToken)
        .map((page) => pageSnapshot(page));
    },

    evictOldest(count: number): PageRef[] {
      assertLive();
      if (!Number.isInteger(count) || count < 0) {
        throw new Error(`PagedKVCache evict count must be a non-negative integer, got ${count}`);
      }
      return evictOldestInternal(count);
    },

    memoryUsage(): { device: number; host: number } {
      assertLive();
      return {
        device: devicePageCount * pageBytes * 2,
        host: hostPageCount * pageBytes * 2,
      };
    },

    async dispose(): Promise<void> {
      disposed = true;
      for (const layer of layers) layer.pages.clear();
      residentPageStates.clear();
      freePhysicalPages.length = 0;
      devicePageCount = 0;
      hostPageCount = 0;
    },

    async append(
      layer: number,
      keyVectors: Float32Array,
      valueVectors: Float32Array = keyVectors,
      firstToken?: number
    ): Promise<PageRef[]> {
      assertLive();
      validateLayer(layer);
      if (keyVectors.length !== valueVectors.length) {
        throw new Error('PagedKVCache append requires key/value vectors with equal length.');
      }
      if (keyVectors.length % config.hiddenDim !== 0) {
        throw new Error(
          `PagedKVCache append vector length ${keyVectors.length} is not divisible by hiddenDim=${config.hiddenDim}`
        );
      }
      const tokenCount = keyVectors.length / config.hiddenDim;
      if (tokenCount === 0) return [];
      const startToken = firstToken ?? layers[layer]!.nextToken;
      if (!Number.isInteger(startToken) || startToken < 0) {
        throw new Error(`PagedKVCache append firstToken must be non-negative, got ${startToken}`);
      }

      const touchedPages = new Map<number, PageState>();
      const requiredPages = new Set<number>();
      for (let i = 0; i < tokenCount; i += 1) {
        const token = startToken + i;
        const logicalPage = Math.floor(token / config.pageSize);
        requiredPages.add(logicalPage);
      }
      if (requiredPages.size > config.maxResidentPages) {
        throw new Error(
          `PagedKVCache append touches ${requiredPages.size} pages but only ${config.maxResidentPages} can be resident.`
        );
      }
      for (const logicalPage of requiredPages) {
        const page = allocatePageInternal(layer, logicalPage);
        touchedPages.set(logicalPage, page);
      }

      if (appendKernel) {
        const slotMap = new Uint32Array(tokenCount);
        for (let i = 0; i < tokenCount; i += 1) {
          const token = startToken + i;
          const logicalPage = Math.floor(token / config.pageSize);
          const slot = token % config.pageSize;
          slotMap[i] = (logicalPage << 16) | slot;
        }
        const pageTable = buildPageTable(layer, touchedPages.keys());
        keyPages.set(
          await appendKernel.run(
            keyPages,
            pageTable,
            slotMap,
            keyVectors,
            config.pageSize,
            config.hiddenDim
          )
        );
        valuePages.set(
          await appendKernel.run(
            valuePages,
            pageTable,
            slotMap,
            valueVectors,
            config.pageSize,
            config.hiddenDim
          )
        );
      } else {
        appendCpuInPlace(keyPages, touchedPages, keyVectors, startToken);
        appendCpuInPlace(valuePages, touchedPages, valueVectors, startToken);
      }

      for (const page of touchedPages.values()) page.lastAccess = ++accessClock;
      layers[layer]!.nextToken = Math.max(layers[layer]!.nextToken, startToken + tokenCount);
      return Array.from(touchedPages.values())
        .sort((a, b) => a.firstToken - b.firstToken)
        .map((page) => pageSnapshot(page));
    },

    async lookup(
      layer: number,
      startToken: number,
      tokenCount: number
    ): Promise<{ keys: Float32Array; values: Float32Array }> {
      assertLive();
      validateLayer(layer);
      if (!Number.isInteger(startToken) || startToken < 0) {
        throw new Error(`PagedKVCache lookup startToken must be non-negative, got ${startToken}`);
      }
      if (!Number.isInteger(tokenCount) || tokenCount < 0) {
        throw new Error(`PagedKVCache lookup tokenCount must be non-negative, got ${tokenCount}`);
      }
      if (tokenCount === 0) {
        return { keys: new Float32Array(), values: new Float32Array() };
      }

      const endToken = startToken + tokenCount - 1;
      const firstLogicalPage = Math.floor(startToken / config.pageSize);
      const maxLogicalPage = Math.floor(endToken / config.pageSize);
      const requiredPages: number[] = [];
      for (let logicalPage = firstLogicalPage; logicalPage <= maxLogicalPage; logicalPage += 1) {
        const page = layers[layer]!.pages.get(logicalPage);
        if (!page) {
          throw new Error(`PagedKVCache lookup misses layer ${layer} logical page ${logicalPage}.`);
        }
        requiredPages.push(logicalPage);
      }
      if (requiredPages.length > config.maxResidentPages) {
        throw new Error(
          `PagedKVCache lookup needs ${requiredPages.length} pages but only ${config.maxResidentPages} can be resident.`
        );
      }
      for (const logicalPage of requiredPages) {
        ensurePageResident(layers[layer]!.pages.get(logicalPage)!);
      }

      if (lookupKernel) {
        const pageTable = buildPageTable(layer, requiredPages);
        return {
          keys: await lookupKernel.run(
            keyPages,
            pageTable,
            tokenCount,
            startToken,
            config.pageSize,
            config.hiddenDim
          ),
          values: await lookupKernel.run(
            valuePages,
            pageTable,
            tokenCount,
            startToken,
            config.pageSize,
            config.hiddenDim
          ),
        };
      }

      return {
        keys: lookupCpuDirect(keyPages, layers[layer]!, tokenCount, startToken),
        values: lookupCpuDirect(valuePages, layers[layer]!, tokenCount, startToken),
      };
    },
  };
}

function validateConfig(config: KVCacheConfig): void {
  const fields: Array<[keyof KVCacheConfig, number]> = [
    ['pageSize', config.pageSize],
    ['maxResidentPages', config.maxResidentPages],
    ['hiddenDim', config.hiddenDim],
    ['numHeads', config.numHeads],
    ['numLayers', config.numLayers],
  ];
  for (const [field, value] of fields) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`PagedKVCache config ${String(field)} must be a positive integer.`);
    }
  }
  if (config.pageSize > 0xffff) {
    throw new Error('PagedKVCache pageSize must fit the 16-bit slot packing used by WGSL kernels.');
  }
}
