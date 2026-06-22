/**
 * Quest immersive-MR emit (surface: immersive_mr) for the `quest` compile target.
 *
 * NATIVE trait-dispatch: collectQuestMrFeatures() walks composition.objects[].traits[].config (the
 * real HoloCompositionParser output — NO regex) for the five registered capability traits
 * (passthrough_camera, qr_decode, spatial_panel, onboarding, tutorial) and resolves the feature set,
 * defaults equal to the canonical scanner. The emit* functions turn that feature set into the
 * @generated Meta Spatial SDK app files: ScannerContent.kt + strings.xml are built in code (dynamic
 * lists); the four behavior files (QrDecoder / PassthroughCameraController / ScannerPanel /
 * StarterSampleActivity) come from readable .kt.tmpl templates (src/compiler/quest-mr-templates/,
 * inlined via the generated module) with {{TOKEN}} markers replaced from the feature set.
 *
 * The capability VALUES live in scanner.holo (the spec); the Kotlin is generated here (the compiler
 * backend). Editing the app is a scanner.holo edit — never a hand-edit of generated Kotlin (F.126).
 */
import type { HoloComposition, HoloObjectTrait, HoloValue } from '../parser/HoloCompositionTypes';
import { QUEST_MR_TEMPLATES, QUEST_MR_COMPILED_LOGIC } from './quest-mr-templates.generated';

// ── HoloValue accessors ──────────────────────────────────────────────────────
type Obj = Record<string, HoloValue>;
const vstr = (v: HoloValue | undefined, d: string): string => (typeof v === 'string' ? v : d);
const vnum = (v: HoloValue | undefined, d: number): number => (typeof v === 'number' ? v : d);
const vbool = (v: HoloValue | undefined, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const vobj = (v: HoloValue | undefined): Obj =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {};
const varr = (v: HoloValue | undefined): HoloValue[] => (Array.isArray(v) ? v : []);

// ── Resolved feature set (defaults == canonical scanner.holo) ────────────────
export interface QuestHowTo {
  context: string;
  icon: string;
  text: string;
}
/** A QR content-classification rule (from @qr_decode.content_types) → an on-device when-arm. */
export interface QuestContentType {
  kind: string; // url | wifi | contact | email | phone | sms | geo | event | …
  action: string; // 'open' (Quest browser) | 'copy' (clipboard)
  label: string; // result-card heading
  prefixes: string[]; // case-insensitive payload prefixes that identify this kind
}
export interface QuestMrFeatures {
  packageName: string;
  appName: string;
  panelX: number;
  panelY: number;
  panelZ: number;
  panelQuadW: number;
  panelQuadH: number;
  reticleFraction: number;
  viewfinderHeightDp: number;
  followDistance: number;
  permission: string;
  cameraSource: number;
  cameraPosition: number;
  frameWidth: number;
  frameHeight: number;
  captureMax: boolean;
  previewDownscale: number;
  tryHarder: boolean;
  alsoInverted: boolean;
  centerCropW: number;
  centerCropH: number;
  decodeIntervalMs: number;
  dedupeWindowMs: number;
  feedbackSound: boolean; // qr_decode.feedback.sound — beep on decode
  title: string;
  tagline: string;
  howTo: QuestHowTo[];
  aimTip: string;
  startAction: string;
  tutorialAction: string;
  tutorialHeading: string;
  demoUrl: string;
  mockQrDp: number;
  steps: string[];
  // world_portal — scan a QR → enter a HoloScript world (immerse), keep scanning inside it.
  worldLinkPatterns: string[];
  autoImmerse: boolean;
  keepScanningInWorld: boolean;
  enteringLabel: string;
  leaveAction: string;
  demoWorldUrl: string;
  // qr_decode.content_types — universal content classification rule table (+ fallback).
  contentTypes: QuestContentType[];
  fallbackKind: string;
  fallbackAction: string;
  fallbackLabel: string;
}

function defaults(): QuestMrFeatures {
  return {
    packageName: 'net.holoscript.qrscanner',
    appName: 'Universal QR Scanner',
    panelX: 0.0,
    panelY: 1.3,
    panelZ: 1.5,
    panelQuadW: 1.2,
    panelQuadH: 1.2,
    reticleFraction: 0.62,
    viewfinderHeightDp: 360,
    followDistance: 1.2,
    permission: 'horizonos.permission.HEADSET_CAMERA',
    cameraSource: 0,
    cameraPosition: 0,
    frameWidth: 1280,
    frameHeight: 960,
    captureMax: true,
    previewDownscale: 4,
    tryHarder: true,
    alsoInverted: true,
    centerCropW: 640,
    centerCropH: 480,
    decodeIntervalMs: 200,
    dedupeWindowMs: 2500,
    feedbackSound: true,
    title: 'Universal QR Scanner',
    tagline: 'Read any QR code — right in mixed reality',
    howTo: [],
    aimTip: '',
    startAction: 'Start scanning',
    tutorialAction: 'See how it works',
    tutorialHeading: 'How it works',
    demoUrl: 'https://holoscript.studio',
    mockQrDp: 180,
    steps: [],
    worldLinkPatterns: [
      'holoscript://world/',
      'https://holoscript.studio/w/',
      'https://hololand.holoscript.studio/',
    ],
    autoImmerse: true,
    keepScanningInWorld: true,
    enteringLabel: 'Entered',
    leaveAction: 'Leave world',
    demoWorldUrl: 'holoscript://world/hololand',
    // Defaults mirror scanner.holo's @qr_decode.content_types so emit == reference even if a spec
    // omits the table; scanner.holo is authoritative when it declares it.
    contentTypes: [
      { kind: 'url', action: 'open', label: 'Link', prefixes: ['http://', 'https://'] },
      { kind: 'wifi', action: 'copy', label: 'Wi-Fi network', prefixes: ['WIFI:'] },
      { kind: 'contact', action: 'copy', label: 'Contact card', prefixes: ['BEGIN:VCARD', 'MECARD:'] },
      { kind: 'email', action: 'copy', label: 'Email', prefixes: ['mailto:', 'MATMSG:'] },
      { kind: 'phone', action: 'copy', label: 'Phone number', prefixes: ['tel:'] },
      { kind: 'sms', action: 'copy', label: 'Message', prefixes: ['sms:', 'smsto:'] },
      { kind: 'geo', action: 'copy', label: 'Location', prefixes: ['geo:'] },
      { kind: 'event', action: 'copy', label: 'Calendar event', prefixes: ['BEGIN:VEVENT'] },
    ],
    fallbackKind: 'text',
    fallbackAction: 'copy',
    fallbackLabel: 'Text',
  };
}

/** Is this composition an immersive-MR Quest app? (environment.surface or a spatial_panel trait). */
export function isImmersiveMr(composition?: HoloComposition): boolean {
  if (!composition) return false;
  const surface = composition.environment?.properties?.find((p) => p.key === 'surface')?.value;
  if (typeof surface === 'string' && surface === 'immersive_mr') return true;
  return (composition.objects ?? []).some((o) =>
    (o.traits ?? []).some((t) => t.name === 'spatial_panel')
  );
}

/** NATIVE trait-dispatch: resolve the MR feature set from the parsed composition's trait configs. */
export function collectQuestMrFeatures(composition?: HoloComposition): QuestMrFeatures {
  const f = defaults();
  if (!composition) return f;

  const env = composition.environment?.properties ?? [];
  f.packageName = vstr(env.find((p) => p.key === 'package')?.value as HoloValue, f.packageName);

  for (const obj of composition.objects ?? []) {
    for (const t of (obj.traits ?? []) as HoloObjectTrait[]) {
      const c: Obj = t.config ?? {};
      switch (t.name) {
        case 'passthrough_camera':
          f.permission = vstr(c.permission, f.permission);
          f.cameraSource = vnum(c.camera_source, f.cameraSource);
          f.cameraPosition = vnum(c.camera_position, f.cameraPosition);
          f.frameWidth = vnum(c.frame_width, f.frameWidth);
          f.frameHeight = vnum(c.frame_height, f.frameHeight);
          f.captureMax = vstr(c.capture, f.captureMax ? 'max' : 'fixed') === 'max';
          f.previewDownscale = vnum(c.preview_downscale, f.previewDownscale);
          break;
        case 'qr_decode': {
          f.tryHarder = vbool(c.try_harder, f.tryHarder);
          f.alsoInverted = vbool(c.also_inverted, f.alsoInverted);
          const crop = vobj(c.center_crop);
          f.centerCropW = vnum(crop.width, f.centerCropW);
          f.centerCropH = vnum(crop.height, f.centerCropH);
          f.decodeIntervalMs = vnum(c.decode_interval_ms, f.decodeIntervalMs);
          f.dedupeWindowMs = vnum(c.dedupe_window_ms, f.dedupeWindowMs);
          f.feedbackSound = vbool(vobj(c.feedback).sound, f.feedbackSound);
          // Universal content classification table → on-device classifyContent() when-arms.
          const cts = varr(c.content_types)
            .map((row) => {
              const r = vobj(row);
              return {
                kind: vstr(r.kind, ''),
                action: vstr(r.action, 'copy'),
                label: vstr(r.label, ''),
                prefixes: varr(r.prefixes)
                  .map((p) => (typeof p === 'string' ? p : ''))
                  .filter((p) => p.length > 0),
              };
            })
            .filter((ct) => ct.kind.length > 0 && ct.prefixes.length > 0);
          if (cts.length > 0) f.contentTypes = cts;
          const fb = vobj(c.fallback_type);
          if (Object.keys(fb).length > 0) {
            f.fallbackKind = vstr(fb.kind, f.fallbackKind);
            f.fallbackAction = vstr(fb.action, f.fallbackAction);
            f.fallbackLabel = vstr(fb.label, f.fallbackLabel);
          }
          break;
        }
        case 'spatial_panel': {
          const place = vobj(c.place);
          f.panelX = vnum(place.x, f.panelX);
          f.panelY = vnum(place.y, f.panelY);
          f.panelZ = vnum(place.z, f.panelZ);
          const size = vobj(c.size);
          f.panelQuadW = vnum(size.width, f.panelQuadW);
          f.panelQuadH = vnum(size.height, f.panelQuadH);
          f.appName = vstr(c.title, f.appName);
          f.reticleFraction = vnum(c.reticle_fraction, f.reticleFraction);
          f.viewfinderHeightDp = vnum(vobj(c.viewfinder).height_dp, f.viewfinderHeightDp);
          f.followDistance = vnum(c.follow_distance, f.followDistance);
          break;
        }
        case 'onboarding':
          f.title = vstr(c.title, f.title);
          f.tagline = vstr(c.tagline, f.tagline);
          f.howTo = varr(c.how_to_use).map((row) => {
            const r = vobj(row);
            return { context: vstr(r.context, ''), icon: vstr(r.icon, ''), text: vstr(r.text, '') };
          });
          f.aimTip = vstr(c.aim_tip, f.aimTip);
          f.startAction = vstr(c.start_action, f.startAction);
          f.tutorialAction = vstr(c.tutorial_action, f.tutorialAction);
          break;
        case 'tutorial':
          f.tutorialHeading = vstr(c.heading, f.tutorialHeading);
          f.demoUrl = vstr(vobj(c.mock_qr).demo_url, f.demoUrl);
          f.mockQrDp = vnum(vobj(c.mock_qr).display_dp, f.mockQrDp);
          f.steps = varr(c.steps).map((s) => (typeof s === 'string' ? s : ''));
          break;
        case 'world_portal': {
          const pats = varr(c.link_patterns)
            .map((p) => (typeof p === 'string' ? p : ''))
            .filter((p) => p.length > 0);
          if (pats.length > 0) f.worldLinkPatterns = pats;
          f.autoImmerse = vbool(c.auto_immerse, f.autoImmerse);
          f.keepScanningInWorld = vbool(c.keep_scanning, f.keepScanningInWorld);
          f.enteringLabel = vstr(c.entering_label, f.enteringLabel);
          f.leaveAction = vstr(c.leave_action, f.leaveAction);
          f.demoWorldUrl = vstr(c.demo_world_url, f.demoWorldUrl);
          break;
        }
      }
    }
  }
  return f;
}

// ── Emit ─────────────────────────────────────────────────────────────────────
// The emitted app package = scanner.holo's `environment.package`. This const is the single source
// the scanner + world emit share; the parser reads the declaration into `f.packageName` (see :141)
// and emitQuestMrFiles asserts they match, so scanner.holo's declaration is AUTHORITATIVE — the emit
// refuses to drift from it (a Horizon Store ships its own id, never Meta's sample namespace).
export const PKG = 'net.holoscript.qrscanner';
const SRC_DIR = `app/src/main/java/${PKG.replace(/\./g, '/')}`;
const GEN_REL = `${SRC_DIR}/ScannerContent.kt`;
const STRINGS_REL = 'app/src/main/res/values/strings.xml';
const DECODER_REL = `${SRC_DIR}/QrDecoder.kt`;
const CONTROLLER_REL = `${SRC_DIR}/PassthroughCameraController.kt`;
const PANEL_REL = `${SRC_DIR}/ScannerPanel.kt`;
const ACTIVITY_REL = `${SRC_DIR}/StarterSampleActivity.kt`;
const WORLDPORTAL_REL = `${SRC_DIR}/WorldPortal.kt`;
const WORLDRENDERER_REL = `${SRC_DIR}/WorldRenderer.kt`;

const kstr = (s: string): string =>
  '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$') + '"';
const fnum = (n: number): string => (String(n).includes('.') ? `${n}f` : `${n}.0f`);
const xesc = (s: string): string =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, "\\'");

/**
 * Build the body of the @generated Kotlin `classifyContent()` when-block from the content-type rule
 * table. Each rule → a `pre(...) -> QrContent(kind, label, action)` arm; the fallback → the `else`.
 * `pre()` is a case-insensitive startsWith helper defined in the template. First match wins.
 */
function buildContentWhen(f: QuestMrFeatures): string {
  const kact = (a: string): string => (a === 'open' ? 'QrAction.OPEN' : 'QrAction.COPY');
  const arms = f.contentTypes.map((ct) => {
    const pres = ct.prefixes.map((p) => kstr(p)).join(', ');
    return `      pre(${pres}) -> QrContent(${kstr(ct.kind)}, ${kstr(ct.label)}, ${kact(ct.action)})`;
  });
  arms.push(
    `      else -> QrContent(${kstr(f.fallbackKind)}, ${kstr(f.fallbackLabel)}, ${kact(f.fallbackAction)})`
  );
  return arms.join('\n');
}

/**
 * The WorldPortal recognition/naming logic, compiled from quest-mr-logic/WorldPortal.logic.hs to
 * Kotlin via the canonical Rust/WASM grammar (gen-quest-mr-templates.mjs). Trailing newline is
 * trimmed so the template's `{{WORLDPORTAL_LOGIC}}` (already on its own line) injects cleanly.
 * Fails loud if the compiled block is missing — a missing block means the build skipped the .hs
 * compile, which must not silently ship an empty WorldPortal.
 */
function worldPortalLogic(): string {
  const logic = QUEST_MR_COMPILED_LOGIC['WorldPortal'];
  if (logic == null || logic.trim().length === 0) {
    throw new Error(
      'quest-mr-emit: missing compiled WorldPortal logic. Run `node scripts/gen-quest-mr-templates.mjs` ' +
        'in packages/core after building packages/compiler-wasm (pkg-node).'
    );
  }
  return logic.replace(/\n+$/, '');
}

/**
 * The continuous-locomotion integration MATH, compiled from quest-mr-logic/Locomotion.logic.hs to
 * Kotlin via the canonical Rust/WASM grammar (gen-quest-mr-templates.mjs). The compiled functions
 * (newYaw / gazeLength / normalize / groundRightX / newX / newZ — all pure Float math) are injected
 * into StarterSampleActivity.kt.tmpl's `{{LOCOMOTION_LOGIC}}` marker (a private `Locomotion` object
 * on the activity); the Kotlin shell's updateLocomotion() reads the stick inputs + the SDK gaze pose
 * and calls these for ALL arithmetic. Fails loud if missing — a missing block means the build skipped
 * the .hs compile, which must not silently ship un-compiled (hand-Kotlin) locomotion math.
 */
function locomotionLogic(): string {
  const logic = QUEST_MR_COMPILED_LOGIC['Locomotion'];
  if (logic == null || logic.trim().length === 0) {
    throw new Error(
      'quest-mr-emit: missing compiled Locomotion logic. Run `node scripts/gen-quest-mr-templates.mjs` ' +
        'in packages/core after building packages/compiler-wasm (pkg-node).'
    );
  }
  // The logic is compiled at 2-space indent (object-member depth). Unlike WorldPortal — a TOP-level
  // object — Locomotion is nested inside the activity class, so its members sit one level deeper.
  // Re-indent each non-blank line by two more spaces so the emitted object reads cleanly; blank
  // lines stay blank. (Kotlin is whitespace-insensitive — this is purely for readable output.)
  return logic
    .replace(/\n+$/, '')
    .split('\n')
    .map((line) => (line.length === 0 ? line : '  ' + line))
    .join('\n');
}

/** Replace {{TOKEN}} markers in a .kt.tmpl with feature values. */
function applyTokens(tmplName: string, f: QuestMrFeatures): string {
  const tmpl = QUEST_MR_TEMPLATES[tmplName];
  if (tmpl == null) throw new Error(`quest-mr-emit: missing template ${tmplName}`);
  const map: Record<string, string | number> = {
    PKG,
    CAMERA_SOURCE: f.cameraSource,
    CAMERA_POSITION: f.cameraPosition,
    DECODE_INTERVAL_MS: f.decodeIntervalMs,
    DEDUPE_MS: f.dedupeWindowMs,
    PREVIEW_DOWNSCALE: f.previewDownscale,
    CAP_WIDTH: f.frameWidth,
    CAP_HEIGHT: f.frameHeight,
    CENTER_CROP_W: f.centerCropW,
    CENTER_CROP_H: f.centerCropH,
    MOCK_QR_DP: f.mockQrDp,
    VIEWFINDER_HEIGHT_DP: f.viewfinderHeightDp,
    RETICLE_FRACTION: f.reticleFraction,
    PANEL_QUAD_W: f.panelQuadW,
    PANEL_QUAD_H: f.panelQuadH,
    FOLLOW_DISTANCE: f.followDistance,
    LINK_PATTERNS: 'listOf(' + f.worldLinkPatterns.map((p) => kstr(p)).join(', ') + ')',
    AUTO_IMMERSE: String(f.autoImmerse),
    CONTENT_WHEN: buildContentWhen(f),
    SCAN_SOUND: String(f.feedbackSound),
    // Recognition/naming logic compiled from quest-mr-logic/WorldPortal.logic.hs (.hs → Kotlin via
    // the canonical Rust/WASM grammar). The template owns only the data members + irreducible
    // stdlib helpers; this is the .hs-authored control flow.
    WORLDPORTAL_LOGIC: worldPortalLogic(),
    // Continuous-locomotion integration math compiled from quest-mr-logic/Locomotion.logic.hs
    // (.hs → Kotlin). The activity shell owns the state + SDK calls; this is the .hs-authored math.
    LOCOMOTION_LOGIC: locomotionLogic(),
  };
  return tmpl.replace(/\{\{([A-Z_]+)\}\}/g, (whole, key: string) =>
    key in map ? String(map[key]) : whole
  );
}

/** @generated ScannerContent.kt — the spec-driven content + placement the Compose panel reads. */
export function emitScannerContentKt(f: QuestMrFeatures): string {
  const howToLines = f.howTo
    .map((h) => `          HowTo(${kstr(h.context)}, ${kstr(h.text)}),`)
    .join('\n');
  const stepLines = f.steps.map((s) => `          ${kstr(s)},`).join('\n');
  return `package ${PKG}

/*
 * @generated from scanner.holo by the quest compiler (compile_to_quest, surface: immersive_mr).
 * DO NOT EDIT — change the app by editing scanner.holo's onboarding / tutorial / spatial_panel
 * traits and recompiling. The Compose UI in ScannerPanel.kt renders THIS data.
 */
object ScannerContent {
  const val appName = ${kstr(f.appName)}
  const val title = ${kstr(f.title)}
  const val tagline = ${kstr(f.tagline)}
  const val aimTip = ${kstr(f.aimTip)}
  const val startAction = ${kstr(f.startAction)}
  const val tutorialAction = ${kstr(f.tutorialAction)}
  const val tutorialHeading = ${kstr(f.tutorialHeading)}
  const val demoUrl = ${kstr(f.demoUrl)}

  // world_portal copy (scan a QR → enter a HoloScript world).
  const val leaveAction = ${kstr(f.leaveAction)}
  const val enteringLabel = ${kstr(f.enteringLabel)}
  const val demoWorldUrl = ${kstr(f.demoWorldUrl)}

  val howTo: List<HowTo> =
      listOf(
${howToLines}
      )

  val tutorialSteps: List<String> =
      listOf(
${stepLines}
      )

  // Spatial-panel placement (meters; Spatial SDK is left-handed, +Z = forward).
  const val panelX = ${fnum(f.panelX)}
  const val panelY = ${fnum(f.panelY)}
  const val panelZ = ${fnum(f.panelZ)}
}
`;
}

/** @generated strings.xml — launcher label from the spec (spatial_panel.title / onboarding.title). */
export function emitStringsXml(f: QuestMrFeatures): string {
  return `<?xml version="1.0" encoding="utf-8" ?>
<!-- @generated from scanner.holo by the quest compiler — edit the spec, not here. -->
<resources xmlns:xliff="urn:oasis:names:tc:xliff:document:1.2">
  <string name="app_name">${xesc(f.appName)}</string>
</resources>
`;
}

export const emitQrDecoderKt = (f: QuestMrFeatures): string => applyTokens('QrDecoder.kt.tmpl', f);
export const emitPassthroughControllerKt = (f: QuestMrFeatures): string =>
  applyTokens('PassthroughCameraController.kt.tmpl', f);
export const emitScannerPanelKt = (f: QuestMrFeatures): string =>
  applyTokens('ScannerPanel.kt.tmpl', f);
export const emitStarterSampleActivityKt = (f: QuestMrFeatures): string =>
  applyTokens('StarterSampleActivity.kt.tmpl', f);
export const emitWorldPortalKt = (f: QuestMrFeatures): string =>
  applyTokens('WorldPortal.kt.tmpl', f);
export const emitWorldRendererKt = (f: QuestMrFeatures): string =>
  applyTokens('WorldRenderer.kt.tmpl', f);

/** All emitted MR files, keyed by android-mr-relative path. */
export function emitQuestMrFiles(composition?: HoloComposition): Record<string, string> {
  const f = collectQuestMrFeatures(composition);
  // scanner.holo's `environment.package` is authoritative: the emit refuses to drift from the
  // declaration. (PKG is the shared source for the scanner + world file paths/packages.)
  if (f.packageName !== PKG) {
    throw new Error(
      `quest-mr-emit: scanner.holo declares package "${f.packageName}" but the emitter PKG is "${PKG}". ` +
        `Update PKG (compiler) to match the .holo declaration — the declaration drives the Meta app id.`
    );
  }
  return {
    [GEN_REL]: emitScannerContentKt(f),
    [STRINGS_REL]: emitStringsXml(f),
    [DECODER_REL]: emitQrDecoderKt(f),
    [CONTROLLER_REL]: emitPassthroughControllerKt(f),
    [PANEL_REL]: emitScannerPanelKt(f),
    [ACTIVITY_REL]: emitStarterSampleActivityKt(f),
    [WORLDPORTAL_REL]: emitWorldPortalKt(f),
    [WORLDRENDERER_REL]: emitWorldRendererKt(f),
  };
}
