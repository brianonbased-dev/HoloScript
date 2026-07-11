/**
 * extractDisplayedProjections — @verified_view v1 (Framing B, Slice 2 runtime harness): read the
 * value a user actually SEES for each projected element, from the RENDERED surface.
 *
 * Given the HTML a compiled @verified_view surface renders (e.g. via renderToStaticMarkup), pull
 * out `{ node -> displayed text }` for every element carrying `data-holo-projects="<node>"` —
 * the text content the render authored. This is the "displayed" side of
 * checkSurfaceTwinCorrespondence; the "authoritative" side comes from the StateAuthority layer
 * (fetch_authoritative_state). The two are read by INDEPENDENT paths (the rendered DOM vs the
 * authority), which is what makes the twin check non-circular (W.767/W.769).
 *
 * Robustness: parses well-formed render output (renderToStaticMarkup). Handles nested elements
 * via same-tag depth matching and strips inner markup to text (DOM textContent semantics),
 * decoding the entities renderToStaticMarkup emits.
 */

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
};

function decodeEntities(s: string): string {
  return s.replace(/&(?:amp|lt|gt|quot|#39|#x27);/g, (m) => HTML_ENTITIES[m] ?? m);
}

/** Strip tags → text content, decode entities, collapse whitespace, trim. */
function textContent(inner: string): string {
  return decodeEntities(inner.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

/**
 * Extract `{ node -> displayed text }` for every `[data-holo-projects]` element in `html`.
 * When the same node appears more than once, the FIRST occurrence wins (deterministic).
 */
export function extractDisplayedProjections(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const attrRe = /data-holo-projects="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(html)) !== null) {
    const node = m[1];
    if (node in out) continue;

    // Tag name of the element bearing the attribute (scan back to its '<').
    const lt = html.lastIndexOf('<', m.index);
    if (lt < 0) continue;
    const tagMatch = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(lt, m.index + 1));
    if (!tagMatch) continue;
    const tag = tagMatch[1];

    // End of the opening tag.
    const openEnd = html.indexOf('>', m.index);
    if (openEnd < 0) continue;
    if (html[openEnd - 1] === '/') {
      out[node] = ''; // self-closing element — no content
      continue;
    }

    // Walk forward to the balanced close of the same tag, tracking nested same-tag opens.
    const contentStart = openEnd + 1;
    const openRe = new RegExp(`<${tag}(?=[\\s/>])`, 'g');
    const close = `</${tag}>`;
    let depth = 1;
    let i = contentStart;
    while (i < html.length && depth > 0) {
      const nextClose = html.indexOf(close, i);
      if (nextClose < 0) break;
      openRe.lastIndex = i;
      const openM = openRe.exec(html);
      if (openM && openM.index < nextClose) {
        depth++;
        i = openM.index + tag.length + 1;
      } else {
        depth--;
        if (depth === 0) {
          out[node] = textContent(html.slice(contentStart, nextClose));
        }
        i = nextClose + close.length;
      }
    }
  }
  return out;
}
