/**
 * escapeStringValue — Security tests for Cross-Agent Compilation Injection (CWE-94)
 *
 * Validates that string escaping prevents injection attacks across all
 * supported compilation targets. Each target has unique escaping requirements.
 *
 * @see CompilerBase.ts for the escapeStringValue implementation
 * @version 1.0.0
 */
import { describe, it, expect } from 'vitest';
import { escapeStringValue, type EscapeTarget } from '../CompilerBase';

// ---------------------------------------------------------------------------
// Injection payloads — real attack vectors
// ---------------------------------------------------------------------------
const PAYLOADS = {
  // CWE-94: Code injection via string termination + arbitrary code
  csharpInjection: '"; System.Diagnostics.Process.Start("cmd.exe"); //',
  gdscriptInjection: '"; OS.execute("rm", ["-rf", "/"]); #',
  swiftInjection: '"; import Foundation; FileManager.default.removeItem(atPath: "/"); //',
  kotlinInjection: '"; Runtime.getRuntime().exec("rm -rf /"); //',

  // Path traversal via backslash manipulation
  pathTraversal: '..\\..\\..\\etc\\passwd',

  // Newline injection — breaks out of string into next line of code
  newlineInjection: 'hello\nworld\r\nfoo',

  // Tab injection
  tabInjection: 'hello\tworld',

  // Null byte injection — truncates strings in some languages
  nullByteInjection: 'hello\0world',

  // JSX/XML injection — breaks out of attribute/content
  xmlInjection: '"><script>alert(1)</script><div class="',
  jsxInjection: '{"} + require("child_process").execSync("id") + {"',

  // Shader preprocessor injection
  shaderInjection: '*/ #include "/dev/stdin" /*',

  // Python string injection
  pythonInjection: '"; import os; os.system("rm -rf /"); #',

  // Lua string injection
  luaInjection: '"; os.execute("rm -rf /"); --',

  // JSON injection
  jsonInjection: '","injected":"value',

  // USD injection
  usdInjection: '"\n    custom string injected = "evil',
};

// ---------------------------------------------------------------------------
// C-style targets (CSharp, Swift, Kotlin, TypeScript, Solidity, Rust)
// ---------------------------------------------------------------------------
describe('escapeStringValue — C-style targets', () => {
  const cStyleTargets: EscapeTarget[] = [
    'CSharp',
    'Swift',
    'Kotlin',
    'TypeScript',
    'Solidity',
    'Rust',
  ];

  for (const target of cStyleTargets) {
    describe(target, () => {
      it('escapes double quotes', () => {
        const result = escapeStringValue('"hello"', target);
        expect(result).toBe('\\"hello\\"');
        expect(result).not.toContain('""');
      });

      it('escapes single quotes', () => {
        const result = escapeStringValue("it's", target);
        expect(result).toBe("it\\'s");
      });

      it('escapes backslashes', () => {
        const result = escapeStringValue('path\\to\\file', target);
        expect(result).toBe('path\\\\to\\\\file');
      });

      it('escapes newlines', () => {
        const result = escapeStringValue('line1\nline2', target);
        expect(result).toBe('line1\\nline2');
        expect(result).not.toContain('\n');
      });

      it('escapes carriage returns', () => {
        const result = escapeStringValue('line1\rline2', target);
        expect(result).toBe('line1\\rline2');
        expect(result).not.toContain('\r');
      });

      it('escapes tabs', () => {
        const result = escapeStringValue('col1\tcol2', target);
        expect(result).toBe('col1\\tcol2');
        expect(result).not.toContain('\t');
      });

      it('escapes null bytes', () => {
        const result = escapeStringValue('hello\0world', target);
        expect(result).toBe('hello\\0world');
        expect(result).not.toContain('\0');
      });

      it('blocks code injection payload', () => {
        const result = escapeStringValue(PAYLOADS.csharpInjection, target);
        // The escaped result must not contain an unescaped double quote
        // that would terminate the string literal
        expect(result).not.toMatch(/[^\\]"/);
        expect(result).not.toMatch(/^"/);
      });

      it('blocks path traversal payload', () => {
        const result = escapeStringValue(PAYLOADS.pathTraversal, target);
        // All backslashes must be doubled
        expect(result).toBe('..\\\\..\\\\..\\\\etc\\\\passwd');
      });

      it('blocks newline injection payload', () => {
        const result = escapeStringValue(PAYLOADS.newlineInjection, target);
        expect(result).not.toContain('\n');
        expect(result).not.toContain('\r');
      });

      it('returns empty/falsy values unchanged', () => {
        expect(escapeStringValue('', target)).toBe('');
        expect(escapeStringValue(null as any, target)).toBe(null);
        expect(escapeStringValue(undefined as any, target)).toBe(undefined);
      });

      it('leaves safe strings unchanged', () => {
        expect(escapeStringValue('hello world', target)).toBe('hello world');
        expect(escapeStringValue('abc123', target)).toBe('abc123');
      });
    });
  }
});

// ---------------------------------------------------------------------------
// GDScript target
// ---------------------------------------------------------------------------
describe('escapeStringValue — GDScript', () => {
  const target: EscapeTarget = 'GDScript';

  it('escapes double quotes', () => {
    expect(escapeStringValue('"hello"', target)).toBe('\\"hello\\"');
  });

  it('escapes backslashes', () => {
    expect(escapeStringValue('path\\file', target)).toBe('path\\\\file');
  });

  it('escapes newlines', () => {
    expect(escapeStringValue('a\nb', target)).toBe('a\\nb');
  });

  it('escapes tabs', () => {
    expect(escapeStringValue('a\tb', target)).toBe('a\\tb');
  });

  it('strips null bytes (not supported in GDScript strings)', () => {
    const result = escapeStringValue('hello\0world', target);
    expect(result).not.toContain('\0');
  });

  it('blocks GDScript injection payload', () => {
    const result = escapeStringValue(PAYLOADS.gdscriptInjection, target);
    expect(result).not.toMatch(/[^\\]"/);
    expect(result).not.toMatch(/^"/);
  });
});

// ---------------------------------------------------------------------------
// JSX target
// ---------------------------------------------------------------------------
describe('escapeStringValue — JSX', () => {
  const target: EscapeTarget = 'JSX';

  it('escapes angle brackets', () => {
    expect(escapeStringValue('<script>', target)).toBe('&lt;script&gt;');
  });

  it('escapes ampersand', () => {
    expect(escapeStringValue('a&b', target)).toBe('a&amp;b');
  });

  it('escapes curly braces', () => {
    expect(escapeStringValue('{code}', target)).toBe('&#123;code&#125;');
  });

  it('escapes double quotes', () => {
    expect(escapeStringValue('"hello"', target)).toBe('&quot;hello&quot;');
  });

  it('blocks JSX injection payload', () => {
    const result = escapeStringValue(PAYLOADS.jsxInjection, target);
    expect(result).not.toContain('{');
    expect(result).not.toContain('}');
    expect(result).not.toContain('"');
  });

  it('blocks XSS injection payload', () => {
    const result = escapeStringValue(PAYLOADS.xmlInjection, target);
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });
});

// ---------------------------------------------------------------------------
// XML target
// ---------------------------------------------------------------------------
describe('escapeStringValue — XML', () => {
  const target: EscapeTarget = 'XML';

  it('escapes angle brackets', () => {
    expect(escapeStringValue('<tag>', target)).toBe('&lt;tag&gt;');
  });

  it('escapes ampersand', () => {
    expect(escapeStringValue('a&b', target)).toBe('a&amp;b');
  });

  it('escapes double quotes', () => {
    expect(escapeStringValue('"hello"', target)).toBe('&quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeStringValue("it's", target)).toBe('it&apos;s');
  });

  it('blocks XML injection payload (android:label attack)', () => {
    const result = escapeStringValue(PAYLOADS.xmlInjection, target);
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).not.toContain('"');
  });
});

// ---------------------------------------------------------------------------
// Shader targets (GLSL, HLSL, WGSL)
// ---------------------------------------------------------------------------
describe('escapeStringValue — Shader targets', () => {
  const shaderTargets: EscapeTarget[] = ['GLSL', 'HLSL', 'WGSL'];

  for (const target of shaderTargets) {
    describe(target, () => {
      it('strips comment closers', () => {
        const result = escapeStringValue('*/', target);
        expect(result).not.toContain('*');
        expect(result).not.toContain('/');
      });

      it('strips preprocessor directives', () => {
        const result = escapeStringValue('#include', target);
        expect(result).not.toContain('#');
      });

      it('strips backslashes (line continuations)', () => {
        const result = escapeStringValue('a\\b', target);
        expect(result).not.toContain('\\');
      });

      it('collapses newlines to spaces', () => {
        const result = escapeStringValue('a\nb', target);
        expect(result).toBe('a b');
      });

      it('blocks shader injection payload', () => {
        const result = escapeStringValue(PAYLOADS.shaderInjection, target);
        expect(result).not.toContain('#');
        expect(result).not.toContain('*/');
        expect(result).not.toContain('/*');
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Python target
// ---------------------------------------------------------------------------
describe('escapeStringValue — Python', () => {
  const target: EscapeTarget = 'Python';

  it('escapes double quotes', () => {
    expect(escapeStringValue('"hello"', target)).toBe('\\"hello\\"');
  });

  it('escapes null bytes', () => {
    const result = escapeStringValue('a\0b', target);
    expect(result).toBe('a\\x00b');
    expect(result).not.toContain('\0');
  });

  it('blocks Python injection payload', () => {
    const result = escapeStringValue(PAYLOADS.pythonInjection, target);
    expect(result).not.toMatch(/[^\\]"/);
    expect(result).not.toMatch(/^"/);
  });
});

// ---------------------------------------------------------------------------
// Lua target
// ---------------------------------------------------------------------------
describe('escapeStringValue — Lua', () => {
  const target: EscapeTarget = 'Lua';

  it('escapes double quotes', () => {
    expect(escapeStringValue('"hello"', target)).toBe('\\"hello\\"');
  });

  it('blocks Lua injection payload', () => {
    const result = escapeStringValue(PAYLOADS.luaInjection, target);
    expect(result).not.toMatch(/[^\\]"/);
    expect(result).not.toMatch(/^"/);
  });
});

// ---------------------------------------------------------------------------
// USD target
// ---------------------------------------------------------------------------
describe('escapeStringValue — USD', () => {
  const target: EscapeTarget = 'USD';

  it('escapes double quotes', () => {
    expect(escapeStringValue('"hello"', target)).toBe('\\"hello\\"');
  });

  it('escapes newlines', () => {
    expect(escapeStringValue('a\nb', target)).toBe('a\\nb');
  });

  it('blocks USD injection payload', () => {
    const result = escapeStringValue(PAYLOADS.usdInjection, target);
    expect(result).not.toContain('\n');
    expect(result).not.toMatch(/[^\\]"/);
  });
});

// ---------------------------------------------------------------------------
// JSON target
// ---------------------------------------------------------------------------
describe('escapeStringValue — JSON', () => {
  const target: EscapeTarget = 'JSON';

  it('escapes double quotes', () => {
    expect(escapeStringValue('"hello"', target)).toBe('\\"hello\\"');
  });

  it('escapes control characters as unicode escapes', () => {
    const result = escapeStringValue('\x01\x1f', target);
    expect(result).toBe('\\u0001\\u001f');
  });

  it('blocks JSON injection payload', () => {
    const result = escapeStringValue(PAYLOADS.jsonInjection, target);
    expect(result).not.toMatch(/[^\\]"/);
    expect(result).not.toMatch(/^"/);
  });

  it('produces valid JSON when wrapped in quotes', () => {
    const escaped = escapeStringValue(PAYLOADS.jsonInjection, target);
    const json = `"${escaped}"`;
    expect(() => JSON.parse(json)).not.toThrow();
    // Parsed value should be the original payload (round-trip)
    expect(JSON.parse(json)).toBe(PAYLOADS.jsonInjection);
  });
});

// ---------------------------------------------------------------------------
// Cross-target: wrong target detection (semantic correctness)
// ---------------------------------------------------------------------------
describe('escapeStringValue — target-specific behavior differences', () => {
  it('GDScript strips null bytes while CSharp escapes them', () => {
    const gdResult = escapeStringValue('a\0b', 'GDScript');
    const csResult = escapeStringValue('a\0b', 'CSharp');
    // GDScript strips \0
    expect(gdResult).toBe('ab');
    // CSharp escapes \0
    expect(csResult).toBe('a\\0b');
  });

  it('XML uses entity encoding while CSharp uses backslash escaping', () => {
    const xmlResult = escapeStringValue('"hello"', 'XML');
    const csResult = escapeStringValue('"hello"', 'CSharp');
    expect(xmlResult).toBe('&quot;hello&quot;');
    expect(csResult).toBe('\\"hello\\"');
  });

  it('GLSL strips dangerous chars while TypeScript escapes them', () => {
    const glslResult = escapeStringValue('a\\b', 'GLSL');
    const tsResult = escapeStringValue('a\\b', 'TypeScript');
    expect(glslResult).toBe('ab');
    expect(tsResult).toBe('a\\\\b');
  });
});
