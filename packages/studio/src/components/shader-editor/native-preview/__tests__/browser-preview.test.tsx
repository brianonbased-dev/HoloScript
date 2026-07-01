// @vitest-environment jsdom

import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NativeShaderPreview } from '../NativeShaderPreview';
import { useShaderPreview } from '../useShaderPreview';

const FRAGMENT_SHADER = `
void main() {
  gl_FragColor = vec4(0.2, 0.6, 1.0, 1.0);
}`;

describe('browser shader preview', () => {
  it('initializes and starts a browser preview without Tauri IPC', async () => {
    const { result, unmount } = renderHook(() => useShaderPreview(1000));

    await act(async () => {
      await result.current[1].init(320, 180, FRAGMENT_SHADER);
    });

    expect(result.current[0].ready).toBe(true);
    expect(result.current[0].error).toBeNull();
    expect(result.current[0].frameDataUri).toMatch(/^data:image\//);
    expect(result.current[0].isTauri).toBe(false);

    act(() => {
      result.current[1].start();
    });

    await waitFor(() => {
      expect(result.current[0].ready).toBe(true);
      expect(result.current[0].error).toBeNull();
    });

    unmount();
  });

  it('does not retain the deleted Tauri shader preview invoke contract', () => {
    const source = readFileSync(
      path.resolve(
        process.cwd(),
        'src/components/shader-editor/native-preview/useShaderPreview.ts'
      ),
      'utf8'
    );

    expect(source).not.toContain('@tauri-apps/api/core');
    expect(source).not.toContain('shader_preview_');
  });

  it('renders the primary browser path instead of the Tauri-only message', async () => {
    render(<NativeShaderPreview shaderCode={FRAGMENT_SHADER} width={320} height={180} />);

    expect(screen.queryByText(/Requires HoloScript Studio Desktop/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Browser Shader Preview/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByAltText('Shader Preview')).toBeInTheDocument();
    });
  });
});
