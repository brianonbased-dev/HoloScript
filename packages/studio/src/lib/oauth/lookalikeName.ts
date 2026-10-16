/**
 * Flag OAuth client names that look like HoloScript or a well-known app.
 * Client names are self-chosen and nothing verifies them, so a client called
 * "HoIoScript Officiаl" (capital i, Cyrillic a) must not read as ours.
 *
 * The name and each protected name are reduced to a skeleton: Unicode NFKC,
 * diacritics stripped, lower-cased, common confusables folded (Cyrillic and
 * Greek look-alikes, 0/1/3/4/5/7/$/@/|, rn->m, vv->w, i/l/1 -> l), everything
 * but a-z dropped. A protected skeleton inside the name's skeleton is a match.
 * Pure and dependency-free so both the consent page and Settings can use it.
 */
export const PROTECTED_APP_NAMES: readonly string[] = [
  'HoloScript',
  'HoloScript Studio',
  'HoloMesh',
  'HoloLand',
  'Brittney',
  'Anthropic',
  'Claude',
  'OpenAI',
  'ChatGPT',
  'Cursor',
  'GitHub',
  'Google',
  'Gemini',
  'Grok',
  'Microsoft',
  'Copilot',
  'Railway',
  'Stripe',
];

const CONFUSABLES: Record<string, string> = {
  // Cyrillic
  а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y',
  х: 'x', і: 'i', ї: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ӏ: 'l', ԛ: 'q', ԝ: 'w', һ: 'h', ɡ: 'g',
  // Greek
  α: 'a', β: 'b', ε: 'e', η: 'n', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x',
  // digits and symbols
  '0': 'o', '1': 'l', '3': 'e', '4': 'a', '5': 's', '7': 't', $: 's', '@': 'a', '|': 'l', '!': 'l',
};

export function nameSkeleton(name: string): string {
  let s = String(name ?? '').normalize('NFKC');
  s = s.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase();
  s = Array.from(s, (ch) => CONFUSABLES[ch] ?? ch).join('');
  s = s.replace(/[^a-z]/g, '');
  s = s.replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/i/g, 'l');
  return s;
}

/** The protected name this client name looks like, or null. */
export function lookalikeOf(name: string | null | undefined): string | null {
  if (!name) return null;
  const skel = nameSkeleton(name);
  if (!skel) return null;
  // Longest first so "HoloScript Studio" wins over "HoloScript".
  const sorted = [...PROTECTED_APP_NAMES].sort((a, b) => nameSkeleton(b).length - nameSkeleton(a).length);
  for (const p of sorted) {
    const ps = nameSkeleton(p);
    if (ps && skel.includes(ps)) return p;
  }
  return null;
}
