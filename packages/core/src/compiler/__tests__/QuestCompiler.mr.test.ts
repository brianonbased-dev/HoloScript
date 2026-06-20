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
    expect(ctl).toContain('"frame_latest_${image.width}x${image.height}.gray"');
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

  it('ScannerContent.kt carries values from the parsed trait configs', () => {
    const out = new QuestCompiler().compile(parsed.ast!, '');
    const content = out[Object.keys(out).find((k) => k.endsWith('ScannerContent.kt'))!];
    // spatial_panel.place.z = 1.5 (the panel-placement fix, from the spec)
    expect(content).toContain('const val panelZ = 1.5f');
    expect(content).toContain('const val panelY = 1.3f');
    // tutorial.mock_qr.demo_url
    expect(content).toContain('https://holoscript.studio');
    // onboarding.tagline + 3 how_to_use rows (array-of-objects parsed)
    expect(content).toContain('Read any QR code');
    expect((content.match(/HowTo\(/g) ?? []).length).toBe(3);
    // tutorial.steps (3 strings)
    expect((content.match(/Look at any QR code|When it reads|Tap Open/g) ?? []).length).toBe(3);
  });

  it('strings.xml app_name comes from spatial_panel.title', () => {
    const out = new QuestCompiler().compile(parsed.ast!, '');
    const strings = out[Object.keys(out).find((k) => k.endsWith('strings.xml'))!];
    expect(strings).toContain('<string name="app_name">Universal QR Scanner</string>');
  });

  it('an empty composition still emits the 2D panel (golden-compat fallback)', () => {
    const out = new QuestCompiler().compile({ objects: [] } as never, '');
    const keys = Object.keys(out);
    expect(keys.some((k) => k.endsWith('MainActivity.kt'))).toBe(true);
    expect(keys.length).toBe(11);
  });
});
