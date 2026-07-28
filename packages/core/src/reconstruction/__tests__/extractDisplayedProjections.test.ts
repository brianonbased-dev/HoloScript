/**
 * extractDisplayedProjections.test.ts — pull the DISPLAYED value per projected element from
 * rendered surface HTML (the "displayed" side of the twin check). Unit-tested with markup
 * fixtures; the end-to-end render→extract→twin-check pipeline is exercised in the studio
 * runtime test (surfaceTwinRuntime.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { extractDisplayedProjections } from '../extractDisplayedProjections';

describe('extractDisplayedProjections', () => {
  it('extracts the text content of each [data-holo-projects] leaf element', () => {
    const html =
      '<div class="root">' +
      '<h2 data-holo-projects="stats.sessions" class="big">42</h2>' +
      '<h2 data-holo-projects="stats.errors" class="big">3</h2>' +
      '</div>';
    expect(extractDisplayedProjections(html)).toEqual({
      'stats.sessions': '42',
      'stats.errors': '3',
    });
  });

  it('strips nested inline markup to text content (DOM textContent semantics)', () => {
    const html = '<span data-holo-projects="a.b"><b>1</b>240</span>';
    expect(extractDisplayedProjections(html)).toEqual({ 'a.b': '1240' });
  });

  it('handles nested SAME-tag elements via depth matching', () => {
    const html = '<div data-holo-projects="x"><div>inner</div>tail</div>';
    expect(extractDisplayedProjections(html)).toEqual({ x: 'innertail' });
  });

  it('decodes the entities renderToStaticMarkup emits', () => {
    const html = '<span data-holo-projects="q">A &amp; B &lt;c&gt;</span>';
    expect(extractDisplayedProjections(html)).toEqual({ q: 'A & B <c>' });
  });

  it('first occurrence wins for a duplicated node (deterministic)', () => {
    const html = '<h2 data-holo-projects="n">first</h2><h2 data-holo-projects="n">second</h2>';
    expect(extractDisplayedProjections(html)).toEqual({ n: 'first' });
  });

  it('returns {} when there are no projected elements', () => {
    expect(extractDisplayedProjections('<div>nothing here</div>')).toEqual({});
  });
});
