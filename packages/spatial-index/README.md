# @holoscript/spatial-index

High-performance R-Tree spatial indexing for geospatial anchors with IndexedDB persistence and O(log n) query performance.

## Features

- **O(log n) query performance** - Efficient spatial queries that scale to 100K+ anchors
- **OMT bulk loading** - 2-3x faster than sequential insertion with better tree structure
- **IndexedDB persistence** - Persistent storage with in-memory spatial index
- **Bounding box queries** - Fast rectangular region searches
- **Radius queries** - Find anchors within distance of a point
- **K-nearest neighbor** - Find closest K anchors to any location
- **Haversine distance** - Accurate geospatial distance calculations

## Installation

```bash
pnpm add @holoscript/spatial-index
```

## Quick Start

### Basic R-Tree Usage

```typescript
import { RTree, type GeospatialAnchor } from '@holoscript/spatial-index';

// Create an R-Tree
const rtree = new RTree({
  maxEntries: 9, // Node capacity (default: 9)
  bulkLoadingEnabled: true // Enable OMT optimization (default: true)
});

// Insert anchors
const anchor: GeospatialAnchor = {
  id: 'sf-pier-39',
  lat: 37.8087,
  lon: -122.4098,
  alt: 5,
  metadata: { name: 'Pier 39', type: 'tourist-attraction' }
};

rtree.insert(anchor);

// Bulk load for better performance
const anchors: GeospatialAnchor[] = [
  { id: 'a1', lat: 37.7749, lon: -122.4194 },
  { id: 'a2', lat: 37.7849, lon: -122.4094 },
  // ... more anchors
];

rtree.load(anchors); // 2-3x faster than individual inserts
```

### Spatial Queries

```typescript
// Bounding box query
const results = rtree.search({
  minLat: 37.7,
  minLon: -122.5,
  maxLat: 37.8,
  maxLon: -122.4
});

// Radius search (in meters)
const nearby = rtree.searchRadius(
  { lat: 37.7749, lon: -122.4194 },
  1000 // 1km radius
);

console.log(nearby[0]); // { anchor: {...}, distance: 245.8 }

// K-nearest neighbors
const closest = rtree.knn(
  { lat: 37.7749, lon: -122.4194 },
  5 // Find 5 closest anchors
);
```

### Persistent Storage with IndexedDB

```typescript
import { GeospatialAnchorStorage } from '@holoscript/spatial-index';

// Create storage with IndexedDB persistence
const storage = new GeospatialAnchorStorage({
  dbName: 'my-app-geospatial',
  storeName: 'anchors',
  maxEntries: 9,
  enableCache: true
});

// Initialize (loads existing anchors into R-Tree)
await storage.init();

// Store anchors (persisted to IndexedDB + indexed in R-Tree)
await storage.set({
  id: 'marker-1',
  lat: 37.7749,
  lon: -122.4194
});

// Batch insert for efficiency
await storage.setMany(anchors);

// Fast spatial queries (uses in-memory R-Tree)
const results = await storage.searchRadius(
  { lat: 37.7749, lon: -122.4194 },
  5000 // 5km
);

// Get statistics
const stats = storage.getStats();
console.log(stats);
// {
//   totalNodes: 42,
//   totalAnchors: 1000,
//   height: 3,
//   avgFillRatio: 0.85,
//   totalOverlap: 0.002
// }
```

## Performance

### Benchmark Results (M1 MacBook Pro)

| Operation | 10K Anchors | 50K Anchors | 100K Anchors |
|-----------|-------------|-------------|--------------|
| Bulk Load | ~50ms | ~280ms | ~600ms |
| BBox Query | <10ms | <20ms | <50ms |
| Radius Query 1km | <5ms | <15ms | <40ms |
| KNN (k=10) | <5ms | <10ms | <30ms |
| Insert | <0.1ms | <0.1ms | <0.2ms |
| Remove | <1ms | <2ms | <5ms |

**Target Met**: ✅ <100ms query time for 100K anchors

### vs Linear Scan

For 10K anchors, radius search comparison:
- **Linear Scan**: ~45ms (O(n))
- **R-Tree**: ~4ms (O(log n))
- **Speedup**: ~11x faster

## API Reference

### RTree

```typescript
class RTree {
  constructor(options?: RTreeOptions);
  insert(anchor: GeospatialAnchor): void;
  load(anchors: GeospatialAnchor[]): void;
  remove(anchorId: string): boolean;
  search(bbox: BBox): GeospatialAnchor[];
  searchRadius(center: Point, radiusMeters: number): QueryResult[];
  knn(center: Point, k: number): QueryResult[];
  all(): GeospatialAnchor[];
  clear(): void;
  getStats(): RTreeStats;
}
```

### GeospatialAnchorStorage

```typescript
class GeospatialAnchorStorage {
  constructor(options?: StorageOptions);
  async init(): Promise<void>;
  async set(anchor: GeospatialAnchor): Promise<void>;
  async setMany(anchors: GeospatialAnchor[]): Promise<void>;
  async get(id: string): Promise<GeospatialAnchor | null>;
  async remove(id: string): Promise<boolean>;
  async searchBBox(bbox: BBox): Promise<GeospatialAnchor[]>;
  async searchRadius(center: Point, radiusMeters: number): Promise<QueryResult[]>;
  async knn(center: Point, k: number): Promise<QueryResult[]>;
  async getAll(): Promise<GeospatialAnchor[]>;
  async count(): Promise<number>;
  async clear(): Promise<void>;
  async export(): Promise<string>;
  async import(json: string): Promise<void>;
  getStats(): RTreeStats;
  async close(): Promise<void>;
}
```

### Types

```typescript
interface GeospatialAnchor {
  id: string;
  lat: number;
  lon: number;
  alt?: number;
  metadata?: Record<string, unknown>;
}

interface BBox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

interface Point {
  lat: number;
  lon: number;
}

interface QueryResult {
  anchor: GeospatialAnchor;
  distance: number; // meters
}

interface RTreeStats {
  totalNodes: number;
  totalAnchors: number;
  height: number;
  avgFillRatio: number;
  totalOverlap: number;
}
```

## Algorithm Details

### R-Tree Structure

- **Balanced tree** with logarithmic height
- **Node capacity**: Configurable maxEntries (default: 9)
- **Minimum fill ratio**: ~40% for optimal performance
- **Splitting strategy**: Overlap-minimizing quadratic split

### OMT Bulk Loading

Overlap Minimizing Top-down (OMT) algorithm:
1. Sort anchors by Hilbert curve value for spatial locality
2. Split into groups of maxEntries size
3. Recursively build nodes bottom-up
4. Results in **2-3x faster** loading and **20-30% better** query performance

### Bounding Box Optimization

- **Minimal enlargement** heuristic for insertion
- **Overlap minimization** during splits
- **Tight bounds** for efficient pruning

## Use Cases

- **Outdoor AR experiences** - Geospatial anchor placement and discovery
- **Location-based services** - Find nearby points of interest
- **Spatial data visualization** - Efficient viewport queries
- **Proximity search** - Find K nearest locations
- **Geo-fencing** - Check if points are within regions
- **Navigation systems** - Route planning and waypoint queries

## Integration with HoloScript

```typescript
import { GeospatialAnchorStorage } from '@holoscript/spatial-index';
import { GeospatialAnchorTrait } from '@holoscript/core';

// Initialize storage
const storage = new GeospatialAnchorStorage();
await storage.init();

// Store anchors from HoloScript compositions
scene.on('geospatial_anchor_resolved', async (event) => {
  await storage.set({
    id: event.node.id,
    lat: event.latitude,
    lon: event.longitude,
    alt: event.altitude,
    metadata: {
      accuracy: event.accuracy,
      timestamp: Date.now()
    }
  });
});

// Query nearby anchors
const nearby = await storage.searchRadius(
  { lat: userLat, lon: userLon },
  100 // 100m
);

// Load anchors into scene
for (const { anchor, distance } of nearby) {
  scene.emit('load_geospatial_marker', {
    id: anchor.id,
    position: { lat: anchor.lat, lon: anchor.lon, alt: anchor.alt },
    distance
  });
}
```

## Contributing

See [HoloScript Contributing Guide](../../CONTRIBUTING.md)

## License

MIT © Brian X Base Team

## Research & References

- [RBush - High-performance JavaScript R-tree](https://github.com/mourner/rbush)
- [R-Trees: A Dynamic Index Structure for Spatial Searching](https://dl.acm.org/doi/10.1145/971697.602266)
- [OMT Algorithm](https://www.bartoszsypytkowski.com/r-tree/)
- [Spatial Index Benchmark](https://github.com/mloskot/spatial_index_benchmark)
