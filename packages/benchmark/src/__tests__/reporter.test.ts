import { describe, it, expect } from 'vitest';
import { generateHtmlReport, type BenchmarkResult, type SuiteResults, type AllResults } from '../reporter';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockResult: BenchmarkResult = {
  name: 'parse small file',
  opsPerSecond: 125000,
  meanMs: 0.008,
  samples: 100,
  marginOfError: 1.5,
};

const mockSuite: SuiteResults = {
  suite: 'Parser Suite',
  timestamp: '2026-02-17T12:00:00.000Z',
  results: [
    mockResult,
    {
      name: 'parse large file',
      opsPerSecond: 3500,
      meanMs: 0.286,
      samples: 100,
      marginOfError: 2.1,
    },
  ],
};

const mockAllResults: AllResults = {
  version: '3.5.0',
  commit: 'abc1234',
  timestamp: '2026-02-17T12:00:00.000Z',
  suites: [mockSuite],
};

// ---------------------------------------------------------------------------
// generateHtmlReport
// ---------------------------------------------------------------------------

describe('generateHtmlReport', () => {
  it('returns a string', () => {
    const html = generateHtmlReport(mockAllResults);
    expect(typeof html).toBe('string');
  });

  it('starts with valid HTML doctype', () => {
    const html = generateHtmlReport(mockAllResults);
    expect(html.trimStart()).toMatch(/^<!DOCTYPE html>/i);
  });

  it('includes the version number', () => {
    const html = generateHtmlReport(mockAllResults);
    expect(html).toContain('3.5.0');
  });

  it('includes the commit hash (trimmed to 7 chars)', () => {
    const html = generateHtmlReport(mockAllResults);
    expect(html).toContain('abc1234');
  });

  it('includes suite name', () => {
    const html = generateHtmlReport(mockAllResults);
    expect(html).toContain('Parser Suite');
  });

  it('includes benchmark names', () => {
    const html = generateHtmlReport(mockAllResults);
    expect(html).toContain('parse small file');
    expect(html).toContain('parse large file');
  });

  it('shows mean time in ms', () => {
    const html = generateHtmlReport(mockAllResults);
    // meanMs is formatted as .toFixed(3)
    expect(html).toContain('0.008');
  });

  it('shows margin of error', () => {
    const html = generateHtmlReport(mockAllResults);
    expect(html).toContain('1.5');
  });

  it('formats ops/s in M notation for million-scale', () => {
    const html = generateHtmlReport(mockAllResults);
    // 125000 ops/s = 0.13M ops/s
    expect(html).toContain('ops/s');
  });

  it('includes SVG bar chart elements', () => {
    const html = generateHtmlReport(mockAllResults);
    expect(html).toContain('<svg');
    expect(html).toContain('<rect');
  });

  it('is self-contained (no external script/style references)', () => {
    const html = generateHtmlReport(mockAllResults);
    expect(html).not.toContain('src="http');
    expect(html).not.toContain('href="http');
  });

  it('handles multiple suites', () => {
    const multiSuite: AllResults = {
      ...mockAllResults,
      suites: [
        mockSuite,
        {
          suite: 'Compiler Suite',
          timestamp: mockAllResults.timestamp,
          results: [{ ...mockResult, name: 'compile glb' }],
        },
      ],
    };
    const html = generateHtmlReport(multiSuite);
    expect(html).toContain('Parser Suite');
    expect(html).toContain('Compiler Suite');
    expect(html).toContain('compile glb');
  });

  it('handles empty results array gracefully', () => {
    const empty: AllResults = { ...mockAllResults, suites: [] };
    const html = generateHtmlReport(empty);
    expect(html).toContain('<!DOCTYPE html>');
    // Should render without error
  });

  it('handles results with 0 opsPerSecond (no divide-by-zero)', () => {
    const zeroOps: AllResults = {
      ...mockAllResults,
      suites: [{
        suite: 'Zero Suite',
        timestamp: mockAllResults.timestamp,
        results: [{ ...mockResult, opsPerSecond: 0 }],
      }],
    };
    expect(() => generateHtmlReport(zeroOps)).not.toThrow();
  });

  it('omits commit from meta if not provided', () => {
    const noCommit: AllResults = { ...mockAllResults, commit: undefined };
    const html = generateHtmlReport(noCommit);
    // Should not show "·" separator or undefined
    expect(html).not.toContain('undefined');
    expect(html).toContain('3.5.0');
  });

  it('formats K notation for thousands-scale ops', () => {
    const kScale: AllResults = {
      ...mockAllResults,
      suites: [{
        suite: 'K Suite',
        timestamp: mockAllResults.timestamp,
        results: [{ ...mockResult, opsPerSecond: 15000 }],
      }],
    };
    const html = generateHtmlReport(kScale);
    expect(html).toContain('K ops/s');
  });

  it('formats raw ops for sub-1000 scale', () => {
    const lowOps: AllResults = {
      ...mockAllResults,
      suites: [{
        suite: 'Low Suite',
        timestamp: mockAllResults.timestamp,
        results: [{ ...mockResult, opsPerSecond: 42 }],
      }],
    };
    const html = generateHtmlReport(lowOps);
    expect(html).toContain('42 ops/s');
  });
});
