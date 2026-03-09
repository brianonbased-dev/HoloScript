/**
 * Size validation script for MVC objects
 *
 * Validates that compressed MVC objects meet size targets:
 * - Individual objects: <2KB each
 * - Total (all 5): <10KB
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, '..', 'dist');

// Check if dist exists
try {
  readFileSync(join(distPath, 'index.js'));
} catch {
  console.error('Error: dist/ directory not found. Run `pnpm build` first.');
  process.exit(1);
}

// Import from built dist (use file:// URL for Windows compatibility)
const { compressMVCBatch } = await import(
  `file:///${join(distPath, 'compression', 'index.js').replace(/\\/g, '/')}`
);

// Sample MVC objects
const sampleObjects = [
  // DecisionHistory
  {
    crdtType: 'g-set',
    crdtId: '123e4567-e89b-12d3-a456-426614174000',
    decisions: [
      {
        id: '223e4567-e89b-12d3-a456-426614174000',
        timestamp: 1704067200000,
        type: 'task',
        description: 'Implement MVC schema package with compression',
        choice: 'Use TypeScript, JSON Schema, and CBOR encoding',
        confidence: 0.9,
      },
      {
        id: '323e4567-e89b-12d3-a456-426614174000',
        timestamp: 1704067300000,
        type: 'strategy',
        description: 'Choose compression strategy',
        choice: 'Two-stage: schema compression + CBOR',
        outcome: 'success',
      },
    ],
    vectorClock: { 'did:key:agent1': 2 },
    lastUpdated: 1704067300000,
  },

  // ActiveTaskState
  {
    crdtType: 'or-set+lww',
    crdtId: '123e4567-e89b-12d3-a456-426614174001',
    tasks: [
      {
        id: '223e4567-e89b-12d3-a456-426614174000',
        title: 'Build compression pipeline',
        status: 'completed',
        priority: 'high',
        createdAt: 1704067200000,
        updatedAt: 1704067400000,
        estimatedDuration: 7200000,
        actualDuration: 6800000,
      },
      {
        id: '323e4567-e89b-12d3-a456-426614174000',
        title: 'Write comprehensive tests',
        status: 'in_progress',
        priority: 'high',
        createdAt: 1704067300000,
        updatedAt: 1704067400000,
        estimatedDuration: 5400000,
      },
    ],
    taskTags: {},
    statusRegisters: {},
    vectorClock: { 'did:key:agent1': 3 },
    lastUpdated: 1704067400000,
  },

  // UserPreferences
  {
    crdtType: 'lww-map',
    crdtId: '123e4567-e89b-12d3-a456-426614174002',
    agentDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    spatial: {
      movementSpeed: 2.5,
      personalSpaceRadius: 1.5,
      interactionDistance: 2.0,
      handDominance: 'right',
    },
    communication: {
      style: 'technical',
      language: 'en',
      voiceInput: true,
      textToSpeech: false,
      notifications: 'important',
    },
    visual: {
      theme: 'dark',
      uiScale: 1.2,
      colorVisionMode: 'normal',
      reducedMotion: false,
      showAnchors: true,
    },
    privacy: {
      shareLocation: true,
      shareTaskState: true,
      allowCollaboration: true,
      visibilityMode: 'team',
    },
    lwwMetadata: {},
    lastUpdated: 1704067400000,
  },

  // SpatialContextSummary
  {
    crdtType: 'lww+gset',
    crdtId: '123e4567-e89b-12d3-a456-426614174003',
    agentDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    primaryAnchor: {
      id: '223e4567-e89b-12d3-a456-426614174000',
      coordinate: {
        latitude: 37.7749,
        longitude: -122.4194,
        altitude: 10.0,
        horizontalAccuracy: 2.5,
        verticalAccuracy: 5.0,
      },
      label: 'San Francisco Office - Meeting Room 3',
      createdAt: 1704067200000,
      lastVerified: 1704067400000,
      type: 'workspace',
      confidence: 0.95,
    },
    currentPose: {
      position: [0, 1.7, -2],
      orientation: [0, 0, 0, 1],
      timestamp: 1704067400000,
      velocity: [0.5, 0, 0.2],
    },
    recentAnchors: [],
    environment: {
      type: 'indoor',
      lightingLevel: 500,
      noiseLevel: 45,
      temperature: 21,
    },
    lastUpdated: 1704067400000,
  },

  // EvidenceTrail
  {
    crdtType: 'hash-chain',
    crdtId: '123e4567-e89b-12d3-a456-426614174004',
    vcpMetadata: {
      version: '1.1',
      hashAlgorithm: 'sha256',
      createdAt: 1704067200000,
      creatorDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      purpose: 'Track MVC schema implementation decisions',
    },
    entries: [
      {
        sequence: 0,
        type: 'observation',
        timestamp: 1704067200000,
        content: 'Genesis: Starting MVC schema implementation',
        hash: 'a'.repeat(64),
        previousHash: null,
        agentDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      },
      {
        sequence: 1,
        type: 'action',
        timestamp: 1704067300000,
        content: 'Created TypeScript types for all 5 MVC objects',
        hash: 'b'.repeat(64),
        previousHash: 'a'.repeat(64),
        agentDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        confidence: 1.0,
      },
      {
        sequence: 2,
        type: 'reasoning',
        timestamp: 1704067400000,
        content: 'Compression pipeline achieves <10KB total target',
        hash: 'c'.repeat(64),
        previousHash: 'b'.repeat(64),
        agentDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        confidence: 0.98,
      },
    ],
    headHash: 'c'.repeat(64),
    lastUpdated: 1704067400000,
  },
];

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('MVC SCHEMA SIZE VALIDATION');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const result = compressMVCBatch(sampleObjects, {
  sizeTarget: 2048,
  totalSizeTarget: 10240,
});

// Print individual results
const objectNames = [
  'DecisionHistory',
  'ActiveTaskState',
  'UserPreferences',
  'SpatialContextSummary',
  'EvidenceTrail',
];

console.log('Individual Object Sizes:\n');

result.results.forEach((res, i) => {
  const name = objectNames[i];
  const status = res.validation.valid ? '✓' : '✗';
  const ratio = (res.totalCompressionRatio * 100).toFixed(1);

  console.log(`${status} ${name}:`);
  console.log(`  Original:    ${res.originalSize.toLocaleString()}B`);
  console.log(`  Compressed:  ${res.finalSize.toLocaleString()}B`);
  console.log(`  Compression: ${ratio}%`);
  console.log(`  Status:      ${res.validation.message}`);
  console.log('');
});

// Print totals
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TOTALS:\n');
console.log(`Total Original:    ${result.totalOriginalSize.toLocaleString()}B`);
console.log(`Total Compressed:  ${result.totalFinalSize.toLocaleString()}B`);
console.log(`Avg Compression:   ${(result.averageCompressionRatio * 100).toFixed(1)}%`);
console.log(`Target:            ${result.totalSizeTarget.toLocaleString()}B`);
console.log('');

// Final verdict
if (result.allValid && !result.exceedsTotal) {
  console.log('✓ ALL CHECKS PASSED');
  console.log(`  - All objects <2KB: ${result.allValid ? 'YES' : 'NO'}`);
  console.log(`  - Total <10KB: ${!result.exceedsTotal ? 'YES' : 'NO'}`);
  process.exit(0);
} else {
  console.log('✗ VALIDATION FAILED');
  console.log(`  - All objects <2KB: ${result.allValid ? 'YES' : 'NO'}`);
  console.log(`  - Total <10KB: ${!result.exceedsTotal ? 'YES' : 'NO'}`);
  process.exit(1);
}
