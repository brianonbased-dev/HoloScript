/**
 * HoloScript → Meta Quest Compiler (production target `quest`).
 *
 * Emits a native Meta Quest (Horizon OS) app project. Distinct from `android-xr`, which targets
 * GOOGLE Android XR (Jetpack XR `androidx.xr` / ARCore / Filament). `quest` targets META's runtime:
 * Camera2 passthrough (`horizonos.permission.HEADSET_CAMERA`), ZXing decode, the `ovrweb://webtask`
 * browser intent, Quest device targeting, and (later) the Meta Spatial SDK for immersive panels.
 *
 * Reference app + drift guard: `apps/quest-universal-qr-scanner` is the golden reference; the
 * gate `scripts/holo-ci/check-quest-emit-matches-reference.mjs` fails on any drift between emitted
 * output and that reference. Files flip reference→emitted smallest-first; emitted output must
 * byte-match the maintained reference (pre-mortem keystone — prevents a string-templater silently
 * diverging and re-shipping fixed bugs).
 *
 * STATUS: first production slice — emits the spec-driven config resource (`generated.xml`). The
 * Kotlin/manifest/gradle remain hand-authored in the reference and are ported file-by-file behind
 * the gate. Trait-driven config (@passthrough_camera / @qr_decode) replaces the option defaults
 * as the scanner is re-authored as a real HoloComposition.
 */
import { CompilerBase } from './CompilerBase';
import type { HoloComposition } from '../parser/HoloCompositionTypes';

export interface QuestCompilerOptions {
  packageName?: string;
  appName?: string;
  dedupeWindowMs?: number;
  frameWidth?: number;
  frameHeight?: number;
  cameraSource?: number;
  cameraPosition?: number;
  webtaskScheme?: string;
  privacyNote?: string;
}

export class QuestCompiler extends CompilerBase {
  protected readonly compilerName = 'QuestCompiler';
  public options: Required<QuestCompilerOptions>;

  constructor(options: QuestCompilerOptions = {}) {
    super();
    this.options = {
      packageName: options.packageName ?? 'net.holoscript.qrscanner',
      appName: options.appName ?? 'Universal QR Scanner',
      dedupeWindowMs: options.dedupeWindowMs ?? 2500,
      frameWidth: options.frameWidth ?? 1280,
      frameHeight: options.frameHeight ?? 960,
      cameraSource: options.cameraSource ?? 0,
      cameraPosition: options.cameraPosition ?? 0,
      webtaskScheme: options.webtaskScheme ?? 'ovrweb://webtask?uri=',
      privacyNote:
        options.privacyNote ?? 'Frames are decoded on-device. Nothing is stored or sent.',
    };
  }

  compile(
    composition: HoloComposition,
    agentToken: string,
    outputPath?: string
  ): Record<string, string> {
    this.validateCompilerAccess(agentToken, outputPath);
    const appName = (composition?.name as string) || this.options.appName;
    return {
      'app/src/main/res/values/generated.xml': this.emitGeneratedXml(appName),
    };
  }

  private emitGeneratedXml(appName: string): string {
    const o = this.options;
    const esc = (s: string) =>
      String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<?xml version="1.0" encoding="utf-8"?>
<!-- @generated from scanner.holo by generate.mjs — DO NOT EDIT. Run: node generate.mjs -->
<resources>
    <string name="app_name">${esc(appName)}</string>
    <string name="privacy_note">${esc(o.privacyNote)}</string>
    <string name="webtask_scheme">${esc(o.webtaskScheme)}</string>
    <integer name="dedupe_window_ms">${o.dedupeWindowMs}</integer>
    <integer name="frame_width">${o.frameWidth}</integer>
    <integer name="frame_height">${o.frameHeight}</integer>
    <integer name="camera_source">${o.cameraSource}</integer>
    <integer name="camera_position">${o.cameraPosition}</integer>
</resources>
`;
  }
}
