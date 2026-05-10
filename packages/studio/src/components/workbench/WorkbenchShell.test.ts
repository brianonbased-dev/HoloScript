import { describe, expect, it } from 'vitest';

import { resolveWorkbenchLayout } from './WorkbenchShell';

describe('resolveWorkbenchLayout', () => {
  it('uses default layout values when no persisted layout exists', () => {
    expect(resolveWorkbenchLayout()).toEqual({
      primarySidebarOpen: true,
      inspectorOpen: false,
      bottomPanelOpen: true,
      primarySidebarWidth: 248,
      inspectorWidth: 320,
      bottomPanelHeight: 168,
    });
  });

  it('clamps persisted dimensions while preserving panel visibility', () => {
    expect(
      resolveWorkbenchLayout({
        primarySidebarOpen: false,
        inspectorOpen: true,
        bottomPanelOpen: false,
        primarySidebarWidth: 20,
        inspectorWidth: 999,
        bottomPanelHeight: 48,
      })
    ).toEqual({
      primarySidebarOpen: false,
      inspectorOpen: true,
      bottomPanelOpen: false,
      primarySidebarWidth: 180,
      inspectorWidth: 520,
      bottomPanelHeight: 96,
    });
  });
});
