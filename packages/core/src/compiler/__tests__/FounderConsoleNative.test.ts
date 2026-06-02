/**
 * FounderConsoleNative.test.ts — N1/N2 dogfood: author the Founder Console in
 * HoloScript (.holo) and compile it to a HYDRATION-FREE HTML page via the existing
 * Native2DCompiler — proving the "HoloScript format, not .tsx" path end-to-end.
 *
 * Why this exists (founder 2026-06-02): the tunneled .tsx Founder Console breaks
 * because Next/React app-router hydration fails through the HoloTunnel relay
 * (research/2026-05-20-quest-proof-holotunnel). The HTML target emits plain DOM +
 * inline handlers — NO React root, NO hydration — so it structurally cannot hit
 * that bug class. This test is the falsifier: it fails if the compiler can't
 * produce a working, hydration-free console from .holo.
 *
 * Design: research/2026-06-02_founder-prevetted-approval-gate-and-native-console.md (N1/N2)
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseHoloStrict } from '../../parser/HoloCompositionParser';
import { Native2DCompiler } from '../Native2DCompiler';

// The Founder Console authored in HoloScript — the real surface, not a toy.
const FOUNDER_CONSOLE_HOLO = `composition "FounderConsole" {
  object "Root" {
    @panel { tag: "main" }
    @theme { style: "padding:24px; max-width:680px; margin:0 auto; font-family:system-ui,-apple-system,sans-serif" }

    object "Header" {
      @panel { tag: "header" }
      @theme { style: "display:flex; gap:16px; align-items:baseline; margin-bottom:20px" }
      object "Title" { @text { variant: "h1", content: "Founder Console" } }
      object "Pending" { @text { content: "3 pending vetting" } @theme { style: "color:#d97706; font-weight:600" } }
      object "Bounced" { @text { content: "1 bounced today" } @theme { style: "color:#dc2626; font-weight:600" } }
    }

    object "Item" {
      @panel { tag: "section" }
      @theme { className: "lift-card", style: "border:1px solid #e5e7eb; border-radius:12px; padding:16px; margin-bottom:12px" }
      object "Label" { @text { variant: "h3", content: "Approve $40 GPU spend — fleet B-1 validation" } }
      object "Badge" { @text { content: "pre-vetted - tests GREEN - reviewed by /founder" } @theme { style: "color:#16a34a; font-size:13px; display:block; margin:6px 0" } }
      object "Approve" {
        @button { content: "Approve", onClick: "window.open('/api/quest-proof/decide')" }
        @theme { className: "glow-btn", style: "background:#16a34a; color:#fff; border:none; border-radius:8px; padding:8px 18px; cursor:pointer" }
      }
    }
  }
}`;

describe('Founder Console — HoloScript-native (N1/N2)', () => {
  it('parses the .holo source into a composition', () => {
    const comp = parseHoloStrict(FOUNDER_CONSOLE_HOLO);
    expect(comp).toBeTruthy();
    expect(comp.name).toBe('FounderConsole');
    expect((comp.objects || []).length).toBeGreaterThan(0);
  });

  it('compiles to HYDRATION-FREE HTML (no React root, no hydration) — removes the .tsx tunnel bug class', () => {
    const comp = parseHoloStrict(FOUNDER_CONSOLE_HOLO);
    const html = new Native2DCompiler().compile(comp, '', undefined, { format: 'html' }) as string;

    // It IS an HTML document, not a React component.
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('holoscript-native-root');
    // Hydration-free: no React import, no useState/useEffect, no JSX.
    expect(html).not.toMatch(/import React/);
    expect(html).not.toMatch(/useState|useEffect/);
    // The real console content made it through.
    expect(html).toContain('Founder Console');
    expect(html).toContain('pending vetting');
    expect(html).toContain('bounced today');
    expect(html).toContain('GPU spend');
    expect(html).toContain('pre-vetted');
    expect(html).toContain('Approve');
    // Interactivity is plain inline DOM handler — works without hydration.
    expect(html).toMatch(/onclick=/i);

    // Emit the artifact (the F.099 "show, don't reference" receipt).
    const out = 'C:/tmp/founder-console-native/console.html';
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, html, 'utf8');
    // eslint-disable-next-line no-console
    console.log(`[artifact] hydration-free Founder Console HTML -> ${out} (${html.length} bytes)`);
  });

  it('also compiles to React (proves the compiler does BOTH targets)', () => {
    const comp = parseHoloStrict(FOUNDER_CONSOLE_HOLO);
    const react = new Native2DCompiler().compile(comp, '', undefined, { format: 'react' }) as string;
    expect(react).toMatch(/import React/);
    expect(react).toContain('FounderConsoleComponent');
    expect(react).toContain('Founder Console');
  });
});
