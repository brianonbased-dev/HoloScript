// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScenarioList } from '../../hooks/useScenarioList';

describe('useScenarioList', () => {
  it('returns all scenarios by default', () => {
    const { result } = renderHook(() => useScenarioList());
    expect(result.current.scenarios.length).toBe(26);
    expect(result.current.totalCount).toBe(26);
    expect(result.current.resultCount).toBe(26);
  });

  it('filters by search term', () => {
    const { result } = renderHook(() => useScenarioList());
    act(() => result.current.setSearch('DNA'));
    expect(result.current.resultCount).toBeLessThan(26);
    expect(result.current.scenarios.some((s) => s.id === 'dna')).toBe(true);
  });

  it('filters by category', () => {
    const { result } = renderHook(() => useScenarioList());
    act(() => result.current.setCategory('science'));
    for (const s of result.current.scenarios) {
      expect(s.category).toBe('science');
    }
  });

  it('combines search and category filters', () => {
    const { result } = renderHook(() => useScenarioList());
    act(() => {
      result.current.setCategory('science');
      result.current.setSearch('dna');
    });
    expect(result.current.scenarios.length).toBeGreaterThanOrEqual(1);
    for (const s of result.current.scenarios) {
      expect(s.category).toBe('science');
    }
  });

  it('sorts by name ascending by default', () => {
    const { result } = renderHook(() => useScenarioList());
    const names = result.current.scenarios.map((s) => s.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it('sorts by test count descending', () => {
    const { result } = renderHook(() => useScenarioList());
    act(() => {
      result.current.setSortField('testCount');
      result.current.toggleSortDirection(); // switch to desc
    });
    const counts = result.current.scenarios.map((s) => s.testCount);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }
  });

  it('provides correct category counts', () => {
    const { result } = renderHook(() => useScenarioList());
    expect(result.current.categoryCounts.all).toBe(26);
    const sumCats = Object.entries(result.current.categoryCounts)
      .filter(([k]) => k !== 'all')
      .reduce((sum, [, v]) => sum + v, 0);
    expect(sumCats).toBe(26);
  });

  it('resetFilters restores defaults', () => {
    const { result } = renderHook(() => useScenarioList());
    act(() => {
      result.current.setSearch('xyz');
      result.current.setCategory('arts');
    });
    expect(result.current.resultCount).toBeLessThan(26);
    act(() => result.current.resetFilters());
    expect(result.current.resultCount).toBe(26);
    expect(result.current.search).toBe('');
    expect(result.current.category).toBe('all');
  });

  it('returns empty when search matches nothing', () => {
    const { result } = renderHook(() => useScenarioList());
    act(() => result.current.setSearch('zzzznonexistent'));
    expect(result.current.resultCount).toBe(0);
    expect(result.current.scenarios).toEqual([]);
  });

  it('accepts initial options', () => {
    const { result } = renderHook(() =>
      useScenarioList({
        initialSearch: 'ocean',
        initialCategory: 'nature',
        initialSort: 'testCount',
        initialSortDirection: 'desc',
      })
    );
    expect(result.current.search).toBe('ocean');
    expect(result.current.category).toBe('nature');
    expect(result.current.sortField).toBe('testCount');
    expect(result.current.sortDirection).toBe('desc');
  });
});
