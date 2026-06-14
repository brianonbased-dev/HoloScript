/**
 * vector2d/emit.ts — shared HoloScript → SVG/JSX emit vocabulary.
 *
 * Factored out of Vector2DCompiler (2026-06-14, paper "Compile the Surface" E2 STEP 1) so the
 * forthcoming PanelWidgetCompiler can REUSE the same byte-stable primitive/radar emitters and
 * property accessors instead of forking them (which would let the chart vocabulary drift between
 * the page target and the panel-widget target). Behaviour is byte-identical to the original
 * inline definitions — guarded by compiler/__tests__/Vector2DCompiler.test.ts (golden snapshot).
 *
 * Determinism contract: every helper here is pure and order-stable — coords rounded via f1,
 * text escaped via esc, no Date / Math.random / uuid. Callers MUST preserve input iteration
 * order to keep emitted output hash-stable.
 */

import type { HoloObjectDecl, HoloObjectProperty } from '../../parser/HoloCompositionTypes';

// ── property access (HoloObjectProperty is { key, value }; value may be raw or { value }) ──
export function rawVal(v: unknown): unknown {
  if (v && typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
    return (v as Record<string, unknown>).value;
  }
  return v;
}
export function propOf(obj: HoloObjectDecl, key: string): unknown {
  const props = (obj.properties || []) as HoloObjectProperty[];
  const hit = props.find((p) => (p as unknown as { key: string }).key === key);
  return hit ? rawVal((hit as unknown as { value: unknown }).value) : undefined;
}
export function numProp(obj: HoloObjectDecl, key: string, d: number): number {
  const v = propOf(obj, key);
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : d;
}
export function strProp(obj: HoloObjectDecl, key: string, d = ''): string {
  const v = propOf(obj, key);
  return v == null ? d : String(v);
}
export function numList(s: string): number[] {
  return s
    .split(/[,\s]+/)
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x));
}
export const f1 = (x: number) => Number(x.toFixed(1));
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── SVG element emit (returns JSX strings) ──────────────────────────────────────
export function emitPrimitive(obj: HoloObjectDecl, kind: string): string[] {
  switch (kind) {
    case 'line':
      return [
        `<line x1={${numProp(obj, 'x1', 0)}} y1={${numProp(obj, 'y1', 0)}} x2={${numProp(obj, 'x2', 0)}} y2={${numProp(obj, 'y2', 0)}} stroke="${strProp(obj, 'stroke', 'currentColor')}" strokeWidth={${numProp(obj, 'strokeWidth', 1)}} strokeOpacity={${numProp(obj, 'strokeOpacity', 1)}} />`,
      ];
    case 'circle':
      return [
        `<circle cx={${numProp(obj, 'cx', 0)}} cy={${numProp(obj, 'cy', 0)}} r={${numProp(obj, 'r', 1)}} fill="${strProp(obj, 'fill', 'none')}" stroke="${strProp(obj, 'stroke', 'none')}" strokeWidth={${numProp(obj, 'strokeWidth', 1)}} />`,
      ];
    case 'polyline':
    case 'polygon': {
      const pts = strProp(obj, 'points');
      const tag = kind === 'polygon' ? 'polygon' : 'polyline';
      return [
        `<${tag} points="${pts}" fill="${strProp(obj, 'fill', 'none')}" fillOpacity={${numProp(obj, 'fillOpacity', 1)}} stroke="${strProp(obj, 'stroke', 'currentColor')}" strokeWidth={${numProp(obj, 'strokeWidth', 1)}} strokeLinejoin="round" />`,
      ];
    }
    case 'text':
      return [
        `<text x={${numProp(obj, 'x', 0)}} y={${numProp(obj, 'y', 0)}} textAnchor="${strProp(obj, 'anchor', 'start')}" dominantBaseline="middle" fontSize={${numProp(obj, 'size', 12)}} fontWeight={${numProp(obj, 'weight', 400)}} fill="${strProp(obj, 'fill', 'currentColor')}">${esc(strProp(obj, 'content'))}</text>`,
      ];
    default:
      return [];
  }
}

// ── radar composite: axes + series → polar layout → primitives ──────────────────
export function emitRadar(obj: HoloObjectDecl, axes: HoloObjectDecl[], series: HoloObjectDecl[]): string[] {
  const cx = numProp(obj, 'cx', 220);
  const cy = numProp(obj, 'cy', 210);
  const R = numProp(obj, 'r', 150);
  const max = numProp(obj, 'max', 10);
  const N = axes.length || 1;
  const ang = (i: number) => -Math.PI / 2 + i * ((2 * Math.PI) / N);
  const pt = (i: number, r: number): [number, number] => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
  const out: string[] = [];

  // rings
  for (const lv of [2, 4, 6, 8, 10]) {
    if (lv > max) break;
    const pts = axes.map((_, i) => pt(i, (lv / max) * R)).map((p) => `${f1(p[0])},${f1(p[1])}`).join(' ');
    out.push(`<polygon points="${pts}" fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth={${lv === max ? 1.1 : 0.6}} />`);
  }
  // spokes + labels
  axes.forEach((ax, i) => {
    const p = pt(i, R);
    const lp = pt(i, R + 22);
    const anchor = Math.abs(lp[0] - cx) < 6 ? 'middle' : lp[0] > cx ? 'start' : 'end';
    const facet = strProp(ax, 'facet');
    out.push(`<line x1={${cx}} y1={${cy}} x2={${f1(p[0])}} y2={${f1(p[1])}} stroke="rgba(0,0,0,0.12)" strokeWidth={0.6} />`);
    out.push(`<text x={${f1(lp[0])}} y={${f1(lp[1])}} textAnchor="${anchor}" dominantBaseline="middle" fontSize={12.5} fontWeight={500} fill="#333">${esc(strProp(ax, 'label'))}${facet ? ' &#8869;' : ''}</text>`);
    if (facet) out.push(`<text x={${f1(lp[0])}} y={${f1(lp[1] + 13)}} textAnchor="${anchor}" fontSize={10.5} fill="#BA7517">${esc(facet)} facet</text>`);
  });
  // series polygons + dots
  for (const s of series) {
    const color = strProp(s, 'color', '#534AB7');
    const vals = numList(strProp(s, 'values'));
    const verts = axes.map((_, i) => pt(i, ((vals[i] ?? 0) / max) * R));
    const pts = verts.map((p) => `${f1(p[0])},${f1(p[1])}`).join(' ');
    out.push(`<polygon points="${pts}" fill="${color}" fillOpacity={0.12} stroke="${color}" strokeWidth={2.2} strokeLinejoin="round" />`);
    verts.forEach((p, i) => {
      const facet = strProp(axes[i], 'facet');
      out.push(`<circle cx={${f1(p[0])}} cy={${f1(p[1])}} r={${facet ? 4.5 : 3.5}} fill="${color}" stroke="#fff" strokeWidth={1.2} />`);
    });
  }
  return out;
}
