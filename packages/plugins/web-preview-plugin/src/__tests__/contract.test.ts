/**
 * @holoscript/web-preview-plugin — ADAPTER CONTRACT TEST
 *
 * Universal-IR coverage row 15 (web-surface iframe embed). Security warnings
 * MUST fire on: dangerous sandbox tokens, non-HTTPS URLs, and mic/camera
 * allowance without an origin whitelist.
 */
import { describe, it, expect } from 'vitest';
import * as mod from '../index';
import { embedWebPreview, type WebPreviewEmbed } from '../index';

function fixture(overrides: Partial<WebPreviewEmbed> = {}): WebPreviewEmbed {
  return {
    url: 'https://studio.holoscript.net/preview/1',
    size: [1024, 768],
    ...overrides,
  };
}

describe('CONTRACT: web-preview-plugin adapter', () => {
  it('exposes embedWebPreview at stable public path', () => {
    expect(typeof mod.embedWebPreview).toBe('function');
  });

  it('trait.kind = @web_surface, target_id = URL', () => {
    const r = embedWebPreview(fixture());
    expect(r.trait.kind).toBe('@web_surface');
    expect(r.trait.target_id).toBe('https://studio.holoscript.net/preview/1');
  });

  it('default sandbox applied when none provided', () => {
    const r = embedWebPreview(fixture());
    expect(r.trait.params.sandbox).toEqual(['allow-scripts', 'allow-forms']);
  });

  it('dangerous sandbox token (allow-same-origin) produces a security warning', () => {
    const r = embedWebPreview(fixture({ sandbox: ['allow-scripts', 'allow-same-origin'] }));
    expect(r.security_warnings.some((w) => /allow-same-origin/.test(w))).toBe(true);
  });

  it('dangerous sandbox token (allow-top-navigation) produces a security warning', () => {
    const r = embedWebPreview(fixture({ sandbox: ['allow-top-navigation'] }));
    expect(r.security_warnings.some((w) => /allow-top-navigation/.test(w))).toBe(true);
  });

  it('non-HTTPS non-localhost URL produces a security warning', () => {
    const r = embedWebPreview(fixture({ url: 'http://evil.test/x' }));
    expect(r.security_warnings.some((w) => /HTTPS|non-HTTPS/.test(w))).toBe(true);
  });

  it('localhost URL is NOT warned even if http://', () => {
    const r = embedWebPreview(fixture({ url: 'http://localhost:3000/preview' }));
    expect(r.security_warnings.some((w) => /HTTPS|non-HTTPS/.test(w))).toBe(false);
  });

  it('unparseable URL produces a warning', () => {
    const r = embedWebPreview(fixture({ url: 'not-a-url' }));
    expect(r.security_warnings.some((w) => /URL/.test(w))).toBe(true);
  });

  it('mic/camera allowance without origin_whitelist produces a warning', () => {
    const r = embedWebPreview(fixture({ allow_mic: true }));
    expect(r.security_warnings.some((w) => /mic|camera|whitelist/.test(w))).toBe(true);
  });

  it('mic/camera allowance WITH origin_whitelist does not warn on that axis', () => {
    const r = embedWebPreview(fixture({
      allow_mic: true,
      origin_whitelist: ['https://trusted.example.com'],
    }));
    expect(r.security_warnings.some((w) => /accept-all/.test(w))).toBe(false);
  });

  it('effective_sandbox is the sandbox array joined by spaces', () => {
    const r = embedWebPreview(fixture({ sandbox: ['allow-scripts', 'allow-forms'] }));
    expect(r.effective_sandbox).toBe('allow-scripts allow-forms');
  });

  it('default position = [0,0,0] when not provided', () => {
    const r = embedWebPreview(fixture());
    expect(r.trait.params.position).toEqual([0, 0, 0]);
  });
});
