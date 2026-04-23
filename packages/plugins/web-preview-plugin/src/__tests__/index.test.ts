import { describe, it, expect } from 'vitest';
import { embedWebPreview } from '../index';

describe('web-preview-plugin stub', () => {
  it('emits @web_surface trait with default sandbox', () => {
    const r = embedWebPreview({ url: 'https://example.com/widget', size: [800, 600] });
    expect(r.trait.kind).toBe('@web_surface');
    expect(r.effective_sandbox).toContain('allow-scripts');
    expect(r.security_warnings).toEqual([]);
  });

  it('warns when dangerous sandbox tokens present', () => {
    const r = embedWebPreview({
      url: 'https://example.com',
      size: [100, 100],
      sandbox: ['allow-scripts', 'allow-same-origin'],
    });
    expect(r.security_warnings.some((w) => w.includes('allow-same-origin'))).toBe(true);
  });

  it('warns on non-HTTPS URL (except localhost)', () => {
    const r = embedWebPreview({ url: 'http://example.com', size: [100, 100] });
    expect(r.security_warnings.some((w) => w.includes('non-HTTPS'))).toBe(true);
    const ok = embedWebPreview({ url: 'http://localhost:3000', size: [100, 100] });
    expect(ok.security_warnings.some((w) => w.includes('non-HTTPS'))).toBe(false);
  });

  it('warns on mic/camera without origin_whitelist', () => {
    const r = embedWebPreview({ url: 'https://x.com', size: [100, 100], allow_mic: true });
    expect(r.security_warnings.some((w) => w.includes('origin_whitelist'))).toBe(true);
  });
});
