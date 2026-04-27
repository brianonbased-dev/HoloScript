/**
 * synth-strategies-v2 — programmatic synthesis strategies for the Paper-19
 * trait-inference v2 corpus. Each strategy takes a verbatim row and
 * produces zero or more synth rows tagged with `provenance.synth_strategy`.
 *
 * Strategies (named in the v2 README):
 *   - traitPermutation: K!-1 reorderings of the trait list (capped at 3
 *     extra rows per source to avoid combinatorial explosion).
 *   - traitRemoval: drop the LAST trait, keep the rest.
 *   - propertyStripping: keep only the object/template header + trait
 *     lines, strip geometry/position/scale/color/state/material/etc.
 *   - crossDomainTransfer: rename the object/template id to a token
 *     drawn from a foreign domain so the trait list survives a
 *     surface-name scramble.
 */

const FOREIGN_NAMES = [
  "Widget",
  "Module",
  "Probe",
  "Beacon",
  "Console",
  "Panel",
  "Anchor",
  "Stub",
  "Gizmo",
  "Marker",
  "Slot",
  "Pad",
  "Bracket",
  "Cradle",
  "Bay",
];

function toTraitLine(t) {
  // gold trait list contains the bare token (no args). Permutation
  // emits each as a single-line `@token` so the snippet stays valid.
  return t;
}

function nextPermutation(arr) {
  const a = arr.slice();
  // standard lexicographic next-permutation
  let i = a.length - 2;
  while (i >= 0 && a[i] >= a[i + 1]) i--;
  if (i < 0) return null;
  let j = a.length - 1;
  while (a[j] <= a[i]) j--;
  [a[i], a[j]] = [a[j], a[i]];
  const tail = a.slice(i + 1).reverse();
  return a.slice(0, i + 1).concat(tail);
}

function generatePermutations(traits, maxOut) {
  // Return up to `maxOut` permutations DIFFERENT from the original
  // identity ordering. Use lexicographic next-permutation on a sorted
  // copy so the output is deterministic across runs.
  const sorted = traits.slice().sort();
  const out = [];
  let curr = sorted.slice();
  // Skip the identity if it equals input order.
  const inputKey = traits.join("|");
  while (out.length < maxOut) {
    const key = curr.join("|");
    if (key !== inputKey) out.push(curr.slice());
    const nxt = nextPermutation(curr);
    if (!nxt) break;
    curr = nxt;
  }
  return out;
}

function stripArgs(traitToken) {
  // "@physics(mass: 1.0)" -> "@physics"
  const m = /^(@[A-Za-z_][A-Za-z0-9_]*)/.exec(traitToken);
  return m ? m[1] : traitToken;
}

function extractObjectHeader(snippet) {
  // first line that contains `object "..."` or `template "..."` followed by `{`
  const headerRe = /^(\s*(?:object|template)\s+"([^"]+)"[^{]*\{)/m;
  const m = headerRe.exec(snippet);
  if (!m) return null;
  return { headerLine: m[1], idLiteral: m[2], headerEnd: m.index + m[1].length };
}

function rebuildSnippet(headerLine, traits, body) {
  // body lines stay as-is; trait list is injected right after header.
  const traitLines = traits.map((t) => `  ${t}`).join("\n");
  return `${headerLine}\n${traitLines}\n${body}`;
}

function extractBodyAfterTraits(snippet) {
  // Snippet shape from harvester:
  //   object "X" {
  //     @t1
  //     @t2(args)
  //     <body lines>
  //   }
  // Returns { headerLine, traitLines, body, originalTraitOrder }.
  const lines = snippet.split("\n");
  const headerIdx = lines.findIndex((l) => /(?:object|template)\s+"[^"]+"\s*\{/.test(l));
  if (headerIdx === -1) return null;
  const headerLine = lines[headerIdx];
  let i = headerIdx + 1;
  const traitLines = [];
  const traitOrder = [];
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith("@")) break;
    traitLines.push(lines[i]);
    traitOrder.push(stripArgs(trimmed));
    i++;
  }
  const bodyLines = lines.slice(i, lines.length); // closing brace included
  return {
    headerLine,
    traitLines,
    traitArgs: traitLines.map((l) => l.trim()), // preserves args
    traitOrder, // bare @trait order (no args)
    body: bodyLines.join("\n"),
  };
}

export function traitPermutation(row) {
  // Skip rows with <2 traits — no meaningful permutation.
  if (row.gold_traits.length < 2) return [];
  const parsed = extractBodyAfterTraits(row.snippet);
  if (!parsed) return [];
  // Generate up to 3 distinct permutations.
  const perms = generatePermutations(parsed.traitArgs, 3);
  return perms.map((permTraitArgs, i) => {
    const newSnippet = `${parsed.headerLine}\n${permTraitArgs.map((l) => `  ${l}`).join("\n")}\n${parsed.body}`;
    // Gold traits update too — same set, different order.
    const newGold = permTraitArgs.map((a) => stripArgs(a));
    return {
      ...row,
      id: `${row.id}-perm${i + 1}`,
      snippet: newSnippet,
      gold_traits: newGold,
      provenance: { ...row.provenance, kind: "synth", synth_strategy: "trait-permutation", parent: row.id },
    };
  });
}

export function traitRemoval(row) {
  if (row.gold_traits.length < 2) return [];
  const parsed = extractBodyAfterTraits(row.snippet);
  if (!parsed) return [];
  const newTraitArgs = parsed.traitArgs.slice(0, -1);
  const newGold = parsed.traitOrder.slice(0, -1);
  const newSnippet = `${parsed.headerLine}\n${newTraitArgs.map((l) => `  ${l}`).join("\n")}\n${parsed.body}`;
  return [
    {
      ...row,
      id: `${row.id}-rem`,
      snippet: newSnippet,
      gold_traits: newGold,
      provenance: { ...row.provenance, kind: "synth", synth_strategy: "trait-removal", parent: row.id },
    },
  ];
}

export function propertyStripping(row) {
  const parsed = extractBodyAfterTraits(row.snippet);
  if (!parsed) return [];
  // Reduce body to just the closing brace (preserve indentation of last line).
  const lastLine = parsed.body.split("\n").slice(-1)[0] || "}";
  const newSnippet = `${parsed.headerLine}\n${parsed.traitArgs.map((l) => `  ${l}`).join("\n")}\n${lastLine}`;
  return [
    {
      ...row,
      id: `${row.id}-strip`,
      snippet: newSnippet,
      gold_traits: row.gold_traits,
      provenance: { ...row.provenance, kind: "synth", synth_strategy: "property-stripping", parent: row.id },
    },
  ];
}

export function crossDomainTransfer(row, seed) {
  const header = extractObjectHeader(row.snippet);
  if (!header) return [];
  // Pick a foreign name deterministically based on row id + index.
  const idx = (seed | 0) % FOREIGN_NAMES.length;
  const newName = FOREIGN_NAMES[idx];
  const newHeader = row.snippet.replace(`"${header.idLiteral}"`, `"${newName}"`);
  return [
    {
      ...row,
      id: `${row.id}-xdom`,
      snippet: newHeader,
      gold_traits: row.gold_traits,
      provenance: { ...row.provenance, kind: "synth", synth_strategy: "cross-domain-transfer", parent: row.id, original_name: header.idLiteral, new_name: newName },
    },
  ];
}

export const ALL_STRATEGIES = {
  traitPermutation,
  traitRemoval,
  propertyStripping,
  crossDomainTransfer,
};
