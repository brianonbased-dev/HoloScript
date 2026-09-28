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
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseHoloStrict } from '../../parser/HoloCompositionParser';
import { Native2DCompiler } from '../Native2DCompiler';
import { ReferenceExporterRegistry } from '../ReferenceExporters';
import type { ExportTarget } from '../CircuitBreaker';

// The Founder Console as shipped: the real studio file, not a copy, so this test cannot pass
// against a console that has drifted from what /quest-proof/native compiles (#411 review).
// The inbox is LIVE: @fetch binds it to /api/quest-proof/inbox, and the first child ("Row")
// is the row template the runtime clones per item with {{field}}.
const FOUNDER_CONSOLE_HOLO = readFileSync(
  new URL('../../../../studio/src/app/quest-proof/native/founder-console.holo', import.meta.url),
  'utf8'
);

const SAMPLE_ITEMS = [
  {
    label: 'Approve $40 GPU spend — fleet B-1 validation',
    url: 'https://holoscript.studio/t/abc/decide?t=1',
    vetting: { glance: 'pre-vetted · tests GREEN · reviewed by /founder' },
  },
  {
    label: 'Approve Base anchor — Paper 17 launch packet',
    url: 'https://holoscript.studio/t/abc/decide?t=2',
    vetting: { glance: 'pre-vetted · calldata verified · reviewed by /critic' },
  },
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
    expect(html).toContain("querySelectorAll('[data-holo-fetch]')"); // the vanilla runtime
    // Approve is a link to the item's url in a new tab, not a click handler (task 3m36).
    expect(html).toContain('href="{{url}}"');
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');

    const out = 'C:/tmp/founder-console-native/console.html';
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, html, 'utf8');
    // eslint-disable-next-line no-console
    console.log(`[artifact] live hydration-free Founder Console -> ${out} (${html.length} bytes)`);
  });

  it('keeps native-2d as a direct compiler path, not a reference exporter', () => {
    const reg = new ReferenceExporterRegistry();
    const retiredTarget = 'native-2d' as unknown as ExportTarget;
    expect(reg.hasExporter(retiredTarget)).toBe(false);
    const comp = parseHoloStrict(FOUNDER_CONSOLE_HOLO);
    expect(reg.export(retiredTarget, comp)).toBeNull();
    const html = new Native2DCompiler().compile(comp, '', undefined, { format: 'html' }) as string;
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Founder Console');
    expect(html).toContain('data-holo-fetch="/api/quest-proof/inbox"');
  });

  it('also compiles to React (proves the compiler does BOTH targets)', () => {
    const comp = parseHoloStrict(FOUNDER_CONSOLE_HOLO);
    const react = new Native2DCompiler().compile(comp, '', undefined, {
      format: 'react',
    }) as string;
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
      console.log(
        '[skip] jsdom unavailable; runtime render proof skipped (wiring asserted structurally)'
      );
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
    const renderedText = Array.from(rendered)
      .map((r) => r.textContent || '')
      .join(' ');
    // live items rendered from the mocked endpoint, tokens interpolated
    expect(renderedText).toContain('Approve $40 GPU spend');
    expect(renderedText).toContain('Approve Base anchor');
    expect(renderedText).toContain('reviewed by /founder');
    expect(renderedText).not.toContain('{{label}}');
    expect(renderedText).not.toContain('{{vetting.glance}}');

    // live counter updated to the item count (hydration-free)
    const pendingCount = doc.querySelector('[data-holo-count-for="items"]');
    expect(pendingCount?.textContent).toBe(String(SAMPLE_ITEMS.length));
    // each rendered Approve link carries its own item's url
    const approveLinks = Array.from(rendered).map((row) => row.querySelector('a[target="_blank"]'));
    expect(approveLinks.map((a) => a?.getAttribute('href'))).toEqual(
      SAMPLE_ITEMS.map((item) => item.url)
    );

    // Emit a visibly-populated snapshot (F.099 show-don't-reference).
    const preview = 'C:/tmp/founder-console-native/console-live-preview.html';
    writeFileSync(preview, dom.serialize(), 'utf8');
    // eslint-disable-next-line no-console
    console.log(`[artifact] live-rendered snapshot (2 sample items) -> ${preview}`);
  }, 120_000);

  // task 3m36: the list runtime fills fetched values into text and web links only. An event
  // handler keeps the template's own text, and a link in any other scheme is cleared. This runs
  // for real (no skip): a guard that can pass without running proves nothing.
  it('fetched values fill text and web links, never an event handler or another scheme', async () => {
    const { JSDOM } = await import('jsdom');
    const source = `composition "FillProbe" {
  object "List" {
    @panel { tag: "section" }
    @fetch { into: "items", endpoint: "/api/probe", method: "GET" }
    object "Row" {
      @panel { tag: "article" }
      object "Name" { @text { content: "{{label}}" } }
      object "Legacy" { @button { content: "Open", onClick: "window.open('{{url}}')" } }
      object "Web" { @link { content: "Web", href: "{{url}}" } }
      object "Other" { @link { content: "Other", href: "{{other}}" } }
    }
  }
}`;
    const html = new Native2DCompiler().compile(parseHoloStrict(source), '', undefined, {
      format: 'html',
    }) as string;
    const items = [
      {
        label: 'First item',
        url: 'https://holoscript.studio/t/abc/decide?t=1',
        other: 'ftp://files.example.com/a.txt',
      },
    ];
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      beforeParse(window) {
        (window as unknown as { fetch: unknown }).fetch = () =>
          Promise.resolve({ json: () => Promise.resolve({ items }) });
      },
    });
    await new Promise((r) => setTimeout(r, 30));

    const row = dom.window.document.querySelector(
      '[data-holo-fetch] > *:not([data-holo-template])'
    );
    expect(row?.textContent).toContain('First item');
    expect(row?.querySelector('button')?.getAttribute('onclick')).toBe("window.open('{{url}}')");
    const links = Array.from(row?.querySelectorAll('a') ?? []).map((a) => a.getAttribute('href'));
    expect(links).toEqual([items[0].url, '']);
  }, 120_000);

  // #411 review (claude3): every URL attribute the runtime gates, every handler name, srcdoc,
  // and the links whose real host hides from a glance. The trait vocabulary cannot emit most of
  // these attributes yet, so they go into the compiled row template directly: the runtime under
  // test is the real one the compiler emits. Ordinary values only.
  it('the list runtime gates every URL attribute, every handler and srcdoc, and hidden-host links', async () => {
    const { JSDOM } = await import('jsdom');
    const source = `composition "FillProbe" {
  object "List" {
    @panel { tag: "section" }
    @fetch { into: "items", endpoint: "/api/probe", method: "GET" }
    object "Row" {
      @panel { tag: "article" }
      object "Name" { @text { content: "{{label}}" } }
    }
  }
}`;
    const compiled = new Native2DCompiler().compile(parseHoloStrict(source), '', undefined, {
      format: 'html',
    }) as string;
    const staging = new JSDOM(compiled);
    const template = staging.window.document.querySelector('[data-holo-template]');
    expect(template).not.toBeNull();
    template!.insertAdjacentHTML(
      'beforeend',
      [
        '<img data-probe="src-web" src="{{url}}">',
        '<img data-probe="src-other" src="{{other}}">',
        '<form data-probe="action-other" action="{{other}}"><button data-probe="formaction-other" formaction="{{other}}">f</button></form>',
        '<video data-probe="poster-other" poster="{{other}}"></video>',
        '<a data-probe="userinfo" href="{{userinfo}}">u</a>',
        '<a data-probe="protocol-relative" href="{{protorel}}">p</a>',
        '<a data-probe="backslash" href="{{backslash}}">b</a>',
        '<a data-probe="same-site-path" href="{{path}}">s</a>',
        '<a data-probe="other-site" href="{{elsewhere}}">e</a>',
        '<div data-probe="handler" onmouseover="go(\'{{url}}\')">h</div>',
        '<iframe data-probe="srcdoc" srcdoc="{{label}}"></iframe>',
      ].join('')
    );
    const items = [
      {
        label: 'First item',
        url: 'https://holoscript.studio/t/abc/decide?t=1',
        other: 'ftp://files.example.com/a.txt',
        userinfo: 'https://holoscript.studio@example.com/x',
        protorel: '//example.com/x',
        backslash: '\\\\example.com/x',
        path: '/quest-proof/native/next',
        elsewhere: 'https://github.com/brianonbased-dev/HoloScript/pull/411',
      },
    ];
    const dom = new JSDOM(staging.serialize(), {
      url: 'https://holoscript.studio/quest-proof/native',
      runScripts: 'dangerously',
      beforeParse(window) {
        (window as unknown as { fetch: unknown }).fetch = () =>
          Promise.resolve({ json: () => Promise.resolve({ items }) });
      },
    });
    await new Promise((r) => setTimeout(r, 30));

    const row = dom.window.document.querySelector(
      '[data-holo-fetch] > *:not([data-holo-template])'
    );
    expect(row?.textContent).toContain('First item');
    const attr = (probe: string, name: string) =>
      row?.querySelector(`[data-probe="${probe}"]`)?.getAttribute(name);
    // A web link fills; any other scheme is cleared, on every attribute the runtime gates.
    expect(attr('src-web', 'src')).toBe(items[0].url);
    expect(attr('src-other', 'src')).toBe('');
    expect(attr('action-other', 'action')).toBe('');
    expect(attr('formaction-other', 'formaction')).toBe('');
    expect(attr('poster-other', 'poster')).toBe('');
    // A user part, a //host form or a backslash form points somewhere a glance does not read.
    expect(attr('userinfo', 'href')).toBe('');
    expect(attr('protocol-relative', 'href')).toBe('');
    expect(attr('backslash', 'href')).toBe('');
    // A path on this site stays; a plain link to another site stays (hosts are not gated here).
    expect(attr('same-site-path', 'href')).toBe('/quest-proof/native/next');
    expect(attr('other-site', 'href')).toBe(items[0].elsewhere);
    // Every handler name, not only onclick, and srcdoc keep the template's own text.
    expect(attr('handler', 'onmouseover')).toBe("go('{{url}}')");
    expect(attr('srcdoc', 'srcdoc')).toBe('{{label}}');
  }, 120_000);
});
