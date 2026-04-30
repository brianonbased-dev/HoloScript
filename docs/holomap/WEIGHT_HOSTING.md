# HoloMap Weight Hosting — Operator Guide

> **Scope:** How to host, distribute, and cache HoloMap model weights for production, offline, and XR deployments.  
> **Audience:** DevOps, release engineers, and HoloLand platform operators.  
> **Contract:** RFC §5.1 runtime weight-acquisition strategy.

## 1. Weight Format

HoloMap weights are **content-addressed binary blobs** (raw tensors or a container format such as Safetensors).  
The runtime identifies a weight blob by its **`weightCid`**: a SHA-256 digest in lowercase hex64, optionally prefixed with `sha256:`.

| Field | Example | Purpose |
|-------|---------|---------|
| `weightCid` | `sha256:abc123…` (64 hex chars) | Replay-fingerprint key + integrity check |
| `weightUrl` | `https://cdn.example.com/weights/abc123.bin` | Primary fetch URL |
| `weightUrls` | `["https://fallback…", "https://mirror…"]` | Retry fallback chain |

**Never embed weights inside `.holo` compositions.** The CID keeps compositions small and preserves provenance.

## 2. Hosting Modes

### 2.1 Production CDN (default)

Studio, MCP, and desktop runtimes fetch weights once, verify the CID, and cache locally.

**CDN requirements:**
- HTTPS with CORS headers (`Access-Control-Allow-Origin: *` or same-origin)
- `Content-Type: application/octet-stream` recommended
- Supports range requests (optional, for resume)

**Upload checklist:**
1. Compute SHA-256 of the blob: `sha256sum holomap-v1.bin`
2. Upload to CDN path that includes the digest: `/weights/{digest}.bin`
3. Register the URL in the model manifest (see §4)
4. Verify end-to-end: run `holoMapWeightLoader` against the URL with `weightCid`

### 2.2 Bundled / Offline (CI, air-gapped demos)

For environments without internet access, ship weights as versioned assets and reference them with `file://` URLs.

```ts
await loadHoloMapWeightBlob({
  weightUrl: 'file:///opt/holoscript/weights/holomap-v1.bin',
  weightCid: 'abc123…',
});
```

**Storage locations:**
- Browser tests: `packages/core/src/reconstruction/__fixtures__/weights/`
- Node / headless: any path readable by the process
- Docker images: bake weights into the image at a known path

### 2.3 HoloLand / XR — Mesh-Local Pointer (pointer-only)

Quest, phone-as-bridge, and other XR consumers ship **no weights in the APK**.  
The session manifest lists `weightCid` + a **mesh-local cache handle** that the platform resolves at runtime.

```ts
await loadHoloMapWeightBlob({
  weightUrl: 'https://cdn.example.com/weights/abc123.bin', // fallback only
  weightCid: 'abc123…',
  localResolver: async (cid) => {
    // Platform-specific: resolve from APK expansion, OBB, or shared mesh cache
    const handle = await HoloLandMeshCache.resolve(cid);
    return handle ? handle.arrayBuffer() : undefined;
  },
});
```

**Platform resolver contract:**
- Receives the normalized `weightCid` (lowercase hex64, no prefix)
- Returns `ArrayBuffer` if the handle resolves, or `undefined` to fall through
- The loader verifies the CID after resolution and writes to the local cache

## 3. Caching Behavior

```
loadHoloMapWeightBlob()
├── 1. localResolver?  → verified → return (file)
├── 2. IndexedDB/Node cache hit? → return (cache)
├── 3. Network fetch (weightUrl → weightUrls fallbacks)
│   ├── retry 3× with back-off (250ms, 500ms)
│   └── verify CID, write to cache, return (network)
└── 4. Exhausted → throw
```

**Cache directories:**
- Browser: IndexedDB store `HoloMapWeightCache` / object store `weights`
- Node: `$HOLOMAP_WEIGHT_CACHE_DIR` or `~/.cache/holoscript/holomap-weights/`
- Files named `{cid}.bin`

**Eviction:** None automatic. Operators should prune old CIDs manually or set `HOLOMAP_WEIGHT_CACHE_DIR` to a tmpfs with size limits.

## 4. Model Manifest Registration

When releasing a new weight checkpoint, register it in the model manifest so consumers know the canonical CID + URLs.

```json
{
  "modelHash": "holomap-v1.0-generalist",
  "weightCid": "sha256:deadbeef…",
  "weightUrl": "https://cdn.holoscript.net/weights/deadbeef…/holomap-v1.bin",
  "weightUrls": [
    "https://mirror1.holoscript.net/weights/deadbeef…/holomap-v1.bin"
  ],
  "verticalProfile": "generalist",
  "sizeBytes": 2147483648,
  "releasedAt": "2026-04-29T00:00:00Z"
}
```

**Validation command:**
```bash
node scripts/verify-weight-manifest.mjs --manifest path/to/manifest.json
```

## 5. Security & Integrity

- **CID verification is fail-closed.** Mismatch throws before inference starts.
- **Skip cache:** Set `skipCache: true` to force re-download (useful for corruption recovery).
- **No secrets in weight URLs.** URLs are public; if a model is private, gate access at the CDN edge, not in the URL.

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `digest mismatch` | Corrupted download or wrong CID in manifest | Re-compute SHA-256, update manifest |
| `all sources exhausted` | CDN down + no cache + no local resolver | Check network, verify `weightUrls` |
| IndexedDB quota error | Browser storage full | Clear old weights or increase quota |
| `fetch is not available` | Node without fetch polyfill | Provide `fetchImpl` or use `file://` |

## 7. Related Docs

- `RFC-HoloMap.md` §5.1 — weight-acquisition strategy
- `docs/holomap/SCOPE_GUARDRAIL.md` — scope creep rejection criteria
- `docs/holomap/VERTICAL_WEIGHT_VARIANTS.md` — specialist weight profiles (v1.1+)
