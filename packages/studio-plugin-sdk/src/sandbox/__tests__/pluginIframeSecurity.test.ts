import { describe, expect, it } from 'vitest';
import {
  assertSafePluginModuleUrl,
  escapeHtmlDoubleQuotedAttr,
  escapeHtmlTextContent,
} from '../pluginIframeSecurity.js';

describe('pluginIframeSecurity', () => {
  it('assertSafePluginModuleUrl accepts plain https URLs', () => {
    expect(assertSafePluginModuleUrl('https://cdn.example.com/p/index.js')).toBe(
      'https://cdn.example.com/p/index.js'
    );
  });

  it('assertSafePluginModuleUrl rejects javascript: and file:', () => {
    expect(() => assertSafePluginModuleUrl('javascript:alert(1)')).toThrow(/http/);
    expect(() => assertSafePluginModuleUrl('file:///etc/passwd')).toThrow(/http/);
  });

  it('assertSafePluginModuleUrl rejects credentials in URL', () => {
    expect(() => assertSafePluginModuleUrl('https://user:pass@example.com/x.js')).toThrow(
      /credentials/
    );
  });

  it('assertSafePluginModuleUrl rejects breakout characters', () => {
    expect(() => assertSafePluginModuleUrl('https://x.test/a"><script>')).toThrow(
      /disallowed/
    );
    expect(() => assertSafePluginModuleUrl('https://x.test/a\n/b')).toThrow(/disallowed/);
  });

  it('escapeHtmlTextContent escapes markup', () => {
    expect(escapeHtmlTextContent('a<b>&"\'')).toBe('a&lt;b&gt;&amp;&quot;&#39;');
  });

  it('escapeHtmlDoubleQuotedAttr escapes quotes and ampersands', () => {
    expect(escapeHtmlDoubleQuotedAttr('a & b "c" <')).toBe('a &amp; b &quot;c&quot; &lt;');
  });
});
