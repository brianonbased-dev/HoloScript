// @vitest-environment jsdom
/**
 * Tests for editorStore (Sprint 16 P1)
 */

import { describe, it, expect, beforeEach } from 'vitest';

const { useEditorStore } = await import('@/lib/stores/editorStore');

function reset() {
  useEditorStore.setState({
    activePanel: 'prompt',
    sidebarOpen: true,
    showGovernancePanel: false,
    showConformancePanel: false,
    diffModeHash: null,
    selectedObjectId: null,
    selectedObjectName: null,
    gizmoMode: 'translate',
    artMode: 'none',
    showBenchmark: false,
    showPerfOverlay: false,
  });
}

describe('editorStore — defaults', () => {
  beforeEach(reset);

  it('activePanel defaults to prompt', () => {
    expect(useEditorStore.getState().activePanel).toBe('prompt');
  });

  it('sidebarOpen defaults to true', () => {
    expect(useEditorStore.getState().sidebarOpen).toBe(true);
  });

  it('gizmoMode defaults to translate', () => {
    expect(useEditorStore.getState().gizmoMode).toBe('translate');
  });

  it('artMode defaults to none', () => {
    expect(useEditorStore.getState().artMode).toBe('none');
  });

  it('selectedObjectId defaults to null', () => {
    expect(useEditorStore.getState().selectedObjectId).toBeNull();
  });

  it('showBenchmark defaults to false', () => {
    expect(useEditorStore.getState().showBenchmark).toBe(false);
  });
});

describe('editorStore — mode switching', () => {
  beforeEach(reset);

  it('setGizmoMode switches to rotate', () => {
    useEditorStore.getState().setGizmoMode('rotate');
    expect(useEditorStore.getState().gizmoMode).toBe('rotate');
  });

  it('setGizmoMode switches to scale', () => {
    useEditorStore.getState().setGizmoMode('scale');
    expect(useEditorStore.getState().gizmoMode).toBe('scale');
  });

  it('setArtMode switches to sketch', () => {
    useEditorStore.getState().setArtMode('sketch');
    expect(useEditorStore.getState().artMode).toBe('sketch');
  });

  it('setArtMode switches to paint', () => {
    useEditorStore.getState().setArtMode('paint');
    expect(useEditorStore.getState().artMode).toBe('paint');
  });

  it('setArtMode switches to generative', () => {
    useEditorStore.getState().setArtMode('generative');
    expect(useEditorStore.getState().artMode).toBe('generative');
  });

  it('setStudioMode switches to expert', () => {
    useEditorStore.getState().setStudioMode('expert');
    expect(useEditorStore.getState().studioMode).toBe('expert');
  });

  it('setStudioMode switches to artist', () => {
    useEditorStore.getState().setStudioMode('artist');
    expect(useEditorStore.getState().studioMode).toBe('artist');
  });

  it('setStudioMode switches to filmmaker', () => {
    useEditorStore.getState().setStudioMode('filmmaker');
    expect(useEditorStore.getState().studioMode).toBe('filmmaker');
  });
});

describe('editorStore — panel toggles', () => {
  beforeEach(reset);

  it('setActivePanel switches panel', () => {
    useEditorStore.getState().setActivePanel('code');
    expect(useEditorStore.getState().activePanel).toBe('code');
    useEditorStore.getState().setActivePanel('tree');
    expect(useEditorStore.getState().activePanel).toBe('tree');
  });

  it('toggleSidebar flips sidebar state', () => {
    expect(useEditorStore.getState().sidebarOpen).toBe(true);
    useEditorStore.getState().toggleSidebar();
    expect(useEditorStore.getState().sidebarOpen).toBe(false);
    useEditorStore.getState().toggleSidebar();
    expect(useEditorStore.getState().sidebarOpen).toBe(true);
  });

  it('setShowGovernancePanel sets governance panel', () => {
    useEditorStore.getState().setShowGovernancePanel(true);
    expect(useEditorStore.getState().showGovernancePanel).toBe(true);
  });

  it('setShowConformancePanel sets conformance panel', () => {
    useEditorStore.getState().setShowConformancePanel(true);
    expect(useEditorStore.getState().showConformancePanel).toBe(true);
  });

  it('togglePerfOverlay flips perf overlay', () => {
    expect(useEditorStore.getState().showPerfOverlay).toBe(false);
    useEditorStore.getState().togglePerfOverlay();
    expect(useEditorStore.getState().showPerfOverlay).toBe(true);
  });
});

describe('editorStore — selection', () => {
  beforeEach(reset);

  it('setSelectedObjectId sets ID only', () => {
    useEditorStore.getState().setSelectedObjectId('node-123');
    expect(useEditorStore.getState().selectedObjectId).toBe('node-123');
    expect(useEditorStore.getState().selectedObjectName).toBeNull();
  });

  it('setSelectedObject sets both ID and name', () => {
    useEditorStore.getState().setSelectedObject('node-456', 'MyCube');
    expect(useEditorStore.getState().selectedObjectId).toBe('node-456');
    expect(useEditorStore.getState().selectedObjectName).toBe('MyCube');
  });

  it('setSelectedObject can clear selection', () => {
    useEditorStore.getState().setSelectedObject('abc', 'Cube');
    useEditorStore.getState().setSelectedObject(null, null);
    expect(useEditorStore.getState().selectedObjectId).toBeNull();
    expect(useEditorStore.getState().selectedObjectName).toBeNull();
  });
});

describe('editorStore — diff mode', () => {
  beforeEach(reset);

  it('setDiffModeHash sets hash', () => {
    useEditorStore.getState().setDiffModeHash('abc123');
    expect(useEditorStore.getState().diffModeHash).toBe('abc123');
  });

  it('setDiffModeHash clears hash', () => {
    useEditorStore.getState().setDiffModeHash('abc123');
    useEditorStore.getState().setDiffModeHash(null);
    expect(useEditorStore.getState().diffModeHash).toBeNull();
  });
});
