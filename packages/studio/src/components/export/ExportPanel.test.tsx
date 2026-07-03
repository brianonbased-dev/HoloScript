// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSceneStore } from '@/lib/stores';
import { ExportPanel } from './ExportPanel';

const mocks = vi.hoisted(() => ({
  exportScene: vi.fn(),
}));

vi.mock('@/hooks/useSceneExport', () => ({
  useSceneExport: () => ({
    status: 'idle',
    error: null,
    exportScene: mocks.exportScene,
  }),
}));

describe('ExportPanel', () => {
  beforeEach(() => {
    mocks.exportScene.mockReset();
    useSceneStore.setState({ code: 'composition "RegistryContract" {}' });
  });

  it('shows Export SDK as a first-class Studio export target', () => {
    render(<ExportPanel onClose={() => {}} />);

    expect(screen.getByText('Export SDK')).toBeInTheDocument();
    expect(screen.getByText('.sdk.json')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Export SDK').closest('button')!);

    expect(screen.getByText('SDK bundle contents')).toBeInTheDocument();
    expect(screen.getByText('sdk-compiler-receipt.json')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^export sdk$/i }));

    expect(mocks.exportScene).toHaveBeenCalledWith('sdk', undefined);
  });
});
