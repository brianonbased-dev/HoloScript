/**
 * texStructure - dependency-free LaTeX structure extraction for HoloAbsorb
 * paper ingest (A19). Our own code (PAPER_VOICE 0b).
 *
 * Reads sectioning commands (\part .. \subparagraph, starred too), \label,
 * \ref/\eqref/\autoref/\cref, \cite* keys, \href/\url, \input/\include, and
 * claim environments (\begin{claim} ... \end{claim}). `%` comments and
 * verbatim/lstlisting/minted environments are skipped. No macro expansion.
 */

export interface TexSection {
  title: string;
  slug: string;
  level: number;
  command: string;
  label: string | null;
  lineStart: number;
  lineEnd: number;
  parentSlug: string | null;
}

export type TexRefKind = 'ref' | 'cite' | 'url' | 'input';

export interface TexRef {
  kind: TexRefKind;
  target: string;
  line: number;
  command: string;
}

export interface TexClaim {
  label: string | null;
  text: string;
  lineStart: number;
  lineEnd: number;
  sectionSlug: string | null;
}

export interface TexStructure {
  sections: TexSection[];
  refs: TexRef[];
  labels: Array<{ label: string; line: number }>;
  claims: TexClaim[];
  lineCount: number;
}

const LEVELS: Record<string, number> = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5,
  subparagraph: 6,
};
const SECTION_RE =
  /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*(?:\[[^\]]*\])?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g;
const LABEL_RE = /\\label\s*\{([^}]+)\}/g;
const REF_RE = /\\(ref|eqref|autoref|cref|Cref|pageref|nameref)\s*\{([^}]+)\}/g;
const CITE_RE = /\\(cite[a-zA-Z]*)\*?\s*(?:\[[^\]]*\]\s*){0,2}\{([^}]+)\}/g;
const URL_RE = /\\(href|url)\s*\{([^}]+)\}/g;
const INPUT_RE = /\\(input|include|subfile)\s*\{([^}]+)\}/g;
const VERBATIM_BEGIN = /\\begin\{(verbatim\*?|lstlisting|minted|comment)\}/;

export function stripTexComment(line: string): string {
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '%' && (i === 0 || line[i - 1] !== '\\')) return line.slice(0, i);
  }
  return line;
}

export function texToPlain(text: string): string {
  return text
    .replace(/\\[a-zA-Z]+\*?\s*(?:\[[^\]]*\])?\{([^{}]*)\}/g, '$1')
    .replace(/\\[a-zA-Z]+\*?/g, '')
    .replace(/[{}~]/g, (c) => (c === '~' ? ' ' : ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(text: string, seen: Map<string, number>): string {
  const base =
    texToPlain(text)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\- ]/gu, '')
      .trim()
      .replace(/\s+/g, '-') || 'section';
  const n = seen.get(base);
  if (n === undefined) {
    seen.set(base, 0);
    return base;
  }
  seen.set(base, n + 1);
  return `${base}-${n + 1}`;
}

export function parseTexStructure(source: string): TexStructure {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const sections: TexSection[] = [];
  const refs: TexRef[] = [];
  const labels: TexStructure['labels'] = [];
  const claims: TexClaim[] = [];
  const stack: TexSection[] = [];
  const seen = new Map<string, number>();
  let verbatimEnd: string | null = null;
  let openClaim: { lineStart: number; label: string | null; parts: string[] } | null = null;
  let lastAnchor: { kind: 'section'; s: TexSection } | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const raw = lines[i];
    if (verbatimEnd) {
      if (raw.includes(verbatimEnd)) verbatimEnd = null;
      continue;
    }
    const vb = VERBATIM_BEGIN.exec(raw);
    if (vb) {
      verbatimEnd = `\\end{${vb[1]}}`;
      continue;
    }
    const line = stripTexComment(raw);

    for (const m of line.matchAll(SECTION_RE)) {
      const level = LEVELS[m[1]];
      while (stack.length && stack[stack.length - 1].level >= level) {
        stack.pop()!.lineEnd = lineNo - 1;
      }
      const s: TexSection = {
        title: texToPlain(m[2]),
        slug: slugify(m[2], seen),
        level,
        command: m[1],
        label: null,
        lineStart: lineNo,
        lineEnd: lines.length,
        parentSlug: stack.length ? stack[stack.length - 1].slug : null,
      };
      sections.push(s);
      stack.push(s);
      lastAnchor = { kind: 'section', s };
    }

    const claimBegin = /\\begin\{claim\}/.test(line);
    if (claimBegin && !openClaim) {
      openClaim = { lineStart: lineNo, label: null, parts: [] };
    }

    for (const m of line.matchAll(LABEL_RE)) {
      labels.push({ label: m[1].trim(), line: lineNo });
      if (openClaim && !openClaim.label) openClaim.label = m[1].trim();
      else if (lastAnchor && !lastAnchor.s.label && lastAnchor.s.lineStart >= lineNo - 1) {
        lastAnchor.s.label = m[1].trim();
      }
    }
    for (const m of line.matchAll(REF_RE)) {
      for (const t of m[2].split(',')) refs.push({ kind: 'ref', target: t.trim(), line: lineNo, command: m[1] });
    }
    for (const m of line.matchAll(CITE_RE)) {
      for (const t of m[2].split(',')) refs.push({ kind: 'cite', target: t.trim(), line: lineNo, command: m[1] });
    }
    for (const m of line.matchAll(URL_RE)) {
      refs.push({ kind: 'url', target: m[2].trim(), line: lineNo, command: m[1] });
    }
    for (const m of line.matchAll(INPUT_RE)) {
      refs.push({ kind: 'input', target: m[2].trim(), line: lineNo, command: m[1] });
    }

    if (openClaim) {
      openClaim.parts.push(line);
      if (/\\end\{claim\}/.test(line)) {
        const body = openClaim.parts
          .join(' ')
          .replace(/^[\s\S]*?\\begin\{claim\}(?:\[[^\]]*\])?/, '')
          .replace(/\\end\{claim\}[\s\S]*$/, '')
          .replace(/\\label\{[^}]*\}/g, '');
        claims.push({
          label: openClaim.label,
          text: texToPlain(body),
          lineStart: openClaim.lineStart,
          lineEnd: lineNo,
          sectionSlug: stack.length ? stack[stack.length - 1].slug : null,
        });
        openClaim = null;
      }
    }
  }
  for (const s of stack) s.lineEnd = Math.max(s.lineStart, Math.min(s.lineEnd, lines.length));
  return { sections, refs, labels, claims, lineCount: lines.length };
}