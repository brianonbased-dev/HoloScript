/**
 * Tier-0 of the content-moderation cascade: deterministic, sub-millisecond
 * blocklist matching. This is the "hard stop, never probabilistic" layer — for
 * the gravest categories (CSAM, sexualization of minors, terrorism) a match is a
 * binary block, not a score.
 *
 * IMPORTANT — this module ships the STRUCTURE and a conservative starter set, not
 * a production corpus. The authoritative Tier-0 detectors are external feeds that
 * are deliberately NOT embedded in the repo:
 *   - CSAM / sexual_minors  -> perceptual-hash feeds (PhotoDNA / NCMEC); text
 *     heuristics here are a backstop only, never the primary detector.
 *   - terrorism             -> GIFCT-style hash sharing.
 * Wire those feeds in via {@link ContentPolicyConfig.blocklist} at deploy time.
 * The bulk of nuanced text classification is intentionally left to the Tier-2 LLM;
 * Tier-0 only catches unambiguous, evasion-normalized signals.
 */

import type { BlocklistEntry, Classification } from './types';

/**
 * Normalize text for matching: lower-case, strip diacritics, fold common
 * homoglyph/leetspeak/separator evasion (e.g. "b.o.m.b", "h4te"), collapse
 * whitespace. Used so blocklist terms survive trivial obfuscation.
 */
export function normalizeText(input: string): string {
  let s = input.normalize('NFKD').toLowerCase();
  // strip combining diacritical marks left by NFKD
  s = s.replace(/[̀-ͯ]/g, '');
  // common leetspeak folds
  const leet: Record<string, string> = {
    '0': 'o',
    '1': 'i',
    '3': 'e',
    '4': 'a',
    '5': 's',
    '7': 't',
    '@': 'a',
    $: 's',
  };
  s = s.replace(/[013457@$]/g, (c) => leet[c] ?? c);
  // drop separator characters frequently inserted between letters to evade matches
  s = s.replace(/[.\-_*|/\\]+/g, '');
  // collapse remaining whitespace
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

const PATTERN_CACHE = new Map<string, RegExp | null>();
const MAX_PATTERN_LENGTH = 512;

function compile(pattern: string): RegExp | null {
  if (PATTERN_CACHE.has(pattern)) return PATTERN_CACHE.get(pattern) ?? null;
  let re: RegExp | null = null;
  if (pattern.length <= MAX_PATTERN_LENGTH) {
    try {
      re = new RegExp(pattern, 'i');
    } catch {
      re = null;
    }
  }
  PATTERN_CACHE.set(pattern, re);
  return re;
}

/** Match a term on word boundaries within already-normalized text. */
function termHit(normalized: string, term: string): boolean {
  const t = normalizeText(term);
  if (!t) return false;
  // word-boundary-ish: term surrounded by start/end or a space
  return (
    normalized === t ||
    normalized.startsWith(t + ' ') ||
    normalized.endsWith(' ' + t) ||
    normalized.includes(' ' + t + ' ')
  );
}

/**
 * Run the Tier-0 blocklist over `text`. Returns the highest-severity match, or
 * `null` if nothing matched. Hard-stop matches are returned with severity 1.
 */
export function matchBlocklist(
  text: string,
  entries: BlocklistEntry[]
): (Classification & { entryId: string; hardStop: boolean }) | null {
  const normalized = normalizeText(text);
  let best: (Classification & { entryId: string; hardStop: boolean }) | null = null;

  for (const entry of entries) {
    let matched = false;
    if (entry.terms) {
      for (const term of entry.terms) {
        if (termHit(normalized, term)) {
          matched = true;
          break;
        }
      }
    }
    if (!matched && entry.patterns) {
      for (const pat of entry.patterns) {
        const re = compile(pat);
        // patterns run against the raw text so author-intended anchors work
        if (re && (re.test(text) || re.test(normalized))) {
          matched = true;
          break;
        }
      }
    }
    if (!matched) continue;

    const severity = entry.hardStop ? 1 : (entry.severity ?? 0.95);
    if (!best || severity > best.severity) {
      best = {
        category: entry.category,
        severity,
        source: 'blocklist',
        rationale: `Tier-0 blocklist match: ${entry.id}`,
        entryId: entry.id,
        hardStop: Boolean(entry.hardStop),
      };
    }
  }

  return best;
}
