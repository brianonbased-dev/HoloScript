// quest-emit.mjs — HoloScript → Meta Quest app emitter (incremental codegen backend).
//
// SINGLE SOURCE OF TRUTH for what `compile_to_quest` emits. The golden-diff gate
// (scripts/holo-ci/check-quest-emit-matches-reference.mjs) runs this and FAILS CI on any drift
// between an emitted file and the committed reference app. Files flip 'reference' → 'emitted'
// one at a time, smallest first; each is only 'emitted' once its output byte-matches the
// hand-authored reference. This is the drift guard the pre-mortem mandated before emitting Kotlin.
//
// NOTE: this is the interim Node home for the emitter. It will be ported into the in-core
// QuestCompiler (packages/core) behind the same gate — the gate is emitter-location-agnostic.
import { readFileSync } from 'node:fs';

// The full reference app, with per-file emit status. 'emitted' = the emitter produces it and the
// gate enforces a byte match. 'reference' = still hand-authored (golden), not yet emitted.
export const GOLDEN_MANIFEST = [
  { path: 'android/app/src/main/res/values/generated.xml', status: 'emitted' },
  { path: 'android/app/src/main/java/net/holoscript/qrscanner/QrDecoder.kt', status: 'reference' },
  { path: 'android/app/src/main/AndroidManifest.xml', status: 'reference' },
  { path: 'android/app/build.gradle.kts', status: 'reference' },
  { path: 'android/build.gradle.kts', status: 'reference' },
  { path: 'android/settings.gradle.kts', status: 'reference' },
  { path: 'android/app/src/main/res/values/themes.xml', status: 'reference' },
  { path: 'android/app/src/main/res/layout/activity_main.xml', status: 'reference' },
  { path: 'android/app/src/main/res/drawable/ic_launcher.xml', status: 'reference' },
  { path: 'android/app/src/main/java/net/holoscript/qrscanner/MainActivity.kt', status: 'reference' },
  { path: 'android/app/src/main/java/net/holoscript/qrscanner/PassthroughCameraController.kt', status: 'reference' },
];

function parseSpec(specText) {
  const str = (k, d) => (specText.match(new RegExp(`${k}\\s*:\\s*"([^"]*)"`)) || [, d])[1];
  const int = (k, d) => {
    const m = specText.match(new RegExp(`${k}\\s*:\\s*(\\d+)`));
    return m ? parseInt(m[1], 10) : d;
  };
  return {
    app_name: str('display_name', 'Universal QR Scanner'),
    privacy_note: str('privacy_note', 'Frames are decoded on-device. Nothing is stored or sent.'),
    webtask_scheme: /kind:\s*"quest_web_task"/.test(specText) ? 'ovrweb://webtask?uri=' : '',
    dedupe_window_ms: int('dedupe_window_ms', 2500),
    frame_width: int('width', 1280),
    frame_height: int('height', 960),
    camera_source: int('camera_source', 0),
    camera_position: int('position', 0),
  };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function emitGeneratedXml(cfg) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- @generated from scanner.holo by generate.mjs — DO NOT EDIT. Run: node generate.mjs -->
<resources>
    <string name="app_name">${esc(cfg.app_name)}</string>
    <string name="privacy_note">${esc(cfg.privacy_note)}</string>
    <string name="webtask_scheme">${esc(cfg.webtask_scheme)}</string>
    <integer name="dedupe_window_ms">${cfg.dedupe_window_ms}</integer>
    <integer name="frame_width">${cfg.frame_width}</integer>
    <integer name="frame_height">${cfg.frame_height}</integer>
    <integer name="camera_source">${cfg.camera_source}</integer>
    <integer name="camera_position">${cfg.camera_position}</integer>
</resources>
`;
}

// path → emit function, for every file currently marked 'emitted'.
const EMITTERS = {
  'android/app/src/main/res/values/generated.xml': emitGeneratedXml,
};

/** Returns { relpath: content } for every currently-EMITTED file, derived from the spec. */
export function emitQuestFiles(specPath) {
  const cfg = parseSpec(readFileSync(specPath, 'utf8'));
  const out = {};
  for (const f of GOLDEN_MANIFEST) {
    if (f.status !== 'emitted') continue;
    const fn = EMITTERS[f.path];
    if (!fn) throw new Error(`No emitter registered for 'emitted' file: ${f.path}`);
    out[f.path] = fn(cfg);
  }
  return out;
}
