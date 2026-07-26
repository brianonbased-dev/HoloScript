/**
 * Routing `.hs` → Kotlin behavioral-parity test.
 *
 * The scan-result ROUTING DECISION (decideRoute over the four-member `enum Route`) is authored in
 * quest-mr-logic/Routing.logic.hs and compiled to Kotlin by the canonical Rust/WASM grammar
 * (compile_to_kotlin), injected into StarterSampleActivity.kt.tmpl's {{ROUTING_LOGIC}} marker as a
 * private `Routing` object. There is no JVM in CI, so we cannot run the emitted Kotlin directly.
 * Instead this test:
 *
 *  1. Asserts the emitted StarterSampleActivity.kt actually contains the .hs-compiled `enum class
 *     Route`, the `decideRoute(...): Route` signature (Boolean params, enum return), AND the shell's
 *     `when (Routing.decideRoute(...))` application of all four routes with the EXACT state writes +
 *     status strings. It also asserts the side effects + ScannerState mutation + the enterWorld host
 *     call STAY in the shell (the Routing object is pure) — the functional-core / imperative-shell
 *     split is the whole point.
 *  2. Runs a JS transliteration of BOTH the ORIGINAL hand-Kotlin onDecoded routing (the pre-migration
 *     if/else branching, exactly as it was) and the NEW .hs-compiled decision + shell application over
 *     the full 2×2×2 truth table (8 input combos), asserting they agree on the route AND the resulting
 *     ScannerState writes for every input — i.e. the .hs compile preserved the routing behavior.
 *
 * If the .hs logic changes, update the NEW transliteration here to match and re-confirm parity with
 * the ORIGINAL (or, if behavior is intentionally changing, update BOTH the original baseline and the
 * expectation together — never silently).
 */
import { describe, it, expect } from 'vitest';
import { QuestCompiler } from '../QuestCompiler';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDir, '..', '..', '..', '..', '..');
const specPath = join(repoRoot, 'apps', 'quest-universal-qr-scanner', 'scanner.holo');

function emittedActivityKt(): string {
  const spec = readFileSync(specPath, 'utf8');
  const result = new HoloCompositionParser().parse(spec);
  const ast = (result as { success?: boolean; ast?: unknown }).ast ?? result;
  const emitted = new QuestCompiler().compile(ast as never, '');
  const key = Object.keys(emitted).find((k) => k.endsWith('StarterSampleActivity.kt'));
  if (!key) throw new Error('StarterSampleActivity.kt not in emitted Quest MR files');
  return emitted[key];
}

// ── The decision domain ──────────────────────────────────────────────────────────────────────
type Route = 'EnterWorld' | 'PendingWorld' | 'OpenUrl' | 'ShowResult' | 'Deny';

// The ScannerState writes a route produces. `null` here means a Kotlin `null` assignment; `undefined`
// (a missing key) means the field is NOT written for that route. `text` is the decoded payload.
interface StateWrites {
  enterWorldCalled?: boolean;
  pendingWorld?: string | null;
  pendingUrl?: string | null;
  lastResult?: string | null;
  resultKind?: string | null;
  resultLabel?: string | null;
  status?: string;
}

// A classified non-world payload — mirrors Kotlin's QrContent (only the fields onDecoded reads).
interface QrContent {
  kind: string;
  label: string;
  action: 'OPEN' | 'COPY';
}

// ── ORIGINAL hand-Kotlin onDecoded routing (the pre-migration if/else, transliterated) ─────────
// Exactly the branching that lived in onDecoded() before this slice. It is the behavioral baseline
// the .hs compile must preserve: world link precedence → auto-immerse or pending card; otherwise the
// classified content drives OPEN (browser) vs a plain result card.
function origRoute(text: string, isWorld: boolean, autoImmerse: boolean, c: QrContent | null): StateWrites {
  if (isWorld) {
    if (autoImmerse) {
      return { enterWorldCalled: true };
    } else {
      return {
        pendingWorld: text,
        pendingUrl: null,
        lastResult: null,
        resultKind: null,
        resultLabel: null,
        status: 'World found — enter it?',
      };
    }
  }
  // Non-world: classifyContent was called and present.
  const cc = c as QrContent;
  if (cc.action === 'OPEN') {
    return {
      resultKind: cc.kind,
      resultLabel: cc.label,
      pendingUrl: text,
      lastResult: null,
      status: cc.label + ' — open it?',
    };
  } else {
    return {
      resultKind: cc.kind,
      resultLabel: cc.label,
      pendingUrl: null,
      lastResult: text,
      status: cc.label,
    };
  }
}

// ── NEW .hs-compiled decision (transliterated from Routing.logic.hs) ────────────────────────────
// The exact pure boolean decision emitted to the `Routing` Kotlin object.
function decideRoute(intent: string, autoImmerse: boolean): Route {
  if (intent === 'world') {
    if (autoImmerse) {
      return 'EnterWorld';
    } else {
      return 'PendingWorld';
    }
  } else if (intent === 'open') {
    return 'OpenUrl';
  } else if (intent === 'copy') {
    return 'ShowResult';
  } else {
    return 'Deny';
  }
}

function admissiblePayload(
  nonEmpty: boolean,
  withinLimit: boolean,
  controlsSafe: boolean,
  syntaxSafe: boolean
): boolean {
  return nonEmpty && withinLimit && controlsSafe && syntaxSafe;
}

function questPayloadAdmitted(text: string, maxPayloadChars = 4096): boolean {
  const trimmed = text.trim();
  const structuredMultiline =
    /^BEGIN:VCARD/i.test(trimmed) || /^BEGIN:VEVENT/i.test(trimmed);
  const controlsSafe = [...text].every((ch) => {
    const code = ch.charCodeAt(0);
    const control = code <= 0x1f || code === 0x7f;
    return !control || (structuredMultiline && (ch === '\n' || ch === '\r' || ch === '\t'));
  });
  const validStructuredEnvelope = (begin: string, end: string): boolean => {
    const lines = trimmed.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    return (
      lines.length >= 3 &&
      lines[0].trim().toUpperCase() === begin &&
      lines.at(-1)!.trim().toUpperCase() === end &&
      lines.slice(1, -1).some((line) => {
        const separator = line.indexOf(':');
        return separator > 0 && separator < line.length - 1;
      })
    );
  };
  let webUrlSyntaxSafe = true;
  if (/^BEGIN:VCARD/i.test(trimmed)) {
    webUrlSyntaxSafe = validStructuredEnvelope('BEGIN:VCARD', 'END:VCARD');
  } else if (/^BEGIN:VEVENT/i.test(trimmed)) {
    webUrlSyntaxSafe = validStructuredEnvelope('BEGIN:VEVENT', 'END:VEVENT');
  } else if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      webUrlSyntaxSafe =
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host.length > 0;
    } catch {
      webUrlSyntaxSafe = false;
    }
  }
  return admissiblePayload(
    text.trim().length > 0,
    text.length <= maxPayloadChars,
    controlsSafe,
    webUrlSyntaxSafe
  );
}

// The shell application (exactly the rewritten onDecoded `when (route) { … }`) over the .hs decision.
function hsRoute(text: string, isWorld: boolean, autoImmerse: boolean, c: QrContent | null): StateWrites {
  const isOpen = c?.action === 'OPEN'; // c is null for world payloads → isOpen false (route ignores it)
  const intent = isWorld ? 'world' : isOpen ? 'open' : 'copy';
  const route = decideRoute(intent, autoImmerse);
  switch (route) {
    case 'EnterWorld':
      return { enterWorldCalled: true };
    case 'PendingWorld':
      return {
        pendingWorld: text,
        pendingUrl: null,
        lastResult: null,
        resultKind: null,
        resultLabel: null,
        status: 'World found — enter it?',
      };
    case 'OpenUrl': {
      const cc = c as QrContent;
      return {
        resultKind: cc.kind,
        resultLabel: cc.label,
        pendingUrl: text,
        lastResult: null,
        status: cc.label + ' — open it?',
      };
    }
    case 'ShowResult': {
      const cc = c as QrContent;
      return {
        resultKind: cc.kind,
        resultLabel: cc.label,
        pendingUrl: null,
        lastResult: text,
        status: cc.label,
      };
    }
    case 'Deny':
      return { status: 'Unsupported QR content' };
  }
}

// ── The full 2×2×2 truth table (isWorld × autoImmerse × isOpenAction) ────────────────────────────
// For world payloads, classifyContent is NOT called (c = null) and isOpenAction is don't-care — but we
// still vary it to PROVE it has no effect on a world route. For non-world payloads, the third axis is
// driven by the classified content's action (OPEN vs COPY).
const TEXT = 'holoscript://world/aurora'; // payload string (content is irrelevant to routing)
const OPEN_CONTENT: QrContent = { kind: 'url', label: 'Link', action: 'OPEN' };
const COPY_CONTENT: QrContent = { kind: 'wifi', label: 'Wi-Fi network', action: 'COPY' };

interface TruthRow {
  name: string;
  isWorld: boolean;
  autoImmerse: boolean;
  isOpenAction: boolean; // drives whether c is OPEN or COPY for non-world; don't-care for world
  expected: Route;
}
const TRUTH: TruthRow[] = [
  { name: 'world + auto + open', isWorld: true, autoImmerse: true, isOpenAction: true, expected: 'EnterWorld' },
  { name: 'world + auto + !open', isWorld: true, autoImmerse: true, isOpenAction: false, expected: 'EnterWorld' },
  { name: 'world + !auto + open', isWorld: true, autoImmerse: false, isOpenAction: true, expected: 'PendingWorld' },
  { name: 'world + !auto + !open', isWorld: true, autoImmerse: false, isOpenAction: false, expected: 'PendingWorld' },
  { name: '!world + auto + open', isWorld: false, autoImmerse: true, isOpenAction: true, expected: 'OpenUrl' },
  { name: '!world + auto + !open', isWorld: false, autoImmerse: true, isOpenAction: false, expected: 'ShowResult' },
  { name: '!world + !auto + open', isWorld: false, autoImmerse: false, isOpenAction: true, expected: 'OpenUrl' },
  { name: '!world + !auto + !open', isWorld: false, autoImmerse: false, isOpenAction: false, expected: 'ShowResult' },
];

describe('Routing .hs → Kotlin emission', () => {
  const kt = emittedActivityKt();

  it('injects the .hs-compiled Routing decision (enum + decideRoute, not hand-Kotlin, not empty)', () => {
    expect(kt).toContain('@generated from logic/Routing.logic.hs (compile_to_kotlin)');
    expect(kt).toContain('private object Routing {');
    expect(kt).toContain('sealed interface Uncertain<out T>');
    expect(kt).toContain('data class ClassifiedIntent(val inferred: Uncertain<String>)');
    expect(kt).toContain('enum class Route { EnterWorld, PendingWorld, OpenUrl, ShowResult, Deny }');
    expect(kt).toContain(
      'fun decideRoute(intent: String, autoImmerse: Boolean): Route {'
    );
    expect(kt).toContain('fun resolveIntent(intent: ClassifiedIntent): String');
    expect(kt).toContain('(intent.inferred).orElse { "deny" }');
    expect(kt).toContain('return Route.EnterWorld');
    expect(kt).toContain('return Route.PendingWorld');
    expect(kt).toContain('return Route.OpenUrl');
    expect(kt).toContain('return Route.ShowResult');
  });

  it('wires onDecoded() to compute the booleans and apply the .hs route in a `when`', () => {
    expect(kt).toContain('Routing.admissiblePayload(');
    expect(kt).toContain('text.length <= MAX_PAYLOAD_CHARS');
    expect(kt).toContain('URI(trimmed).parseServerAuthority()');
    expect(kt).toContain('validStructuredEnvelope(trimmed, "BEGIN:VEVENT", "END:VEVENT")');
    expect(kt).toContain('QrPayloadFacts.controlsSafe(text)');
    expect(kt).toContain('QrPayloadFacts.syntaxSafe(text)');
    expect(kt).toContain('payloadSyntaxSafe,');
    expect(kt).toContain('val isWorld = payloadAdmitted && WorldPortal.isWorldLink(text)');
    expect(kt).toContain(
      'val c: QrContent? = if (payloadAdmitted && !isWorld) classifyContent(text) else null'
    );
    expect(kt).toContain('!payloadAdmitted -> Routing.unknown("malformed-payload")');
    expect(kt).toContain('val isOpen = c?.action == QrAction.OPEN');
    expect(kt).toContain('val intent = Routing.resolveIntent(Routing.ClassifiedIntent(intentCarrier))');
    expect(kt).toContain('val route = Routing.decideRoute(intent, WorldPortal.autoImmerse)');
    expect(kt).toContain('when (route) {');
    expect(kt).toContain('Routing.Route.EnterWorld -> {');
    expect(kt).toContain('Routing.Route.PendingWorld -> {');
    expect(kt).toContain('Routing.Route.OpenUrl -> {');
    expect(kt).toContain('Routing.Route.ShowResult -> {');
    expect(kt).toContain('Routing.Route.Deny -> {');
  });

  it('fails adversarial payload admission closed while preserving structured multiline QR types', () => {
    expect(questPayloadAdmitted('')).toBe(false);
    expect(questPayloadAdmitted('x'.repeat(4097))).toBe(false);
    expect(questPayloadAdmitted('https://example.com/\nextra')).toBe(false);
    expect(questPayloadAdmitted('https://')).toBe(false);
    expect(questPayloadAdmitted('https://example.com:bad')).toBe(false);
    expect(questPayloadAdmitted('https://example.com/path')).toBe(true);
    expect(questPayloadAdmitted('holoscript://world/aurora')).toBe(true);
    expect(questPayloadAdmitted('BEGIN:VCARD\r\nFN:Ada\r\nEND:VCARD')).toBe(true);
    expect(questPayloadAdmitted('BEGIN:VCARD\nnot-a-card')).toBe(false);
    expect(questPayloadAdmitted('plain\ttext')).toBe(false);
  });

  it('applies all four routes with the EXACT state writes + status strings (byte-identical)', () => {
    // PendingWorld arm.
    expect(kt).toContain('ScannerState.pendingWorld = text');
    expect(kt).toContain(
      'if (WORLD_ENTRY_CONSENT_EXPLICIT) WORLD_CONSENT_PURPOSE else "World found — enter it?"'
    );
    // OpenUrl arm.
    expect(kt).toContain('ScannerState.status = c.label + " — open it?"');
    // ShowResult arm — bare `c.label` status.
    expect(kt).toContain('ScannerState.status = c.label\n');
    // resultKind/resultLabel set in both content arms.
    expect(kt).toContain('ScannerState.resultKind = c!!.kind');
    expect(kt).toContain('ScannerState.resultLabel = c.label');
    // pendingUrl handling per arm.
    expect(kt).toContain('ScannerState.pendingUrl = text');
    expect(kt).toContain('ScannerState.lastResult = text');
  });

  it('keeps side effects + state + the host call in the imperative shell (functional-core/shell)', () => {
    // Side effects + host call stay in onDecoded, NOT in the Routing object.
    expect(kt).toContain('Log.i(tag, "decoded QR payload")');
    expect(kt).toContain('controller?.pauseScanning()');
    expect(kt).toContain('if (scanSound) playScanTone()');
    // The Routing object is pure: no ScannerState writes, no host calls, no SDK symbols leak into it.
    const objStart = kt.indexOf('private object Routing {');
    const objEnd = kt.indexOf('\n  }', objStart);
    const objBody = kt.slice(objStart, objEnd);
    expect(objBody).not.toContain('ScannerState');
    expect(objBody).not.toContain('enterWorld');
    expect(objBody).not.toContain('classifyContent');
    expect(objBody).not.toContain('Log.i');
  });
});

describe('Routing .hs decision ≡ original hand-Kotlin onDecoded (behavioral parity)', () => {
  it.each(TRUTH)('decideRoute matches: $name', (row) => {
    const isOpen = row.isWorld ? false : row.isOpenAction; // classify only runs for non-world
    const intent = row.isWorld ? 'world' : isOpen ? 'open' : 'copy';
    expect(decideRoute(intent, row.autoImmerse)).toBe(row.expected);
  });

  it('fails closed when inferred intent remains unknown', () => {
    expect(decideRoute('deny', false)).toBe('Deny');
  });

  it.each(TRUTH)('state writes match the original branching: $name', (row) => {
    // Build the classified content the way the shell would: null for world, OPEN/COPY for non-world.
    const c: QrContent | null = row.isWorld ? null : row.isOpenAction ? OPEN_CONTENT : COPY_CONTENT;
    const orig = origRoute(TEXT, row.isWorld, row.autoImmerse, c);
    const hs = hsRoute(TEXT, row.isWorld, row.autoImmerse, c);
    expect(hs).toEqual(orig);
  });
});
