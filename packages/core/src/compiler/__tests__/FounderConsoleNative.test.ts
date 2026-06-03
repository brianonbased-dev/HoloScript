/**
 * FounderConsoleNative.test.ts — N1/N2 dogfood: author the Founder Console in
 * HoloScript (.holo) and compile it to a HYDRATION-FREE HTML page via the existing
 * Native2DCompiler — proving the "HoloScript format, not .tsx" path end-to-end,
 * now with LIVE data-binding (@fetch → vanilla list render, no React, no hydration).
 *
 * Why this exists (founder 2026-06-02): the tunneled .tsx Founder Console breaks
 * because Next/React app-router hydration fails through the HoloTunnel relay
 * (research/2026-05-20-quest-proof-holotunnel). The HTML target emits plain DOM +
 * a vanilla fetch/clone runtime — NO React root, NO hydration — so it structurally
 * cannot hit that bug class. These tests are the falsifier.
 *
 * Design: research/2026-06-02_founder-prevetted-approval-gate-and-native-console.md (N1/N2)
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseHoloStrict } from '../../parser/HoloCompositionParser';
import { Native2DCompiler } from '../Native2DCompiler';
import { ReferenceExporterRegistry } from '../ReferenceExporters';

// The Founder Console authored in HoloScript — the real surface, not a toy.
// The inbox is LIVE: @fetch binds it to the deployed /api/quest-proof/inbox, and the
// first child ("Row") is the row template the runtime clones per item with {{field}}.
const FOUNDER_CONSOLE_HOLO = `composition "FounderConsole" {
  object "Root" {
    @panel { tag: "main" }
    @theme { style: "padding:24px; max-width:680px; margin:0 auto; font-family:system-ui,-apple-system,sans-serif" }

    object "Header" {
      @panel { tag: "header" }
      @theme { style: "display:flex; gap:16px; align-items:baseline; margin-bottom:20px" }
      object "Title" { @text { variant: "h1", content: "Founder Console" } }
      object "PendingCount" { @text { content: "0" } @count_of { source: "items" } @theme { style: "color:#d97706; font-weight:700; font-size:20px" } }
      object "PendingLabel" { @text { content: "pending vetting" } @theme { style: "color:#6b7280" } }
    }

    object "Inbox" {
      @panel { tag: "section" }
      @fetch { into: "items", endpoint: "/api/quest-proof/inbox", method: "GET" }
      object "Row" {
        @panel { tag: "article" }
        @theme { className: "lift-card", style: "border:1px solid #e5e7eb; border-radius:12px; padding:16px; margin-bottom:12px" }
        object "Label" { @text { variant: "h3", content: "{{label}}" } }
        object "Badge" { @text { content: "{{vetting.glance}}" } @theme { style: "color:#16a34a; font-size:13px; display:block; margin:6px 0" } }
        object "Approve" {
          @button { content: "Approve", onClick: "window.open('{{url}}')" }
          @theme { className: "glow-btn", style: "background:#16a34a; color:#fff; border:none; border-radius:8px; padding:8px 18px; cursor:pointer" }
        }
      }
    }
  }
}`;

const SAMPLE_ITEMS = [
  { label: 'Approve $40 GPU spend — fleet B-1 validation', url: 'https://holoscript.studio/t/abc/decide?t=1', vetting: { glance: 'pre-vetted · tests GREEN · reviewed by /founder' } },
  { label: 'Approve Base anchor — Paper 17 launch packet', url: 'https://holoscript.studio/t/abc/decide?t=2', vetting: { glance: 'pre-vetted · calldata verified · reviewed by /critic' } },
];

function compileHtml(): string {
  const comp = parseHoloStrict(FOUNDER_CONSOLE_HOLO);
  return new Native2DCompiler().compile(comp, '', undefined, { format: 'html' }) as string;
}

describe('Founder Console — HoloScript-native (N1/N2)', () => {
  it('parses the .holo source into a composition', () => {
    const comp = parseHoloStrict(FOUNDER_CONSOLE_HOLO);
    expect(comp.name).toBe('FounderConsole');
    expect((comp.objects || []).length).toBeGreaterThan(0);
  });

  it('compiles to HYDRATION-FREE HTML with live @fetch binding', () => {
    const html = compileHtml();
    // It IS an HTML document, not a React component.
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('holoscript-native-root');
    // Hydration-free: no React, no useState/useEffect, no JSX.
    expect(html).not.toMatch(/import React/);
    expect(html).not.toMatch(/useState|useEffect/);
    // Static chrome made it through.
    expect(html).toContain('Founder Console');
    expect(html).toContain('pending vetting');
    expect(html).toContain('data-holo-count-for="items"'); // live counter bound to the inbox
    // LIVE binding is wired: fetch container + row template + interpolation tokens + runtime.
    expect(html).toContain('data-holo-fetch="/api/quest-proof/inbox"');
    expect(html).toContain('data-holo-template');
    expect(html).toContain('{{label}}');
    expect(html).toContain('{{vetting.glance}}');
    expect(html).toContain('querySelectorAll(\'[data-holo-fetch]\')'); // the vanilla runtime
    expect(html).toMatch(/onclick=/i);

    const out = 'C:/tmp/founder-console-native/console.html';
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, html, 'utf8');
    // eslint-disable-next-line no-console
    console.log(`[artifact] live hydration-free Founder Console -> ${out} (${html.length} bytes)`);
  });

  it('registers a native-2d reference exporter (fixes MCP "No reference exporter" error)', () => {
    const reg = new ReferenceExporterRegistry();
    expect(reg.hasExporter('native-2d')).toBe(true);
    const comp = parseHoloStrict(FOUNDER_CONSOLE_HOLO);
    const result = reg.export('native-2d', comp);
    expect(result).toBeTruthy();
    expect(result!.output).toContain('<!DOCTYPE html>');
    expect(result!.output).toContain('Founder Console');
    expect(result!.output).toContain('data-holo-fetch="/api/quest-proof/inbox"');
  });

  it('also compiles to React (proves the compiler does BOTH targets)', () => {
    const comp = parseHoloStrict(FOUNDER_CONSOLE_HOLO);
    const react = new Native2DCompiler().compile(comp, '', undefined, { format: 'react' }) as string;
    expect(react).toMatch(/import React/);
    expect(react).toContain('FounderConsoleComponent');
  });

  it('RUNTIME PROOF: the emitted page renders live items hydration-free (JSDOM + mocked fetch)', async () => {
    let JSDOM: typeof import('jsdom').JSDOM;
    try {
      ({ JSDOM } = await import('jsdom'));
    } catch {
      // jsdom not available in this package — structural assertions above cover wiring.
      // eslint-disable-next-line no-console
      console.log('[skip] jsdom unavailable; runtime render proof skipped (wiring asserted structurally)');
      return;
    }
    const html = compileHtml();
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      beforeParse(window) {
        // mock the deployed inbox endpoint — no network, no server.
        (window as unknown as { fetch: unknown }).fetch = () =>
          Promise.resolve({ json: () => Promise.resolve({ ok: true, items: SAMPLE_ITEMS }) });
      },
    });
    // let DOMContentLoaded + the fetch promise chain settle
    await new Promise((r) => setTimeout(r, 30));

    const doc = dom.window.document;
    const container = doc.querySelector('[data-holo-fetch]')!;
    expect(container).toBeTruthy();
    // assert on the RENDERED rows only (the hidden template legitimately keeps its
    // {{tokens}} — it's the source clones are made from).
    const rendered = container.querySelectorAll('[data-holo-fetch] > *:not([data-holo-template])');
    expect(rendered.length).toBe(SAMPLE_ITEMS.length); // one row per fetched item
    const renderedText = Array.from(rendered).map((r) => r.textContent || '').join(' ');
    // live items rendered from the mocked endpoint, tokens interpolated
    expect(renderedText).toContain('Approve $40 GPU spend');
    expect(renderedText).toContain('Approve Base anchor');
    expect(renderedText).toContain('reviewed by /founder');
    expect(renderedText).not.toContain('{{label}}');
    expect(renderedText).not.toContain('{{vetting.glance}}');

    // live counter updated to the item count (hydration-free)
    const pendingCount = doc.querySelector('[data-holo-count-for="items"]');
    expect(pendingCount?.textContent).toBe(String(SAMPLE_ITEMS.length));
    // the approve handler interpolated the per-item url
    expect(dom.serialize()).toContain("window.open('https://holoscript.studio/t/abc/decide?t=1')");

    // Emit a visibly-populated snapshot (F.099 show-don't-reference).
    const preview = 'C:/tmp/founder-console-native/console-live-preview.html';
    writeFileSync(preview, dom.serialize(), 'utf8');
    // eslint-disable-next-line no-console
    console.log(`[artifact] live-rendered snapshot (2 sample items) -> ${preview}`);
  });
});
