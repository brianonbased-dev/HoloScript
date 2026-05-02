// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/stores', () => ({
  useCharacterStore: (selector: (s: unknown) => unknown) =>
    selector({ morphTargets: {}, skinColor: '#fff', equippedItems: {}, glbUrl: null }),
}));

import { ExportPanel } from '../export/ExportPanel';

describe('ExportPanel', () => {
  it('renders without crashing', () => {
    // If the component has heavy requirements (e.g. providers, store state), 
    // we use a simple shallow or context-wrapped render.
    // For now, this is a structural smoke test that asserts it binds properly.
    const { container } = render(<ExportPanel />);
    expect(container).toBeTruthy();
  });
});
