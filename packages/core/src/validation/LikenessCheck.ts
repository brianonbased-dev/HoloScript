/**
 * HS1011, the likeness check: claim -> rule -> render (vision avatar-format-breakdown.md, known
 * gaps 1 and 2; strict/ERROR_CONTRACT.md). One implementation, used by the canonical validator
 * (`validateCanonicalSource`) and by the strict layer (strict/holo_strict.mjs, through
 * `@holoscript/core/parser`).
 *
 * A likeness source (face, voice, body) renders only when its object claims a grant through
 * `@consent_gate(grant: "...")` and the caller's `.hs` `render_likeness` result says yes to that
 * grant for that source. A grant held by the likeness trait itself is always refused: traits hold
 * no grant. With no rules, every likeness source is refused (fail closed).
 */

export type LikenessSource = 'face' | 'voice' | 'body';

/** Traits that render a real person's likeness, by the source they render. Deliberately short. */
export const LIKENESS_SOURCES: Readonly<Record<string, LikenessSource>> = Object.freeze({
  face_mesh: 'face',
  voice_print: 'voice',
  body_scan: 'body',
});

/**
 * Tracking traits that are exempt only when driven by the live user's own capture (Trust and
 * Consent POLICY.md section 3). The exemption rests on the trait's declared input-source
 * parameter, not on its name: any other value (a recording, a file, a stream, TTS, external
 * data), or a missing, non-string or unknown value, makes it a likeness that needs the rule's yes.
 * Only traits whose definitions already declare such a parameter are listed (traits/audio/
 * lip_sync.holo and lipsync.holo). face_tracking and body_tracking declare none, so they stay
 * ungated until a source parameter exists.
 */
export const SOURCE_GATED_TRACKING: Readonly<
  Record<string, { param: string; live: readonly string[]; source: LikenessSource }>
> = Object.freeze({
  lip_sync: { param: 'source', live: ['microphone'], source: 'voice' },
  lipsync: { param: 'source', live: ['live_mic'], source: 'voice' },
});

/** The caller's `.hs` render_likeness result: grant -> the sources the rule said yes to. */
export type ConsentRules =
  | Record<string, Iterable<LikenessSource | string>>
  | Map<string, Iterable<LikenessSource | string>>;

export const LIKENESS_CODE = 'HS1011';

export interface LikenessFinding {
  /** The likeness trait node (`{ name, config }`). */
  trait: unknown;
  /** The nearest node that carries a `loc`, normally the object holding the trait. */
  owner: unknown;
  /** The trait name as parsed, without `@`. */
  traitName: string;
  source: LikenessSource;
  message: string;
  hint: string;
}

interface TraitLike {
  type?: unknown;
  name?: unknown;
  config?: Record<string, unknown> | null;
}
type NodeLike = Record<string, unknown> & { loc?: { start?: unknown }; traits?: unknown };

const normalize = (name: unknown): string =>
  String(name ?? '')
    .trim()
    .replace(/^@/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();

function rulesOf(input: unknown): Map<string, Set<string>> {
  const rules = new Map<string, Set<string>>();
  if (!input || typeof input !== 'object') return rules;
  const entries: Iterable<[unknown, unknown]> =
    input instanceof Map ? input.entries() : Object.entries(input as Record<string, unknown>);
  for (const [grant, sources] of entries) {
    if (
      sources &&
      typeof sources !== 'string' &&
      typeof (sources as Iterable<unknown>)[Symbol.iterator] === 'function'
    ) {
      rules.set(
        String(grant),
        new Set([...(sources as Iterable<unknown>)].map((s) => String(s).toLowerCase()))
      );
    }
  }
  return rules;
}

/** Every trait use in the AST with its owner, in source order (the strict layer's walk). */
function collect(
  node: unknown,
  found: Array<{ trait: TraitLike; owner: NodeLike | null }>,
  owner: NodeLike | null
) {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) {
    for (const item of node) collect(item, found, owner);
    return found;
  }
  const n = node as NodeLike;
  if (n.type === 'ObjectTrait' || n.type === 'Trait') found.push({ trait: n as TraitLike, owner });
  const next = n.loc && n.loc.start ? n : owner;
  for (const value of Object.values(n))
    if (value && typeof value === 'object') collect(value, found, next);
  return found;
}

/**
 * Likeness traits in a `.holo` AST that may not render, in source order. Positions are the
 * caller's job (each layer has its own locator).
 */
export function checkLikeness(ast: unknown, consentRules?: ConsentRules | null): LikenessFinding[] {
  const rules = rulesOf(consentRules);
  const findings: LikenessFinding[] = [];
  for (const { trait, owner } of collect(ast, [], null)) {
    const traitName = normalize(trait.name);
    let source: LikenessSource | undefined = LIKENESS_SOURCES[traitName];
    let tracking = '';
    const gated = Object.prototype.hasOwnProperty.call(SOURCE_GATED_TRACKING, traitName)
      ? SOURCE_GATED_TRACKING[traitName]
      : undefined;
    if (!source && gated) {
      const value = trait.config ? trait.config[gated.param] : undefined;
      if (typeof value === 'string' && gated.live.includes(value.trim().toLowerCase())) continue;
      source = gated.source;
      tracking =
        value === undefined
          ? ` (no live ${gated.param}; only ${gated.param}: "${gated.live[0]}" is the live user's own capture)`
          : ` (${gated.param} ${JSON.stringify(value)} is not the live user's own capture)`;
    }
    if (!source) continue;
    const bare = String(trait.name ?? '')
      .trim()
      .replace(/^@/, '');
    const add = (message: string, hint: string) =>
      findings.push({ trait, owner, traitName: bare, source, message, hint });
    if (trait.config && Object.prototype.hasOwnProperty.call(trait.config, 'grant')) {
      add(
        `"@${bare}" holds a grant itself. Traits hold no grant: the ${source} likeness needs the render_likeness rule's yes.`,
        'Move the grant to a claim on the object, @consent_gate(grant: "..."), and pass the rule\'s result in consentRules.'
      );
      continue;
    }
    const ownerTraits = Array.isArray(owner?.traits) ? (owner!.traits as TraitLike[]) : [];
    const gate = ownerTraits.find(
      (t) =>
        t &&
        normalize(t.name) === 'consent_gate' &&
        !!t.config &&
        typeof t.config.grant === 'string'
    );
    if (!gate) {
      add(
        `"@${bare}" renders a ${source} likeness${tracking} with no claim. Add @consent_gate(grant: "...") to the object.`,
        "Every likeness source (face, voice, body) needs a claimed grant and the render_likeness rule's yes."
      );
      continue;
    }
    const grant = gate.config!.grant as string;
    if (!rules.get(grant)?.has(source)) {
      add(
        `The render_likeness rule did not say yes to grant "${grant}" for the ${source} likeness ("@${bare}").`,
        'Pass the .hs render_likeness result in consentRules, for example { [grant]: ["face", "voice"] }.'
      );
    }
  }
  return findings;
}
