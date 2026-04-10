import { describe, bench, beforeAll } from 'vitest';
import { RTree } from '../RTree';
import type { GeospatialAnchor } from '../types';

/**
 * Performance Benchmarks for R-Tree Spatial Index
 *
 * Target: O(log n) query performance, <100ms for 100K anchors
 */

describe('R-Tree Performance Benchmarks', () => {
  describe('Insertion Performance', () => {
    bench('Insert 1K anchors sequentially', () => {
      const rtree = new RTree();
      for (let i = 0; i < 1000; i++) {
        rtree.insert({
          id: `anchor-${i}`,
          lat: -90 + Math.random() * 180,
          lon: -180 + Math.random() * 360,
        });
      }
    });

    bench('Bulk load 1K anchors', () => {
      const rtree = new RTree();
      const anchors: GeospatialAnchor[] = [];
      for (let i = 0; i < 1000; i++) {
        anchors.push({
          id: `anchor-${i}`,
          lat: -90 + Math.random() * 180,
          lon: -180 + Math.random() * 360,
        });
      }
      rtree.load(anchors);
    });

    bench('Bulk load 10K anchors', () => {
      const rtree = new RTree();
      const anchors: GeospatialAnchor[] = [];
      for (let i = 0; i < 10000; i++) {
        anchors.push({
          id: `anchor-${i}`,
          lat: -90 + Math.random() * 180,
          lon: -180 + Math.random() * 360,
        });
      }
      rtree.load(anchors);
    });

    bench('Bulk load 50K anchors', () => {
      const rtree = new RTree();
      const anchors: GeospatialAnchor[] = [];
      for (let i = 0; i < 50000; i++) {
        anchors.push({
          id: `anchor-${i}`,
          lat: -90 + Math.random() * 180,
          lon: -180 + Math.random() * 360,
        });
      }
      rtree.load(anchors);
    });

    bench('Bulk load 100K anchors', () => {
      const rtree = new RTree();
      const anchors: GeospatialAnchor[] = [];
      for (let i = 0; i < 100000; i++) {
        anchors.push({
          id: `anchor-${i}`,
          lat: -90 + Math.random() * 180,
          lon: -180 + Math.random() * 360,
        });
      }
      rtree.load(anchors);
    });
  });

  describe('Query Performance - 10K Anchors', () => {
    let rtree10k: RTree;

    beforeAll(() => {
      rtree10k = new RTree();
      const anchors: GeospatialAnchor[] = [];
      for (let i = 0; i < 10000; i++) {
        anchors.push({
          id: `anchor-${i}`,
          lat: -90 + Math.random() * 180,
          lon: -180 + Math.random() * 360,
        });
      }
      rtree10k.load(anchors);
    });

    bench('BBox query (10K anchors)', () => {
      rtree10k.search({
        minLat: 37,
        minLon: -123,
        maxLat: 38,
        maxLon: -122,
      });
    });

    bench('Radius search 1km (10K anchors)', () => {
      rtree10k.searchRadius({ lat: 37.7749, lon: -122.4194 }, 1000);
    });

    bench('Radius search 10km (10K anchors)', () => {
      rtree10k.searchRadius({ lat: 37.7749, lon: -122.4194 }, 10000);
    });

    bench('K-NN search k=10 (10K anchors)', () => {
      rtree10k.knn({ lat: 37.7749, lon: -122.4194 }, 10);
    });

    bench('K-NN search k=100 (10K anchors)', () => {
      rtree10k.knn({ lat: 37.7749, lon: -122.4194 }, 100);
    });
  });

  describe('Query Performance - 50K Anchors', () => {
    let rtree50k: RTree;

    beforeAll(() => {
      rtree50k = new RTree();
      const anchors: GeospatialAnchor[] = [];
      for (let i = 0; i < 50000; i++) {
        anchors.push({
          id: `anchor-${i}`,
          lat: -90 + Math.random() * 180,
          lon: -180 + Math.random() * 360,
        });
      }
      rtree50k.load(anchors);
    });

    bench('BBox query (50K anchors)', () => {
      rtree50k.search({
        minLat: 37,
        minLon: -123,
        maxLat: 38,
        maxLon: -122,
      });
    });

    bench('Radius search 1km (50K anchors)', () => {
      rtree50k.searchRadius({ lat: 37.7749, lon: -122.4194 }, 1000);
    });

    bench('K-NN search k=10 (50K anchors)', () => {
      rtree50k.knn({ lat: 37.7749, lon: -122.4194 }, 10);
    });
  });

  describe('Query Performance - 100K Anchors (Target)', () => {
    let rtree100k: RTree;

    beforeAll(() => {
      rtree100k = new RTree();
      const anchors: GeospatialAnchor[] = [];
      for (let i = 0; i < 100000; i++) {
        anchors.push({
          id: `anchor-${i}`,
          lat: -90 + Math.random() * 180,
          lon: -180 + Math.random() * 360,
        });
      }
      rtree100k.load(anchors);
    });

    bench('BBox query (100K anchors) - Target <100ms', () => {
      rtree100k.search({
        minLat: 37,
        minLon: -123,
        maxLat: 38,
        maxLon: -122,
      });
    });

    bench('Radius search 1km (100K anchors) - Target <100ms', () => {
      rtree100k.searchRadius({ lat: 37.7749, lon: -122.4194 }, 1000);
    });

    bench('Radius search 10km (100K anchors) - Target <100ms', () => {
      rtree100k.searchRadius({ lat: 37.7749, lon: -122.4194 }, 10000);
    });

    bench('K-NN search k=10 (100K anchors) - Target <100ms', () => {
      rtree100k.knn({ lat: 37.7749, lon: -122.4194 }, 10);
    });

    bench('K-NN search k=100 (100K anchors) - Target <100ms', () => {
      rtree100k.knn({ lat: 37.7749, lon: -122.4194 }, 100);
    });
  });

  describe('Deletion Performance', () => {
    bench('Delete from 10K anchors (100 deletions)', () => {
      const rtree = new RTree();
      const anchors: GeospatialAnchor[] = [];
      for (let i = 0; i < 10000; i++) {
        anchors.push({
          id: `anchor-${i}`,
          lat: -90 + Math.random() * 180,
          lon: -180 + Math.random() * 360,
        });
      }
      rtree.load(anchors);

      for (let i = 0; i < 100; i++) {
        rtree.remove(`anchor-${i}`);
      }
    });
  });

  describe('Mixed Operations Performance', () => {
    bench('Mixed ops: insert + query + delete (1K ops)', () => {
      const rtree = new RTree();
      const anchors: GeospatialAnchor[] = [];

      // Initial load
      for (let i = 0; i < 1000; i++) {
        anchors.push({
          id: `anchor-${i}`,
          lat: -90 + Math.random() * 180,
          lon: -180 + Math.random() * 360,
        });
      }
      rtree.load(anchors);

      // Mixed operations
      for (let i = 0; i < 1000; i++) {
        if (i % 3 === 0) {
          // Insert
          rtree.insert({
            id: `new-anchor-${i}`,
            lat: -90 + Math.random() * 180,
            lon: -180 + Math.random() * 360,
          });
        } else if (i % 3 === 1) {
          // Query
          rtree.searchRadius({ lat: 37.7749, lon: -122.4194 }, 1000);
        } else {
          // Delete
          rtree.remove(`anchor-${i}`);
        }
      }
    });
  });

  describe('Comparison: Linear Scan vs R-Tree', () => {
    let anchors: GeospatialAnchor[];

    beforeAll(() => {
      anchors = [];
      for (let i = 0; i < 10000; i++) {
        anchors.push({
          id: `anchor-${i}`,
          lat: -90 + Math.random() * 180,
          lon: -180 + Math.random() * 360,
        });
      }
    });

    bench('Linear scan radius search (10K anchors)', () => {
      const center = { lat: 37.7749, lon: -122.4194 };
      const radius = 1000;
      const results: GeospatialAnchor[] = [];

      for (const anchor of anchors) {
        const R = 6371000;
        const dLat = ((anchor.lat - center.lat) * Math.PI) / 180;
        const dLon = ((anchor.lon - center.lon) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((center.lat * Math.PI) / 180) *
            Math.cos((anchor.lat * Math.PI) / 180) *
            Math.sin(dLon / 2) ** 2;
        const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        if (distance <= radius) {
          results.push(anchor);
        }
      }
    });

    bench('R-Tree radius search (10K anchors)', () => {
      const rtree = new RTree();
      rtree.load(anchors);
      rtree.searchRadius({ lat: 37.7749, lon: -122.4194 }, 1000);
    });
  });
});
