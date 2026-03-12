# Spatial Index

Package: @holoscript/spatial-index

High-performance geospatial indexing and persistence utilities.

## Main Exports

- RTree
- GeospatialAnchorStorage
- Bounding box helpers
- Shared spatial index types

## What It Solves

- O(log n) indexing and query behavior for anchor-heavy scenes.
- Radius and bounded searches for location-aware interactions.
- Durable geospatial anchor persistence with IndexedDB-backed storage.

## Typical Usage

```ts
import { RTree, GeospatialAnchorStorage } from '@holoscript/spatial-index';

const index = new RTree();
const storage = new GeospatialAnchorStorage('holoscript-anchors');

index.insert({ id: 'a1', minX: 0, minY: 0, maxX: 2, maxY: 2, metadata: { kind: 'portal' } });
const nearby = index.search({ minX: -1, minY: -1, maxX: 4, maxY: 4 });

await storage.saveAnchors(nearby);
```
