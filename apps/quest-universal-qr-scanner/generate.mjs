#!/usr/bin/env node
// generate.mjs — materialize spec-driven Android resources from scanner.holo (source of truth).
// The hand-written Kotlin reads these values from resources, so changing the .holo spec and
// re-running this is the ONLY supported way to change app config (package/permission are in the
// manifest; runtime config — resolution, camera selection, dedupe, webtask scheme — lives here).
//
// Run:  node generate.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const specPath = join(here, 'scanner.holo');
const outPath = join(here, 'android', 'app', 'src', 'main', 'res', 'values', 'generated.xml');

const spec = readFileSync(specPath, 'utf8');

const str = (key, fallback) => {
  const m = spec.match(new RegExp(`${key}\\s*:\\s*"([^"]*)"`));
  return m ? m[1] : fallback;
};
const int = (key, fallback) => {
  const m = spec.match(new RegExp(`${key}\\s*:\\s*(\\d+)`));
  return m ? parseInt(m[1], 10) : fallback;
};

// The browser-open scheme is derived from the quest_web_task action kind in the spec.
const webtaskScheme = /kind:\s*"quest_web_task"/.test(spec) ? 'ovrweb://webtask?uri=' : '';

const cfg = {
  app_name: str('display_name', 'Universal QR Scanner'),
  privacy_note: str('privacy_note', 'Frames are decoded on-device. Nothing is stored or sent.'),
  webtask_scheme: webtaskScheme,
  dedupe_window_ms: int('dedupe_window_ms', 2500),
  frame_width: int('width', 1280),
  frame_height: int('height', 960),
  camera_source: int('camera_source', 0),
  camera_position: int('position', 0),
};

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const xml = `<?xml version="1.0" encoding="utf-8"?>
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

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, xml);
console.log('Generated', outPath);
console.log(JSON.stringify(cfg, null, 2));
