// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ExportPanel } from '../export/ExportPanel';

vi.mock('@/lib/stores', () => ({
  useCharacterStore: vi.fn((selector: any) =>
    selector({
      morphTargets: {},
      skinColor: '#e8beac',
      equippedItems: {},
      glbUrl: null,
    })
  ),
}));

describe('ExportPanel', () => {
  it('renders without crashing', () => {
    const { container } = render(<ExportPanel />);
    expect(container).toBeTruthy();
  });
});
