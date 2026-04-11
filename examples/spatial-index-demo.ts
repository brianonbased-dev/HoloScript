/**
 * @holoscript/spatial-index - Integration Example
 *
 * Demonstrates R-Tree spatial indexing for efficient geospatial anchor queries.
 * This example shows how to:
 * 1. Create and populate an R-Tree with geospatial anchors
 * 2. Perform various spatial queries (bbox, radius, knn)
 * 3. Integrate with IndexedDB for persistence
 * 4. Achieve O(log n) performance at scale
 */

import {
  RTree,
  GeospatialAnchorStorage,
  type GeospatialAnchor,
  type _QueryResult,
} from '@holoscript/spatial-index';

// =============================================================================
// EXAMPLE 1: Basic R-Tree Usage
// =============================================================================

async function basicRTreeExample() {
  console.log('=== Basic R-Tree Example ===\n');

  // Create R-Tree with default options
  const rtree = new RTree({
    maxEntries: 9,
    bulkLoadingEnabled: true,
  });

  // San Francisco landmarks
  const landmarks: GeospatialAnchor[] = [
    {
      id: 'golden-gate',
      lat: 37.8199,
      lon: -122.4783,
      alt: 67,
      metadata: { name: 'Golden Gate Bridge' },
    },
    { id: 'pier-39', lat: 37.8087, lon: -122.4098, alt: 5, metadata: { name: 'Pier 39' } },
    {
      id: 'alcatraz',
      lat: 37.8267,
      lon: -122.4233,
      alt: 41,
      metadata: { name: 'Alcatraz Island' },
    },
    { id: 'coit-tower', lat: 37.8024, lon: -122.4058, alt: 64, metadata: { name: 'Coit Tower' } },
    {
      id: 'palace-fine-arts',
      lat: 37.8029,
      lon: -122.4486,
      alt: 15,
      metadata: { name: 'Palace of Fine Arts' },
    },
    {
      id: 'transamerica',
      lat: 37.7952,
      lon: -122.4028,
      alt: 260,
      metadata: { name: 'Transamerica Pyramid' },
    },
    {
      id: 'ferry-building',
      lat: 37.7956,
      lon: -122.3934,
      alt: 75,
      metadata: { name: 'Ferry Building' },
    },
    {
      id: 'lombard-street',
      lat: 37.8021,
      lon: -122.4187,
      alt: 92,
      metadata: { name: 'Lombard Street' },
    },
  ];

  // Bulk load for optimal performance (2-3x faster)
  console.log(`Loading ${landmarks.length} landmarks...`);
  const startLoad = performance.now();
  rtree.load(landmarks);
  console.log(`Loaded in ${(performance.now() - startLoad).toFixed(2)}ms\n`);

  // Get tree statistics
  const stats = rtree.getStats();
  console.log('Tree Statistics:');
  console.log(`  Total anchors: ${stats.totalAnchors}`);
  console.log(`  Tree height: ${stats.height}`);
  console.log(`  Total nodes: ${stats.totalNodes}`);
  console.log(`  Avg fill ratio: ${(stats.avgFillRatio * 100).toFixed(1)}%\n`);

  // Bounding box query - Find landmarks in downtown SF
  console.log('BBox Query: Downtown SF landmarks');
  const downtownResults = rtree.search({
    minLat: 37.79,
    minLon: -122.42,
    maxLat: 37.81,
    maxLon: -122.39,
  });
  console.log(`Found ${downtownResults.length} landmarks:`);
  downtownResults.forEach((anchor) => {
    console.log(
      `  - ${anchor.metadata?.name} (${anchor.lat.toFixed(4)}, ${anchor.lon.toFixed(4)})`
    );
  });
  console.log();

  // Radius query - Find landmarks within 1km of Ferry Building
  console.log('Radius Query: Landmarks within 1km of Ferry Building');
  const ferryBuilding = { lat: 37.7956, lon: -122.3934 };
  const nearbyResults = rtree.searchRadius(ferryBuilding, 1000);
  console.log(`Found ${nearbyResults.length} landmarks:`);
  nearbyResults.forEach(({ anchor, distance }) => {
    console.log(`  - ${anchor.metadata?.name}: ${distance.toFixed(0)}m away`);
  });
  console.log();

  // K-nearest neighbors - Find 3 closest landmarks to Golden Gate Bridge
  console.log('KNN Query: 3 closest landmarks to Golden Gate Bridge');
  const goldenGate = { lat: 37.8199, lon: -122.4783 };
  const closestResults = rtree.knn(goldenGate, 3);
  console.log(`Found ${closestResults.length} landmarks:`);
  closestResults.forEach(({ anchor, distance }, i) => {
    console.log(`  ${i + 1}. ${anchor.metadata?.name}: ${(distance / 1000).toFixed(2)}km away`);
  });
  console.log();
}

// =============================================================================
// EXAMPLE 2: Large-Scale Performance Test
// =============================================================================

async function performanceExample() {
  console.log('=== Performance Example: 10K Random Anchors ===\n');

  // Generate 10,000 random anchors across SF Bay Area
  const anchors: GeospatialAnchor[] = [];
  const _baseLatconst = 37.7749;
  const baseLon = -122.4194;

  console.log('Generating 10,000 random anchors...');
  for (let i = 0; i < 10000; i++) {
    anchors.push({
      id: `anchor-${i}`,
      lat: baseLat + (Math.random() - 0.5) * 0.2, // ~11km range
      lon: baseLon + (Math.random() - 0.5) * 0.2,
      alt: Math.random() * 100,
      metadata: {
        type: ['poi', 'marker', 'waypoint'][Math.floor(Math.random() * 3)],
        timestamp: Date.now(),
      },
    });
  }

  // Benchmark bulk loading
  const rtree = new RTree();
  console.log('\nBulk loading 10,000 anchors...');
  const startLoad = performance.now();
  rtree.load(anchors);
  const loadTime = performance.now() - startLoad;
  console.log(`Loaded in ${loadTime.toFixed(2)}ms`);

  // Benchmark queries
  const queryCenter = { lat: baseLat, lon: baseLon };

  // BBox query
  console.log('\nBenchmarking BBox query...');
  const bboxStart = performance.now();
  const bboxResults = rtree.search({
    minLat: baseLat - 0.01,
    minLon: baseLon - 0.01,
    maxLat: baseLat + 0.01,
    maxLon: baseLon + 0.01,
  });
  const bboxTime = performance.now() - bboxStart;
  console.log(`Found ${bboxResults.length} anchors in ${bboxTime.toFixed(2)}ms`);

  // Radius query
  console.log('\nBenchmarking Radius query (1km)...');
  const radiusStart = performance.now();
  const radiusResults = rtree.searchRadius(queryCenter, 1000);
  const radiusTime = performance.now() - radiusStart;
  console.log(`Found ${radiusResults.length} anchors in ${radiusTime.toFixed(2)}ms`);

  // KNN query
  console.log('\nBenchmarking KNN query (k=100)...');
  const knnStart = performance.now();
  const knnResults = rtree.knn(queryCenter, 100);
  const knnTime = performance.now() - knnStart;
  console.log(`Found ${knnResults.length} anchors in ${knnTime.toFixed(2)}ms`);

  // Statistics
  const stats = rtree.getStats();
  console.log('\nFinal Statistics:');
  console.log(`  Total anchors: ${stats.totalAnchors}`);
  console.log(
    `  Tree height: ${stats.height} (O(log n) = ${Math.ceil(Math.log2(stats.totalAnchors))})`
  );
  console.log(`  Total nodes: ${stats.totalNodes}`);
  console.log(`  Avg fill ratio: ${(stats.avgFillRatio * 100).toFixed(1)}%`);
  console.log();

  // Performance summary
  console.log('Performance Summary:');
  console.log(`  Bulk load: ${loadTime.toFixed(2)}ms`);
  console.log(`  BBox query: ${bboxTime.toFixed(2)}ms`);
  console.log(`  Radius query: ${radiusTime.toFixed(2)}ms`);
  console.log(`  KNN query: ${knnTime.toFixed(2)}ms`);
  console.log();
}

// =============================================================================
// EXAMPLE 3: IndexedDB Persistence
// =============================================================================

async function persistenceExample() {
  console.log('=== IndexedDB Persistence Example ===\n');

  // Create storage with persistence
  const storage = new GeospatialAnchorStorage({
    dbName: 'holoscript-demo',
    storeName: 'demo-anchors',
    maxEntries: 9,
  });

  // Initialize (loads existing anchors if any)
  console.log('Initializing storage...');
  await storage.init();

  // Check if we have existing data
  const existingCount = await storage.count();
  console.log(`Found ${existingCount} existing anchors\n`);

  if (existingCount === 0) {
    // First run - populate with sample data
    console.log('Populating with sample data...');
    const sampleAnchors: GeospatialAnchor[] = [
      { id: 'home', lat: 37.7749, lon: -122.4194, metadata: { type: 'home' } },
      { id: 'work', lat: 37.7849, lon: -122.4094, metadata: { type: 'work' } },
      { id: 'gym', lat: 37.7649, lon: -122.4294, metadata: { type: 'gym' } },
    ];

    await storage.setMany(sampleAnchors);
    console.log(`Stored ${sampleAnchors.length} anchors\n`);
  }

  // Query nearby locations
  console.log('Querying nearby locations...');
  const myLocation = { lat: 37.7749, lon: -122.4194 };
  const nearby = await storage.searchRadius(myLocation, 2000); // 2km

  console.log(`Found ${nearby.length} locations within 2km:`);
  nearby.forEach(({ anchor, distance }) => {
    console.log(`  - ${anchor.id}: ${(distance / 1000).toFixed(2)}km (${anchor.metadata?.type})`);
  });
  console.log();

  // Export data
  console.log('Exporting data...');
  const exportedData = await storage.export();
  console.log(`Exported ${exportedData.length} bytes\n`);

  // Statistics
  const stats = storage.getStats();
  console.log('Storage Statistics:');
  console.log(`  Total anchors: ${stats.totalAnchors}`);
  console.log(`  Tree height: ${stats.height}`);
  console.log(`  Avg fill ratio: ${(stats.avgFillRatio * 100).toFixed(1)}%\n`);

  // Cleanup
  await storage.close();
  console.log('Storage closed\n');
}

// =============================================================================
// EXAMPLE 4: Real-World AR Scenario
// =============================================================================

async function arScenarioExample() {
  console.log('=== AR Scenario: Outdoor Navigation ===\n');

  const rtree = new RTree();

  // Load POIs along a walking route
  const route: GeospatialAnchor[] = [
    {
      id: 'start',
      lat: 37.7749,
      lon: -122.4194,
      metadata: { type: 'start', name: 'Union Square' },
    },
    {
      id: 'poi-1',
      lat: 37.785,
      lon: -122.4094,
      metadata: { type: 'landmark', name: 'Chinatown Gate' },
    },
    {
      id: 'poi-2',
      lat: 37.795,
      lon: -122.3994,
      metadata: { type: 'landmark', name: 'Dragon Gate' },
    },
    {
      id: 'poi-3',
      lat: 37.805,
      lon: -122.3894,
      metadata: { type: 'viewpoint', name: 'Scenic Vista' },
    },
    { id: 'end', lat: 37.815, lon: -122.3794, metadata: { type: 'end', name: 'North Beach' } },
    // Add some nearby shops and restaurants
    {
      id: 'shop-1',
      lat: 37.7755,
      lon: -122.42,
      metadata: { type: 'shop', name: 'Souvenir Store' },
    },
    {
      id: 'rest-1',
      lat: 37.786,
      lon: -122.41,
      metadata: { type: 'restaurant', name: 'Dim Sum Palace' },
    },
    { id: 'shop-2', lat: 37.796, lon: -122.4, metadata: { type: 'shop', name: 'Tea Shop' } },
  ];

  rtree.load(route);

  // Simulate user walking along route
  console.log('User walking route...\n');

  const userPositions = [
    { lat: 37.7749, lon: -122.4194, label: 'Start' },
    { lat: 37.78, lon: -122.4144, label: 'Walking...' },
    { lat: 37.79, lon: -122.4044, label: 'Mid-route' },
    { lat: 37.81, lon: -122.3844, label: 'Near end' },
  ];

  for (const pos of userPositions) {
    console.log(`User at ${pos.label} (${pos.lat.toFixed(4)}, ${pos.lon.toFixed(4)})`);

    // Find next waypoint
    const nextWaypoints = rtree.knn(pos, 3);
    console.log('  Next waypoints:');
    nextWaypoints.forEach(({ anchor, distance }, i) => {
      console.log(
        `    ${i + 1}. ${anchor.metadata?.name}: ${distance.toFixed(0)}m (${anchor.metadata?.type})`
      );
    });

    // Find nearby POIs within 100m
    const nearbyPOIs = rtree.searchRadius(pos, 100);
    if (nearbyPOIs.length > 0) {
      console.log('  Nearby POIs (<100m):');
      nearbyPOIs.forEach(({ anchor, distance }) => {
        console.log(`    - ${anchor.metadata?.name}: ${distance.toFixed(0)}m`);
      });
    }

    console.log();
  }
}

// =============================================================================
// Run all examples
// =============================================================================

async function main() {
  try {
    await basicRTreeExample();
    await performanceExample();
    await persistenceExample();
    await arScenarioExample();

    console.log('=== All examples completed successfully! ===');
  } catch (error) {
    console.error('Error running examples:', error);
    process.exit(1);
  }
}

// Run examples
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { basicRTreeExample, performanceExample, persistenceExample, arScenarioExample };
