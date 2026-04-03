import { describe, it, expect } from 'vitest';
import { COMPONENT_REGISTRY, findCanonical } from '../COMPONENT_REGISTRY';

describe('COMPONENT_REGISTRY', () => {
  it('has at least 10 entries', () => {
    expect(Object.keys(COMPONENT_REGISTRY).length).toBeGreaterThanOrEqual(10);
  });

  it('every entry has canonical path and exports', () => {
    for (const [key, entry] of Object.entries(COMPONENT_REGISTRY)) {
      expect(entry.canonical, `${key}.canonical`).toBeTruthy();
      expect(entry.exports.length, `${key}.exports`).toBeGreaterThan(0);
      expect(entry.domain, `${key}.domain`).toBeTruthy();
      expect(entry.description, `${key}.description`).toBeTruthy();
    }
  });

  it('no two entries share the same canonical path (excluding services)', () => {
    const canonicals = Object.values(COMPONENT_REGISTRY)
      .map((e) => e.canonical)
      .filter((c) => !c.includes('features/'));
    const unique = new Set(canonicals);
    expect(unique.size).toBe(canonicals.length);
  });

  it('deprecated entries reference their canonical replacement', () => {
    for (const [key, entry] of Object.entries(COMPONENT_REGISTRY)) {
      if ('deprecated' in entry && entry.deprecated) {
        for (const dep of entry.deprecated as readonly {
          file: string;
          export: string;
          reason: string;
        }[]) {
          expect(dep.file, `${key} deprecated file`).toBeTruthy();
          expect(dep.export, `${key} deprecated export`).toBeTruthy();
          expect(dep.reason, `${key} deprecated reason`).toBeTruthy();
        }
      }
    }
  });

  it('usedIn arrays are non-empty strings', () => {
    for (const [key, entry] of Object.entries(COMPONENT_REGISTRY)) {
      if ('usedIn' in entry) {
        const usedIn = entry.usedIn as readonly string[];
        expect(usedIn.length, `${key}.usedIn should be non-empty`).toBeGreaterThan(0);
        for (const usage of usedIn) {
          expect(usage.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('findCanonical', () => {
  it('finds a canonical component by export name', () => {
    const result = findCanonical('ErrorBoundary');
    expect(result).toBe('@holoscript/ui → ErrorBoundary');
  });

  it('finds a canonical component for ShaderEditor', () => {
    const result = findCanonical('ShaderEditor');
    expect(result).toBe('components/shader-editor/ShaderEditor.tsx');
  });

  it('returns DEPRECATED prefix for deprecated exports', () => {
    const result = findCanonical('CollabCursors');
    expect(result).toContain('DEPRECATED');
    expect(result).toContain('use');
  });

  it('returns undefined for unknown components', () => {
    expect(findCanonical('NonExistentComponent999')).toBeUndefined();
  });

  it('finds HistoryPanel', () => {
    const result = findCanonical('HistoryPanel');
    expect(result).toBe('components/HistoryPanel.tsx');
  });

  it('finds ExportPanel for scene export', () => {
    const result = findCanonical('ExportPanel');
    expect(result).toBe('components/export/ExportPanel.tsx');
  });

  it('identifies deprecated OrchestrationErrorBoundary', () => {
    const result = findCanonical('OrchestrationErrorBoundary');
    expect(result).toContain('DEPRECATED');
  });
});
