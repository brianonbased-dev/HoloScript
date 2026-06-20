// quest-emit-mr.mjs — HoloScript → Meta Quest immersive-MR (Meta Spatial SDK) emitter.
//
// This is the `surface: immersive_mr` codegen for compile_to_quest. It reads scanner.holo and emits
// the SPEC-DRIVEN content of the Spatial SDK app — the onboarding copy, the how-to-use contexts, the
// tutorial, the demo URL, the spatial-panel placement — into a single @generated Kotlin file
// (ScannerContent.kt). The Compose UI structure (welcome/tutorial/ambient screens + animation) is
// the compiler backend (the template), authored once; the CONTENT comes from the spec. So changing
// the app's copy/contexts/placement is a scanner.holo edit, never a hand-edit of Kotlin (F.126).
//
// Reference-first + golden gate: apps/quest-universal-qr-scanner/android-mr is the on-device-proven
// reference; scripts/holo-ci/check-quest-mr-emit-matches-reference.mjs fails on any drift between
// the emitted ScannerContent.kt and the committed reference.
import { readFileSync } from 'node:fs';

const PKG = 'com.meta.spatial.samples.startersample';
const GENERATED_REL = `app/src/main/java/${PKG.replace(/\./g, '/')}/ScannerContent.kt`;

// path → status. 'emitted' = the emitter produces it and the gate enforces a byte match against the
// reference; everything else in android-mr is the compiler-backend template (proven, not yet emitted).
export const MR_GOLDEN_MANIFEST = [{ path: GENERATED_REL, status: 'emitted' }];

/** Parse the immersive_mr scanner.holo into the structured content the emitter injects. */
export function parseMrSpec(specText) {
  const str = (k, d) => (specText.match(new RegExp(`${k}\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`)) || [, d])[1];
  const num = (k, d) => {
    const m = specText.match(new RegExp(`${k}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`));
    return m ? m[1] : d;
  };
  const block = (name) => {
    // capture a `name <id> { ... }` body (balanced to the matching close brace)
    const start = specText.search(new RegExp(`${name}\\s+\\w+\\s*\\{`));
    if (start < 0) return '';
    let i = specText.indexOf('{', start);
    let depth = 0;
    for (let j = i; j < specText.length; j++) {
      if (specText[j] === '{') depth++;
      else if (specText[j] === '}') {
        depth--;
        if (depth === 0) return specText.slice(i + 1, j);
      }
    }
    return '';
  };

  const onboarding = block('onboarding');
  const tutorial = block('tutorial');
  const panel = block('spatial_panel');

  // how_to_use [ { context: "..", icon: "..", text: ".." } ... ]
  const howTo = [];
  const htBlock = (onboarding.match(/how_to_use\s*\[([\s\S]*?)\]/) || [, ''])[1];
  const htRe = /context:\s*"((?:[^"\\]|\\.)*)"[\s\S]*?text:\s*"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = htRe.exec(htBlock)) !== null) howTo.push({ context: m[1], text: m[2] });

  // tutorial steps [ "..", "..", ".." ]
  const steps = [];
  const stepsBlock = (tutorial.match(/steps\s*\[([\s\S]*?)\]/) || [, ''])[1];
  const stepRe = /"((?:[^"\\]|\\.)*)"/g;
  while ((m = stepRe.exec(stepsBlock)) !== null) steps.push(m[1]);

  const onb = (k, d) => (onboarding.match(new RegExp(`${k}\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`)) || [, d])[1];
  const tut = (k, d) => (tutorial.match(new RegExp(`${k}\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`)) || [, d])[1];

  return {
    appName: str('display_name', 'Universal QR Scanner'),
    title: onb('title', 'Universal QR Scanner'),
    tagline: onb('tagline', 'Read any QR code'),
    aimTip: onb('aim_tip', ''),
    startAction: onb('start_action', 'Start scanning'),
    tutorialAction: onb('tutorial_action', 'See how it works'),
    howTo,
    tutHeading: tut('heading', 'How it works'),
    demoUrl: (tutorial.match(/demo_url:\s*"((?:[^"\\]|\\.)*)"/) || [, 'https://holoscript.studio'])[1],
    steps,
    panelX: (panel.match(/place:\s*\{[^}]*x:\s*(-?\d+(?:\.\d+)?)/) || [, '0.0'])[1],
    panelY: (panel.match(/place:\s*\{[^}]*y:\s*(-?\d+(?:\.\d+)?)/) || [, '1.3'])[1],
    panelZ: (panel.match(/place:\s*\{[^}]*z:\s*(-?\d+(?:\.\d+)?)/) || [, '1.5'])[1],
  };
}

const kstr = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$') + '"';
const fnum = (s) => (String(s).includes('.') ? `${s}f` : `${s}.0f`);

/** Emit ScannerContent.kt — the @generated, spec-driven content the Compose panel renders. */
export function emitScannerContentKt(cfg) {
  const howToLines = cfg.howTo
    .map((h) => `          HowTo(${kstr(h.context)}, ${kstr(h.text)}),`)
    .join('\n');
  const stepLines = cfg.steps.map((s) => `          ${kstr(s)},`).join('\n');
  return `package ${PKG}

/*
 * @generated from scanner.holo by quest-emit-mr.mjs (compile_to_quest, surface: immersive_mr).
 * DO NOT EDIT — change the app by editing scanner.holo's meta / onboarding / tutorial / spatial_panel
 * blocks and recompiling. The Compose UI in ScannerPanel.kt renders THIS data.
 */
object ScannerContent {
  const val appName = ${kstr(cfg.appName)}
  const val title = ${kstr(cfg.title)}
  const val tagline = ${kstr(cfg.tagline)}
  const val aimTip = ${kstr(cfg.aimTip)}
  const val startAction = ${kstr(cfg.startAction)}
  const val tutorialAction = ${kstr(cfg.tutorialAction)}
  const val tutorialHeading = ${kstr(cfg.tutHeading)}
  const val demoUrl = ${kstr(cfg.demoUrl)}

  val howTo: List<HowTo> =
      listOf(
${howToLines}
      )

  val tutorialSteps: List<String> =
      listOf(
${stepLines}
      )

  // Spatial-panel placement (meters; Spatial SDK is left-handed, +Z = forward).
  const val panelX = ${fnum(cfg.panelX)}
  const val panelY = ${fnum(cfg.panelY)}
  const val panelZ = ${fnum(cfg.panelZ)}
}
`;
}

/** Returns { relpath: content } for every currently-EMITTED MR file. */
export function emitMrFiles(specPath) {
  const cfg = parseMrSpec(readFileSync(specPath, 'utf8'));
  return { [GENERATED_REL]: emitScannerContentKt(cfg) };
}
