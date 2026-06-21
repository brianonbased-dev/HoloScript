// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { HotkeyMapOverlay } from '../../../components/hotkeys/HotkeyMapOverlay';
import { DragonPreviewComponent } from '../../../components/panels/native/dragonPreview.native';
import { VersionHistoryPanel } from '../../../components/versionControl/VersionHistoryPanel';

afterEach(cleanup);

describe('view registry component spot renders', () => {
  it('renders a generated native panel', () => {
    render(<DragonPreviewComponent />);

    expect(screen.getByText('Dragon Preview')).toBeInTheDocument();
    expect(screen.getByText('No dragon asset loaded')).toBeInTheDocument();
  });

  it('renders a modal slotted panel', () => {
    render(<HotkeyMapOverlay open onClose={vi.fn()} />);

    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    expect(screen.getByText('Scene')).toBeInTheDocument();
  });

  it('renders a right-rail slotted panel', () => {
    render(<VersionHistoryPanel onClose={vi.fn()} />);

    expect(screen.getByText('Version History')).toBeInTheDocument();
    expect(screen.getByText('Current State')).toBeInTheDocument();
  });
});
