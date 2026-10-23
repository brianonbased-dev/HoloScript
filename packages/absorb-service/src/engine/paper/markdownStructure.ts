/**
 * markdownStructure - dependency-free Markdown structure extraction for the
 * HoloAbsorb paper/doc ingest (A19, MD-ADAPTER spec). Our own code (PAPER_VOICE 0b).
 *
 *   1. ATX headings -> section records (GitHub slug with -1/-2 dedupe, level,
 *      line start/end, parent section). Fenced code blocks are skipped.
 *   2. Links captured raw per file: text, target, #anchor, line, kind.
 *   3. Doc-contract header fields from the first 5 lines, as metadata.
 *
 * Documented limits: setext headings (`Title\n===`), HTML headings, and links
 * inside raw HTML are not read. Images (`![alt](src)`) are not links.
 */

export interface MarkdownSection {
  /** Heading text with inline markdown removed. */
  title: string;
  /** GitHub-style anchor slug, deduped per file with -1, -2, ... */
  slug: string;
  level: number;
  /** 1-based line of the heading. */
  lineStart: number;
  /** 1-based last line of the section (before the next heading at the same or higher level). */
  lineEnd: number;
  /** Slug of the enclosing section, or null for top-level sections. */
  parentSlug: string | null;
}

export type MarkdownLinkKind =
  | 'relative'
  | 'http'
  | 'local-absolute'
  | 'mailto'
  | 'other-scheme';

export interface MarkdownLink {
  text: string;
  /** Raw target with the #anchor removed (empty for same-file anchors). */
  target: string;
  /** Anchor without the leading '#', or null. */
  anchor: string | null;
  line: number;
  kind: MarkdownLinkKind;
  form: 'inline' | 'autolink' | 'reference';
}

export interface MarkdownStructure {
  sections: MarkdownSection[];
  links: MarkdownLink[];
  /** Doc-contract header fields found in the first 5 lines (key -> value). */
  header: Record<string, string>;
  lineCount: number;
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const HEADER_FIELD =
  /^\s*(?:>\s*)?(?:[-*]\s+)?(?:\*\*|__)?([A-Za-z][A-Za-z0-9 _/-]{0,39}?)(?::(?:\*\*|__)|(?:\*\*|__)?:)\s*(\S.*)$/;
const REF_DEF = /^ {0,3}\[([^\]]+)\]:\s*<?([^\s>]+)>?(?:\s+["'(].*["')])?\s*$/;
const INLINE_LINK =
  /(!?)\[((?:[^[\]]|\[[^\]]*\])*)\]\(\s*(<[^>]*>|[^\s()]*(?:\([^)]*\)[^\s()]*)*)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
const AUTOLINK = /<((?:https?|mailto|file):[^>\s]+)>/gi;

/** Strip inline markdown so the slug matches the rendered heading text. */
export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])[*_]([^*_]+)[*_](?=[^\w*]|$)/g, '$1$2')
    .replace(/~~(.+?)~~/g, '$1')
    .trim();
}

/** GitHub anchor slug: lowercase, drop punctuation except - and _, spaces -> '-'. */
export function githubSlug(text: string): string {
  return stripInlineMarkdown(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '')
    .replace(/ /g, '-');
}

/** Returns a deduping slugger that mirrors GitHub's -1, -2 suffix rule. */
export function createSlugger(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base = githubSlug(text);
    if (!seen.has(base)) {
      seen.set(base, 0);
      return base;
    }
    let n = seen.get(base) ?? 0;
    let slug: string;
    do {
      n += 1;
      slug = `${base}-${n}`;
    } while (seen.has(slug));
    seen.set(base, n);
    seen.set(slug, 0);
    return slug;
  };
}

export function classifyLinkTarget(target: string): MarkdownLinkKind {
  const t = target.trim();
  if (/^mailto:/i.test(t)) return 'mailto';
  if (/^https?:\/\//i.test(t)) return 'http';
  if (/^[A-Za-z]:[\\/]/.test(t) || /^~[\\/]/.test(t) || /^\\\\/.test(t) || /^file:/i.test(t)) {
    return 'local-absolute';
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(t)) return 'other-scheme';
  return 'relative';
}

function splitAnchor(rawTarget: string): { target: string; anchor: string | null } {
  const hash = rawTarget.indexOf('#');
  if (hash === -1) return { target: rawTarget, anchor: null };
  return { target: rawTarget.slice(0, hash), anchor: rawTarget.slice(hash + 1) || null };
}

function makeLink(
  text: string,
  rawTarget: string,
  line: number,
  form: MarkdownLink['form']
): MarkdownLink {
  const cleaned = rawTarget.trim().replace(/^<(.*)>$/, '$1');
  const kind = classifyLinkTarget(cleaned);
  const { target, anchor } =
    kind === 'mailto' ? { target: cleaned, anchor: null } : splitAnchor(cleaned);
  return { text: text.trim(), target, anchor, line, kind, form };
}

/** Blank out inline code spans so links inside `code` are not captured. */
function maskInlineCode(line: string): string {
  return line.replace(/(`+)([\s\S]*?)\1/g, (m) => ' '.repeat(m.length));
}

function extractLinksFromLine(line: string, lineNo: number, out: MarkdownLink[]): void {
  const masked = maskInlineCode(line);
  for (const m of masked.matchAll(INLINE_LINK)) {
    if (m[1] === '!') continue;
    out.push(makeLink(m[2], m[3], lineNo, 'inline'));
  }
  for (const m of masked.matchAll(AUTOLINK)) {
    out.push(makeLink(m[1], m[1], lineNo, 'autolink'));
  }
}

export function parseMarkdownStructure(source: string): MarkdownStructure {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const slugger = createSlugger();
  const sections: MarkdownSection[] = [];
  const links: MarkdownLink[] = [];
  const header: Record<string, string> = {};
  const stack: MarkdownSection[] = [];
  let fence: { char: string; len: number } | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineNo = i + 1;

    const fenceMatch = FENCE_OPEN.exec(line);
    if (fence) {
      if (
        fenceMatch &&
        fenceMatch[1][0] === fence.char &&
        fenceMatch[1].length >= fence.len &&
        line.trim() === fenceMatch[1]
      ) {
        fence = null;
      }
      continue;
    }
    if (fenceMatch) {
      fence = { char: fenceMatch[1][0], len: fenceMatch[1].length };
      continue;
    }

    const atx = ATX.exec(line);
    if (i < 5 && !atx) {
      const hf = HEADER_FIELD.exec(line);
      if (hf) {
        const key = hf[1].trim().toLowerCase().replace(/\s+/g, '-');
        if (!(key in header)) header[key] = stripInlineMarkdown(hf[2]);
      }
    }

    if (atx) {
      const level = atx[1].length;
      const rawTitle = (atx[2] ?? '').replace(/[ \t]+#+$/, '').replace(/^#+$/, '');
      while (stack.length && stack[stack.length - 1].level >= level) {
        stack.pop()!.lineEnd = lineNo - 1;
      }
      const section: MarkdownSection = {
        title: stripInlineMarkdown(rawTitle),
        slug: slugger(rawTitle),
        level,
        lineStart: lineNo,
        lineEnd: lines.length,
        parentSlug: stack.length ? stack[stack.length - 1].slug : null,
      };
      sections.push(section);
      stack.push(section);
      extractLinksFromLine(rawTitle, lineNo, links);
      continue;
    }

    const ref = REF_DEF.exec(line);
    if (ref) {
      links.push(makeLink(ref[1], ref[2], lineNo, 'reference'));
      continue;
    }
    extractLinksFromLine(line, lineNo, links);
  }

  let last = lines.length;
  while (last > 0 && lines[last - 1].trim() === '') last -= 1;
  for (const open of stack) {
    open.lineEnd = Math.max(open.lineStart, Math.min(open.lineEnd, last));
  }

  return { sections, links, header, lineCount: lines.length };
}