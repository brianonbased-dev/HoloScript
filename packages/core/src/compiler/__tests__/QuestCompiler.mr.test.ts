/**
 * QuestCompiler immersive-MR (surface: immersive_mr) — NATIVE trait-dispatch test.
 *
 * Parses the real scanner.holo composition through HoloCompositionParser (NO regex) and compiles it
 * through QuestCompiler's MR branch, asserting the emitted ScannerContent.kt + strings.xml carry the
 * values that came from the parsed trait configs. This exercises the trait→config→emit path end to
 * end (RISK 3: a {} composition would never run the dispatch — this parses the real file).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QuestCompiler } from '../QuestCompiler';
import { emitWorldSceneKt } from '../quest-world-emit';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';
import { compileHSPlusStateMachineToKotlin } from '../HSIIRKotlinStateMachineEmitter';

const SCANNER_HOLO = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'apps',
  'quest-universal-qr-scanner',
  'scanner.holo'
);

describe('QuestCompiler immersive_mr (native trait-dispatch)', () => {
  const source = readFileSync(SCANNER_HOLO, 'utf8');
  const parsed = new HoloCompositionParser().parse(source);

  it('parses scanner.holo with no errors', () => {
    expect(parsed.success).toBe(true);
    expect(parsed.errors ?? []).toHaveLength(0);
    expect(parsed.ast?.objects?.length).toBeGreaterThanOrEqual(5);
  });

  it('emits the MR app (content + behavior Kotlin), not the 2D panel', () => {
    const out = new QuestCompiler().compile(parsed.ast!, '');
    const keys = Object.keys(out);
    expect(keys.some((k) => k.endsWith('ScannerContent.kt'))).toBe(true);
    expect(keys.some((k) => k.endsWith('strings.xml'))).toBe(true);
    expect(keys.some((k) => k.endsWith('QrDecoder.kt'))).toBe(true);
    expect(keys.some((k) => k.endsWith('PassthroughCameraController.kt'))).toBe(true);
    // MR branch, so NOT the 2D 11-file panel set:
    expect(keys.some((k) => k.endsWith('MainActivity.kt'))).toBe(false);
  });

  it('emits a Meta-store-ready landscape launch activity', () => {
    const out = new QuestCompiler().compile(parsed.ast!, '');
    const manifest = out[Object.keys(out).find((k) => k.endsWith('AndroidManifest.xml'))!];
    expect(manifest).toContain('android:screenOrientation="landscape"');
    expect(manifest).toContain('android:value="quest3|quest3s"');
  });

  it('removes unrequested storage and media permissions from transitive SDK manifests', () => {
    const out = new QuestCompiler().compile(parsed.ast!, '');
    const manifest = out[Object.keys(out).find((k) => k.endsWith('AndroidManifest.xml'))!];
    const gradle = out[Object.keys(out).find((k) => k.endsWith('app/build.gradle.kts'))!];
    const denied = [
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_AUDIO',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.ACCESS_MEDIA_LOCATION',
      'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
    ];

    expect(manifest).toContain('xmlns:tools="http://schemas.android.com/tools"');
    for (const permission of denied) {
      expect(manifest).toContain(
        `<uses-permission android:name="${permission}" tools:node="remove" />`
      );
    }
    expect(gradle).not.toContain('implementation(libs.meta.spatial.sdk.castinputforward)');
  });

  it('shrinks release builds so unused transitive SDK bytecode is not submitted', () => {
    const out = new QuestCompiler().compile(parsed.ast!, '');
    const gradle = out[Object.keys(out).find((k) => k.endsWith('app/build.gradle.kts'))!];
    const proguard = out[Object.keys(out).find((k) => k.endsWith('app/proguard-rules.pro'))!];
    expect(gradle).toContain('isMinifyEnabled = true');
    expect(gradle).toContain('isShrinkResources = true');
    expect(gradle).toContain('proguard-android-optimize.txt');
    expect(proguard).toContain('-dontwarn horizonos.app.container.**');
    expect(proguard).toContain('-dontwarn vros.os.**');
    expect(proguard).toContain(
      '-keepclasseswithmembers,includedescriptorclasses class com.meta.spatial.**'
    );
    expect(proguard).toContain('native <methods>;');
    expect(proguard).toContain('-keep class com.meta.spatial.toolkit.** { *; }');
    expect(proguard).toContain('-keep class com.meta.spatial.isdk.** { *; }');
    expect(proguard).toContain('-keep class com.meta.spatial.core.** { *; }');
    expect(proguard).toContain('-keep class com.meta.spatial.runtime.** { *; }');
    expect(proguard).toContain('-keep class com.google.zxing.** { *; }');
  });

  it('PassthroughCameraController.kt is generated from the passthrough_camera trait config', () => {
    const out = new QuestCompiler().compile(parsed.ast!, '');
    const ctl = out[Object.keys(out).find((k) => k.endsWith('PassthroughCameraController.kt'))!];
    // config-injected constants
    expect(ctl).toContain('private const val CAMERA_SOURCE = 0');
    expect(ctl).toContain('private const val DECODE_INTERVAL_MS = 200L');
    expect(ctl).toContain('private const val COOLDOWN_MS = 2500L');
    // max-resolution capture (the scan fix): ImageReader uses the queried max size, not a constant
    expect(ctl).toContain('ImageReader.newInstance(capW, capH, ImageFormat.YUV_420_888, 2)');
    expect(ctl).toContain('pickLargestYuvSize(cameraId)');
    // AF off (frame-stall fix)
    expect(ctl).toContain('CaptureRequest.CONTROL_AF_MODE_OFF');
    // escaped Kotlin string templates render literally (not consumed by TS interpolation)
    expect(ctl).toContain('capture=${capW}x$capH');
    // Privacy invariant: camera luminance exists only in memory and decoded values are redacted.
    expect(ctl).not.toContain('getExternalFilesDir');
    expect(ctl).not.toContain('writeBytes(y)');
    expect(ctl).not.toContain('frame_latest_');
    expect(ctl).not.toContain('$decoded")');
    expect(ctl).toContain('Log.i(TAG, "QR read (attempt $attempts)")');
    expect(ctl).toContain('fun hasLiveSession(): Boolean = device != null && session != null');
    // no leftover TS interpolation artifacts
    expect(ctl).not.toContain('[object Object]');
    expect(ctl).not.toContain('undefined');
  });

  it('QrDecoder.kt is generated from the qr_decode trait config', () => {
    const out = new QuestCompiler().compile(parsed.ast!, '');
    const dec = out[Object.keys(out).find((k) => k.endsWith('QrDecoder.kt'))!];
    expect(dec).toContain('MultiFormatReader');
    expect(dec).toContain('DecodeHintType.TRY_HARDER to true');
    expect(dec).toContain('DecodeHintType.ALSO_INVERTED to true');
    expect(dec).toContain('val cw = minOf(640, width)'); // center_crop.width from config
    expect(dec).toContain('val ch = minOf(480, height)');
  });

  it('redacts decoded payload values when scanner.holo disables payload logging', () => {
    const out = new QuestCompiler().compile(parsed.ast!, '');
    const activity = out[Object.keys(out).find((k) => k.endsWith('StarterSampleActivity.kt'))!];
    expect(activity).toContain('Log.i(tag, "decoded QR payload")');
    expect(activity).toContain('Log.i(tag, "entering QR world")');
    expect(activity).toContain('Log.i(tag, "user opened QR link")');
    expect(activity).not.toContain('Log.i(tag, "decoded: $text")');
    expect(activity).not.toContain('Log.i(tag, "entering world: $link")');
    expect(activity).not.toContain('Log.i(tag, "user opened: $url")');

    const allKotlin = Object.entries(out)
      .filter(([key]) => key.endsWith('.kt'))
      .map(([, value]) => value)
      .join('\n');
    expect(allKotlin).not.toContain('getExternalFilesDir');
    expect(allKotlin).not.toContain('writeBytes(y)');
    expect(allKotlin).not.toContain('frame_latest_');
    expect(allKotlin).not.toMatch(/Log\.[A-Za-z]+\([^)]*\$(?:decoded|text|url|link)/);
  });

  it('lowers inferred QR intent through @unknown and fails closed to Deny', () => {
    const out = new QuestCompiler().compile(parsed.ast!, '');
    const activity = out[Object.keys(out).find((k) => k.endsWith('StarterSampleActivity.kt'))!];
    expect(activity).toContain('sealed interface Uncertain<out T>');
    expect(activity).toContain('data class ClassifiedIntent(val inferred: Uncertain<String>)');
    expect(activity).toContain('(intent.inferred).orElse { "deny" }');
    expect(activity).toContain(
      'fun admissiblePayload(nonEmpty: Boolean, withinLimit: Boolean, controlsSafe: Boolean, syntaxSafe: Boolean): Boolean'
    );
    expect(activity).toContain('text.length <= MAX_PAYLOAD_CHARS');
    expect(activity).toContain('fun asWebUrl(text: String): String?');
    expect(activity).toContain('URI(candidate).parseServerAuthority()');
    expect(activity).toContain('validStructuredEnvelope(trimmed, "BEGIN:VCARD", "END:VCARD")');
    expect(activity).toContain('QrPayloadFacts.controlsSafe(text)');
    expect(activity).toContain('QrPayloadFacts.syntaxSafe(text)');
    expect(activity).toContain('payloadSyntaxSafe,');
    expect(activity).toContain('!payloadAdmitted -> Routing.unknown("malformed-payload")');
    expect(activity).toContain('Routing.unknown("unsupported-action")');
    expect(activity).toContain('Routing.Route.Deny');

    const changed = new HoloCompositionParser().parse(
      source.replace('max_payload_chars: 4096', 'max_payload_chars: 37')
    );
    expect(changed.success).toBe(true);
    const changedOut = new QuestCompiler().compile(changed.ast!, '');
    const changedActivity =
      changedOut[Object.keys(changedOut).find((k) => k.endsWith('StarterSampleActivity.kt'))!];
    expect(changedActivity).toContain('private const val MAX_PAYLOAD_CHARS = 37');
  });

  it('makes explicit world-entry consent a compile-time and runtime invariant', () => {
    const out = new QuestCompiler().compile(parsed.ast!, '');
    const portal = out[Object.keys(out).find((k) => k.endsWith('WorldPortal.kt'))!];
    const activity = out[Object.keys(out).find((k) => k.endsWith('StarterSampleActivity.kt'))!];
    expect(portal).toContain('const val autoImmerse = false');
    expect(activity).toContain('lifecycle.fireConsentRequested()');
    expect(activity).toContain('lifecycle.fireConsentGranted()');
    expect(activity).toContain('private const val WORLD_ENTRY_CONSENT_EXPLICIT = true');
    expect(activity).toContain('private const val WORLD_CONSENT_EXPIRY_MS = 0L');
    expect(activity).toContain('private const val WORLD_CONSENT_AUDIT_LOG = true');
    expect(activity).toContain(
      'private const val WORLD_CONSENT_PURPOSE = "Enter the HoloScript world encoded by a scanned QR"'
    );

    const noExplicitConsent = new HoloCompositionParser().parse(
      source.replace('require_explicit: true', 'require_explicit: false')
    );
    expect(noExplicitConsent.success).toBe(true);
    const noConsentOut = new QuestCompiler().compile(noExplicitConsent.ast!, '');
    const noConsentActivity =
      noConsentOut[Object.keys(noConsentOut).find((k) => k.endsWith('StarterSampleActivity.kt'))!];
    expect(noConsentActivity).toContain('private const val WORLD_ENTRY_CONSENT_EXPLICIT = false');

    const contradictory = new HoloCompositionParser().parse(
      source.replace('auto_immerse: false', 'auto_immerse: true')
    );
    expect(contradictory.success).toBe(true);
    expect(() => new QuestCompiler().compile(contradictory.ast!, '')).toThrow(
      /consent_gate.*forbids.*auto_immerse/s
    );
  });

  it('compiles bookmark policy from @local_collection instead of hardcoding it', () => {
    const changed = new HoloCompositionParser().parse(
      source
        .replace('capacity: 100', 'capacity: 3')
        .replace('ordering: "most_recent"', 'ordering: "oldest_first"')
        .replace('deduplicate: true', 'deduplicate: false')
    );
    expect(changed.success).toBe(true);
    const out = new QuestCompiler().compile(changed.ast!, '');
    const activity = out[Object.keys(out).find((k) => k.endsWith('StarterSampleActivity.kt'))!];
    const panel = out[Object.keys(out).find((k) => k.endsWith('ScannerPanel.kt'))!];
    expect(activity).toContain('private const val MAX_BOOKMARKS = 3');
    expect(activity).toContain('private const val BOOKMARKS_ENABLED = true');
    expect(activity).toContain('private const val BOOKMARK_MOST_RECENT = false');
    expect(activity).toContain('private const val BOOKMARK_DEDUPLICATE = false');
    expect(activity).toContain('val array = JSONArray(encoded)');
    expect(activity).toContain('return normalized.take(MAX_BOOKMARKS)');
    expect(panel).toContain('private const val BOOKMARKS_ENABLED = true');

    const nonUrl = new HoloCompositionParser().parse(
      source.replace('item_type: "url"', 'item_type: "string"')
    );
    expect(nonUrl.success).toBe(true);
    const nonUrlOut = new QuestCompiler().compile(nonUrl.ast!, '');
    const nonUrlPanel =
      nonUrlOut[Object.keys(nonUrlOut).find((k) => k.endsWith('ScannerPanel.kt'))!];
    expect(nonUrlPanel).toContain('private const val BOOKMARKS_ENABLED = false');
  });

  it('Bookmark click stays on Saved links and does not call dismiss', () => {
    const out = new QuestCompiler().compile(parsed.ast!, '');
    const panel = out[Object.keys(out).find((k) => k.endsWith('ScannerPanel.kt'))!];
    const start = panel.indexOf('val canonical = QrPayloadFacts.asWebUrl(url) ?: url');
    const end = panel.indexOf('Text("Bookmark")', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const click = panel.slice(start, end);
    expect(click).toContain('Screen.BOOKMARKS');
    expect(click).not.toContain('onDismiss?.invoke()');
  });

  it('emits private HMAC scan receipts that structurally omit raw payloads', () => {
    const out = new QuestCompiler().compile(parsed.ast!, '');
    const receipts = out[Object.keys(out).find((k) => k.endsWith('ScanReceiptStore.kt'))!];
    expect(receipts).toContain('context.filesDir');
    expect(receipts).toContain('HmacSHA256');
    expect(receipts).toContain('"payload_commitment"');
    expect(receipts).toContain('loss of a local diagnostic receipt must never crash');
    expect(receipts).toContain('available = false');
    expect(receipts).not.toContain('.put("payload",');
    expect(receipts).not.toContain('payload_hash');
  });

  it('admits bundled worlds by compiled registry and verifies remote manifests with Ed25519', () => {
    const out = new QuestCompiler().compile(parsed.ast!, '');
    const trust = out[Object.keys(out).find((k) => k.endsWith('WorldTrust.kt'))!];
    const activity = out[Object.keys(out).find((k) => k.endsWith('StarterSampleActivity.kt'))!];
    expect(trust).toContain('Worlds.ids.contains(bundledId)');
    expect(trust).toContain('Signature.getInstance("Ed25519")');
    expect(trust).toContain('reason = "untrusted-key"');
    expect(trust).toContain('signed-parameter-cardinality');
    expect(trust).toContain('reason = "freshness"');
    expect(activity.indexOf('WorldTrust.admit(link)')).toBeLessThan(
      activity.indexOf('worldRenderer.enter(worldId)')
    );
  });

  it('emits the exact app .hsplus lifecycle through HSI-IR and uses it as the runtime gate', () => {
    const lifecyclePath = join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      '..',
      'apps',
      'quest-universal-qr-scanner',
      'scanner-lifecycle.hsplus'
    );
    const lifecycleSource = readFileSync(lifecyclePath, 'utf8');
    const expected = compileHSPlusStateMachineToKotlin(lifecycleSource, {
      machineName: 'ScannerLifecycle',
      className: 'ScannerLifecycleMachine',
      packageName: 'net.holoscript.qrscanner',
    });
    const out = new QuestCompiler().compile(parsed.ast!, '');
    const emitted = out[Object.keys(out).find((k) => k.endsWith('ScannerLifecycleMachine.kt'))!];
    const activity = out[Object.keys(out).find((k) => k.endsWith('StarterSampleActivity.kt'))!];
    expect(emitted).toBe(expected.code);
    expect(emitted).toContain(`HSI-IR digest: ${expected.irDigest}`);
    expect(activity).toContain('lifecycle.fireDecodeReady()');
    expect(activity).toContain('lifecycle.fireClassificationReady()');
    expect(activity).toContain('lifecycle.fireActionReady()');
    expect(activity).toContain('lifecycle.fireUserActionRequested()');
    expect(activity).toContain('recoverLifecycleToIdle()');
    expect(activity).toContain('if (resultCardShowing()) return');
    expect(activity).not.toContain('Scan ignored: lifecycle not ready');
    expect(activity.indexOf('if (!admitUserAction())')).toBeLessThan(
      activity.indexOf('openInQuestBrowser(url)')
    );

    const mutated = compileHSPlusStateMachineToKotlin(
      lifecycleSource.replace(
        'classified -> action when action_ready',
        'classified -> idle when action_ready'
      ),
      {
        machineName: 'ScannerLifecycle',
        className: 'ScannerLifecycleMachine',
        packageName: 'net.holoscript.qrscanner',
      }
    );
    expect(mutated.irDigest).not.toBe(expected.irDigest);
    expect(mutated.code).not.toBe(expected.code);
  });

  it('ScannerContent.kt carries values from the parsed trait configs', () => {
    const out = new QuestCompiler().compile(parsed.ast!, '');
    const content = out[Object.keys(out).find((k) => k.endsWith('ScannerContent.kt'))!];
    // spatial_panel.place.z = 1.5 (the panel-placement fix, from the spec)
    expect(content).toContain('const val panelZ = 1.5f');
    expect(content).toContain('const val panelY = 1.3f');
    const activity = out[Object.keys(out).find((k) => k.endsWith('StarterSampleActivity.kt'))!];
    expect(activity).toContain('private const val FOLLOW_DISTANCE = 1.2f');
    expect(activity).toContain('private const val FOLLOW_Y = -0.12f');
    expect(activity).toContain('QuadShapeOptions(width = 1.2f, height = 1.2f)');
    // tutorial.mock_qr.demo_url
    expect(content).toContain('https://holoscript.studio');
    // onboarding.tagline + 4 how_to_use rows (array-of-objects parsed; the 4th, "Into a world",
    // was added with the world_portal feature — assertion kept in sync with scanner.holo)
    expect(content).toContain('Read QR codes — right in mixed reality');
    expect((content.match(/HowTo\(/g) ?? []).length).toBe(4);
    // tutorial.steps
    expect(content).toContain('Look at a QR code in your space');
    expect(content).toContain('When it reads, a card appears');
    expect(content).toContain('Tap Open to launch it');
    expect(content).toContain('Scan a HoloScript world QR to step inside it');
  });

  it('strings.xml app_name comes from spatial_panel.title', () => {
    const out = new QuestCompiler().compile(parsed.ast!, '');
    const strings = out[Object.keys(out).find((k) => k.endsWith('strings.xml'))!];
    expect(strings).toContain('<string name="app_name">HoloQR</string>');
  });

  it('keeps a visible Scanning HUD so ambient scan does not look frozen', () => {
    const out = new QuestCompiler().compile(parsed.ast!, '');
    const panel = out[Object.keys(out).find((k) => k.endsWith('ScannerPanel.kt'))!];
    expect(panel).toContain('private fun ScanningHud()');
    expect(panel).toContain('ScanningHud()');
    expect(panel).not.toContain('while scanning, render NOTHING');
    expect(panel).toContain('ScannerState.screen = Screen.BOOKMARKS');
    expect(panel).toContain('val canonical = QrPayloadFacts.asWebUrl(url) ?: url');
    expect(panel).toContain('ScannerState.bookmarks.contains(canonical)');
    const bookmarkClick = panel.slice(
      panel.indexOf('val canonical = QrPayloadFacts.asWebUrl(url) ?: url'),
      panel.indexOf('Text("Bookmark")')
    );
    expect(bookmarkClick).toContain('ScannerState.screen = Screen.BOOKMARKS');
    expect(bookmarkClick).not.toContain('onDismiss?.invoke()');
  });

  it('shows a VR splash and does not crash launch if SplatFeature fails', () => {
    const out = new QuestCompiler().compile(parsed.ast!, '');
    const manifest = out[Object.keys(out).find((k) => k.endsWith('AndroidManifest.xml'))!];
    const activity = out[Object.keys(out).find((k) => k.endsWith('StarterSampleActivity.kt'))!];
    expect(manifest).toContain('android:name="com.oculus.ossplash"');
    expect(activity).toContain('SplatFeature unavailable');
    expect(activity).toContain('maybeStartScanner()');
    expect(activity).toContain('controller?.hasLiveSession() != true');
    expect(activity).toContain('fun asWebUrl(text: String): String?');
    expect(activity).toContain('val web = QrPayloadFacts.asWebUrl(text)');
    expect(activity).toContain('ScannerState.pendingUrl = QrPayloadFacts.asWebUrl(text) ?: text');
    expect(activity).toContain('Saved links: do not resume');
    expect(activity).toContain(
      'if (ScannerState.screen != Screen.SCANNING && ScannerState.screen != Screen.IN_WORLD) return'
    );
    const maybeStart = activity.slice(
      activity.indexOf('private fun maybeStartScanner()'),
      activity.indexOf('private fun onDecoded')
    );
    expect(maybeStart.indexOf('ScannerState.screen != Screen.SCANNING')).toBeLessThan(
      maybeStart.indexOf('controller != null')
    );
    expect(activity).toContain('recoverLifecycleToIdle()');
  });

  it('privacy policy uses the store listing name HoloQR', () => {
    const privacy = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        '..',
        'apps',
        'quest-universal-qr-scanner',
        'PRIVACY.md'
      ),
      'utf8'
    );
    expect(privacy).toMatch(/^# Privacy Policy — HoloQR/m);
    expect(privacy).toContain('HoloQR ("the app")');
    expect(privacy).not.toMatch(/Universal QR Scanner/);
  });

  it('requests the headset camera from Start scanning, not VR launch', () => {
    const out = new QuestCompiler().compile(parsed.ast!, '');
    const activity = out[Object.keys(out).find((k) => k.endsWith('StarterSampleActivity.kt'))!];
    const onCreate = activity.split('override fun onResume')[0];
    expect(onCreate).not.toContain('requestPermissions(arrayOf(cameraPermission), REQUEST_CAMERA)');
    expect(activity).toContain('Waiting for camera permission');
    expect(activity).toContain('requestPermissions(arrayOf(cameraPermission), REQUEST_CAMERA)');
    expect(activity).toContain('maybeStartScanner()');
  });

  it('an empty composition still emits the 2D panel (golden-compat fallback)', () => {
    const out = new QuestCompiler().compile({ objects: [] } as never, '');
    const keys = Object.keys(out);
    expect(keys.some((k) => k.endsWith('MainActivity.kt'))).toBe(true);
    expect(keys.length).toBe(11);
  });
});

// =============================================================================
// Scene blocks
// =============================================================================
// The parser keeps what a `scene "X" { ... }` block holds on composition.scenes, not on
// composition.objects. A Quest app is built from the traits on the composition's objects, so
// the traits written inside a scene were never read: the composition compiled to the default
// 2D panel, or to the MR app without the values the traits set.

const READER_HOLO = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'apps',
  'quest-real-world-reader',
  'reader.holo'
);

function parseClean(source: string): HoloComposition {
  const result = new HoloCompositionParser().parse(source);
  if (!result.success || !result.ast || (result.errors ?? []).length > 0) {
    throw new Error(`parse failed: ${JSON.stringify(result.errors)}`);
  }
  return result.ast;
}

/** The same composition with every object moved inside one scene block, traits and all. */
function objectsIntoAScene(composition: HoloComposition): HoloComposition {
  return {
    ...composition,
    objects: [],
    scenes: [{ type: 'Scene', name: 'Main', objects: composition.objects }],
  };
}

const fileEnding = (out: Record<string, string>, suffix: string): string => {
  const key = Object.keys(out).find((k) => k.endsWith(suffix));
  if (!key) throw new Error(`no file ends with ${suffix}`);
  return out[key];
};

describe('QuestCompiler: traits and environment written inside scene blocks', () => {
  const mr = (source: string) => new QuestCompiler().compile(parseClean(source), '');

  it('compiles the scanner app from objects that are all inside a scene exactly as from the top level', () => {
    const scanner = parseClean(readFileSync(SCANNER_HOLO, 'utf8'));
    const moved = objectsIntoAScene(scanner);
    expect(moved.objects).toEqual([]);
    expect(scanner.objects.length).toBeGreaterThanOrEqual(5);

    const out = new QuestCompiler().compile(moved, '');
    expect(Object.keys(out).some((k) => k.endsWith('ScannerPanel.kt'))).toBe(true);
    expect(out).toEqual(new QuestCompiler().compile(scanner, ''));
  });

  it('compiles the reader app from objects that are all inside a scene exactly as from the top level', () => {
    const reader = parseClean(readFileSync(READER_HOLO, 'utf8'));
    const moved = objectsIntoAScene(reader);
    expect(moved.objects).toEqual([]);

    const out = new QuestCompiler().compile(moved, '');
    expect(Object.keys(out).some((k) => k.endsWith('ReaderPanel.kt'))).toBe(true);
    expect(out).toEqual(new QuestCompiler().compile(reader, ''));
  });

  it('picks the MR app from a trait written only inside a scene, not the 2D panel', () => {
    const out = mr(`composition "MR" {
  scene "Main" {
    object "panel" {
      @spatial_panel { title: "SceneQR" }
    }
  }
}`);
    const keys = Object.keys(out);
    expect(keys.some((k) => k.endsWith('ScannerPanel.kt'))).toBe(true);
    expect(keys.some((k) => k.endsWith('MainActivity.kt'))).toBe(false);
    expect(fileEnding(out, 'strings.xml')).toContain('<string name="app_name">SceneQR</string>');
  });

  it('reads the values of a trait written inside a scene', () => {
    const out = mr(`composition "MR" {
  environment { surface: "immersive_mr" package: "net.holoscript.qrscanner" }
  scene "Main" {
    object "panel" {
      @spatial_panel { title: "SceneQR" place: { x: 0.25, y: 0.5, z: -1.2 } }
    }
  }
}`);
    expect(fileEnding(out, 'strings.xml')).toContain('SceneQR');
    const content = fileEnding(out, 'ScannerContent.kt');
    expect(content).toContain('const val panelX = 0.25f');
    expect(content).toContain('const val panelY = 0.5f');
    expect(content).toContain('const val panelZ = -1.2f');
  });

  it("reads top-level objects first, then each scene's objects in scene order: a value written later replaces an earlier one", () => {
    // The top-level object is written between the scenes; it is still read first.
    const title = (source: string) =>
      /<string name="app_name">([^<]*)<\/string>/.exec(fileEnding(mr(source), 'strings.xml'))![1];
    expect(
      title(`composition "MR" {
  scene "First" { object "a" { @spatial_panel { title: "FirstQR" } } }
  object "top" { @spatial_panel { title: "TopQR" } }
  scene "Second" { object "b" { @spatial_panel { title: "SecondQR" } } }
}`)
    ).toBe('SecondQR');
    expect(
      title(`composition "MR" {
  scene "First" { object "a" { @spatial_panel { title: "FirstQR" } } }
  object "top" { @spatial_panel { title: "TopQR" } }
}`)
    ).toBe('FirstQR');
    // A trait that sets only some values leaves the others as an earlier object set them.
    const content = fileEnding(
      mr(`composition "MR" {
  object "top" { @spatial_panel { place: { x: 1, y: 2, z: -3 } } }
  scene "Main" { object "a" { @spatial_panel { title: "SceneQR" } } }
}`),
      'ScannerContent.kt'
    );
    expect(content).toContain('const val panelX = 1.0f');
    expect(content).toContain('const val panelZ = -3.0f');
  });

  it("uses the environment written inside a scene when the composition has none, and the composition's own otherwise", () => {
    const fromScene = mr(`composition "MR" {
  scene "Main" {
    environment {
      surface: "immersive_mr"
      package: "net.holoscript.qrscanner"
      version: { code: 7 name: "2.0.0" }
    }
    object "panel" { @spatial_panel { title: "SceneQR" } }
  }
}`);
    // The scene's environment is what selects the MR app and sets its version.
    expect(Object.keys(fromScene).some((k) => k.endsWith('ScannerPanel.kt'))).toBe(true);
    const gradle = fileEnding(fromScene, 'app/build.gradle.kts');
    expect(gradle).toContain('versionCode = 7');
    expect(gradle).toContain('versionName = "2.0.0"');

    const own = mr(`composition "MR" {
  scene "Main" {
    environment { version: { code: 9 name: "9.9.9" } }
    object "panel" { @spatial_panel { title: "SceneQR" } }
  }
  environment {
    surface: "immersive_mr"
    package: "net.holoscript.qrscanner"
    version: { code: 5 name: "1.0.4" }
  }
}`);
    const ownGradle = fileEnding(own, 'app/build.gradle.kts');
    expect(ownGradle).toContain('versionCode = 5');
    expect(ownGradle).toContain('versionName = "1.0.4"');
    expect(ownGradle).not.toContain('9.9.9');
  });

  it('still emits the 2D panel for scenes that carry no Quest trait', () => {
    const out = mr(`composition "Plain" {
  scene "Main" {
    object "Crate" { geometry: "cube" }
  }
}`);
    expect(Object.keys(out).some((k) => k.endsWith('MainActivity.kt'))).toBe(true);
    expect(Object.keys(out)).toHaveLength(11);
  });
});

describe('quest world emit: scene blocks', () => {
  const crate = `object "SceneCrate" {
      geometry: "sphere"
      position: [1.5, 2.5, -3.5]
      color: "#ff0000"
    }`;

  it('emits an object written only inside a scene like the same object at the top level', () => {
    const inScene = parseClean(`composition "World" {\n  scene "Main" {\n    ${crate}\n  }\n}`);
    const atTop = parseClean(`composition "World" {\n  ${crate}\n}`);
    expect(inScene.objects).toEqual([]);

    const kt = emitWorldSceneKt(inScene, 'scene-test');
    expect(kt).toContain('// object "SceneCrate" (sphere)');
    expect(kt).toContain('Mesh(Uri.parse("mesh://sphere"))');
    expect(kt).toContain('Transform(Pose(Vector3(1.5f, 2.5f, -3.5f)))');
    expect(kt).toBe(emitWorldSceneKt(atTop, 'scene-test'));
  });

  it("emits top-level objects first, then each scene's objects in scene order", () => {
    const kt = emitWorldSceneKt(
      parseClean(`composition "World" {
  scene "First" {
    object "InFirst" { geometry: "cube" }
  }
  object "AtTop" { geometry: "cube" }
  scene "Second" {
    object "InSecond" { geometry: "cube" }
  }
}`),
      'order-test'
    );
    const order = ['AtTop', 'InFirst', 'InSecond'].map((n) => kt.indexOf(`// object "${n}"`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('builds every scene object, even under a name already used: nothing here is declared by name', () => {
    // An entity has no name in the Kotlin, and an animated one is `o<its place in the list>`.
    const kt = emitWorldSceneKt(
      parseClean(`composition "World" {
  object "Orb" { geometry: "sphere" motion: "spin" }
  scene "Day" {
    object "Orb" { geometry: "sphere" motion: "bob" }
  }
  scene "Night" {
    object "Orb" { geometry: "sphere" }
  }
}`),
      'names-test'
    );
    expect(kt.match(/\/\/ object "Orb"/g)).toHaveLength(3);
    expect(kt.match(/val o\d+ =/g)).toEqual(['val o0 =', 'val o1 =']);
    expect(kt).not.toContain('WARNING');
  });

  it('uses the environment written inside a scene for the sky when the composition has none', () => {
    const kt = emitWorldSceneKt(
      parseClean(`composition "World" {
  scene "Main" {
    environment { background: "#ff0000" }
  }
}`),
      'sky-test'
    );
    expect(kt).toContain('Color4(1.0f, 0.0f, 0.0f, 1.0f)');
    expect(kt).not.toContain('WARNING');
  });

  it("names a scene environment it does not apply, and says the composition's own applies", () => {
    // The composition's own environment is written after the scenes; it still wins.
    const kt = emitWorldSceneKt(
      parseClean(`composition "World" {
  scene "Night" {
    environment { background: "#ff0000" }
  }
  scene "Dusk" {
    environment { background: "#00ff00" }
  }
  environment { background: "#0000ff" }
}`),
      'sky-test'
    );
    expect(kt).toContain('Color4(0.0f, 0.0f, 1.0f, 1.0f)');
    expect(kt).not.toContain('Color4(1.0f, 0.0f, 0.0f, 1.0f)');
    expect(kt).toContain(
      `// WARNING: the environment in scene "Night" is not applied: this output is one world with one environment, and the composition's own environment applies.`
    );
    expect(kt).toContain(
      `// WARNING: the environment in scene "Dusk" is not applied: this output is one world with one environment, and the composition's own environment applies.`
    );
  });

  it('names the first scene environment that applies when two scenes have one and the composition none', () => {
    const kt = emitWorldSceneKt(
      parseClean(`composition "World" {
  scene "Day" {
    environment { background: "#00ff00" }
  }
  scene "Night" {
    environment { background: "#ff0000" }
  }
}`),
      'sky-test'
    );
    expect(kt).toContain('Color4(0.0f, 1.0f, 0.0f, 1.0f)');
    expect(kt).toContain(
      '// WARNING: the environment in scene "Night" is not applied: this output is one world with one environment, and the environment in scene "Day" applies.'
    );
  });

  it('writes the warnings ahead of the world, so an opt-in annotation still sits on the object', () => {
    const kt = emitWorldSceneKt(
      parseClean(`composition "World" {
  environment { background: "#0000ff" }
  scene "Night" {
    environment { background: "#ff0000" }
    object "Cloud" { splat: "cloud.spz" }
  }
}`),
      'splat-test'
    );
    const warning = kt.indexOf('// WARNING:');
    const optIn = kt.indexOf('@OptIn(SpatialSDKExperimentalSplatAPI::class)');
    const world = kt.indexOf('object World_splat_test {');
    expect(warning).toBeGreaterThan(kt.indexOf('*/'));
    expect(optIn).toBeGreaterThan(warning);
    expect(world).toBeGreaterThan(optIn);
    expect(kt.slice(optIn, world)).toBe('@OptIn(SpatialSDKExperimentalSplatAPI::class)\n');
    expect(kt).toContain('Splat(Uri.parse("apk:///splats/cloud.spz"))');
  });
});
