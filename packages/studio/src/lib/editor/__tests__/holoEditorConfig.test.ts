import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getEditorConfig } from '../holoEditorConfig';

// The editor config is compiled from holoscript-editor.hs and saved as JSON. Saved as
// `.holo` it went through Studio's HoloScript loader instead of being read as data, and
// once the parser refused JSON (#542) that failed every Studio build.
describe('holoEditorConfig', () => {
  it('is the compiled config itself, read as data', () => {
    const onDisk = JSON.parse(
      readFileSync(new URL('../../../../holoscript-editor.json', import.meta.url), 'utf8')
    );
    const config = getEditorConfig();
    expect(config).toEqual(onDisk);
    expect(config.code_editor?.language).toBe('holoscript');
    expect(config.lsp_client?.diagnostics_debounce_ms).toBe(750);
  });
});
