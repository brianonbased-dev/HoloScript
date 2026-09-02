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
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';
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
    expect(proguard).toContain(
      '-keepclassmembers,includedescriptorclasses class com.meta.spatial.**'
    );
    expect(proguard).toContain('*** native*(...);');
    expect(proguard).toContain('-keep class com.meta.spatial.**.R { *; }');
    expect(proguard).toContain('-keep class com.meta.spatial.**.R$* { *; }');
    expect(proguard).toContain('-keep class com.meta.spatial.toolkit.** { *; }');
    expect(proguard).toContain('-keep class com.meta.spatial.isdk.** { *; }');
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
    expect(activity).toContain('URI(trimmed).parseServerAuthority()');
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
  });

  it('shows a VR splash and does not crash launch if SplatFeature fails', () => {
    const out = new QuestCompiler().compile(parsed.ast!, '');
    const manifest = out[Object.keys(out).find((k) => k.endsWith('AndroidManifest.xml'))!];
    const activity = out[Object.keys(out).find((k) => k.endsWith('StarterSampleActivity.kt'))!];
    expect(manifest).toContain('android:name="com.oculus.ossplash"');
    expect(activity).toContain('SplatFeature unavailable');
    expect(activity).toContain('maybeStartScanner()');
  });

  it('privacy policy uses the store listing name HoloQR', () => {
    const privacy = readFileSync(
      join(__dirname, '..', '..', '..', '..', '..', 'apps', 'quest-universal-qr-scanner', 'PRIVACY.md'),
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
