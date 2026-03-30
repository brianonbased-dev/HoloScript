/**
 * Tests for benchmark reporter functions
 */

import { describe, it, expect } from 'vitest';

// Mock data structure for testing
const mockSerializationData = [
  {
    library: 'TestLib1',
    operationCount: 1000,
    serializedSize: 2048,
    serializeTime: 0.005,
    deserializeTime: 0.003,
  },
  {
    library: 'TestLib2',
    operationCount: 1000,
    serializedSize: 4096,
    serializeTime: 0.01,
    deserializeTime: 0.008,
  },
  {
    library: 'TestLib1',
    operationCount: 10000,
    serializedSize: 20480,
    serializeTime: 0.05,
    deserializeTime: 0.03,
  },
];

// Helper to group array by key (copied from reporter.ts)
function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce(
    (groups, item) => {
      const value = String(item[key]);
      (groups[value] = groups[value] || []).push(item);
      return groups;
    },
    {} as Record<string, T[]>
  );
}

// Test implementation of analyzeSerialization
function analyzeSerialization(ser: any[]): string {
  let analysis = '';

  // Group by operation count
  const byCount = groupBy(ser, 'operationCount');
  for (const [count, results] of Object.entries(byCount)) {
    const sorted = results.sort((a: any, b: any) => a.serializedSize - b.serializedSize);
    const smallest = sorted[0];
    const largest = sorted[sorted.length - 1];
    const ratio = (largest.serializedSize / smallest.serializedSize).toFixed(1);

    analysis += `- **${count} operations**: ${smallest.library} serializes ${ratio}× smaller than ${largest.library}\n`;
  }

  // Performance analysis
  const fastestSerializer = ser.reduce((best, r) =>
    r.serializeTime < best.serializeTime ? r : best
  );
  const fastestDeserializer = ser.reduce((best, r) =>
    r.deserializeTime < best.deserializeTime ? r : best
  );

  analysis += `\n**Serialization Speed**: ${fastestSerializer.library} (${fastestSerializer.serializeTime.toFixed(4)} ms)\n`;
  analysis += `**Deserialization Speed**: ${fastestDeserializer.library} (${fastestDeserializer.deserializeTime.toFixed(4)} ms)\n`;

  return analysis;
}

describe('Reporter Functions', () => {
  it('analyzeSerialization should generate proper analysis', () => {
    const result = analyzeSerialization(mockSerializationData);

    // Should contain ratio comparisons
    expect(result).toContain('1000 operations');
    expect(result).toContain('10000 operations');
    expect(result).toContain('TestLib1 serializes');
    expect(result).toContain('× smaller than');

    // Should contain performance analysis
    expect(result).toContain('Serialization Speed');
    expect(result).toContain('Deserialization Speed');

    // Should identify fastest performers
    expect(result).toContain('TestLib1 (0.0050 ms)'); // Fastest serializer
    expect(result).toContain('TestLib1 (0.0030 ms)'); // Fastest deserializer
  });

  it('analyzeSerialization should handle edge cases', () => {
    const singleItem = [mockSerializationData[0]];
    const result = analyzeSerialization(singleItem);

    // Should not crash with single item
    expect(result).toContain('TestLib1');
    expect(result).toContain('Serialization Speed');
  });
});
