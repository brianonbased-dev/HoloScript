#!/usr/bin/env tsx
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HoloCompositionParser } from '../packages/core/src/parser/HoloCompositionParser';
import type { HoloComposition, HoloObjectDecl, HoloValue } from '../packages/core/src/parser/HoloCompositionTypes';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

export const APARTMENT_TWIN_SOURCE_RECEIPT_SCHEMA = 'holoscript.apartment-twin-source-receipt.v0.1.0';
export const DEFAULT_APARTMENT_TWIN_SOURCE = 'apps/quest-universal-qr-scanner/worlds/apartment-twin.holo';

type ObjectRecord = {
  name: string;
  properties: Record<string, HoloValue>;
};

type ReceiptFailure = {
  rule: string;
  message: string;
};

type ReceiptOptions = {
  root?: string;
  sourcePath?: string;
  sourceText?: string;
  generatedAt?: string;
};

function normalizeRel(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//u, '');
}

function sha256(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function objectProperties(object: HoloObjectDecl): Record<string, HoloValue> {
  const out: Record<string, HoloValue> = {};
  for (const prop of object.properties ?? []) out[prop.key] = prop.value;
  return out;
}

function envProperties(composition: HoloComposition | null): Record<string, HoloValue> {
  const out: Record<string, HoloValue> = {};
  for (const prop of composition?.environment?.properties ?? []) out[prop.key] = prop.value;
  return out;
}

function recordsWithProperty(objects: HoloObjectDecl[], property: string): ObjectRecord[] {
  return objects
    .map((object) => ({ name: object.name, properties: objectProperties(object) }))
    .filter((object) => object.properties[property] != null);
}

function stringValue(value: HoloValue | undefined): string {
  return typeof value === 'string' ? value : '';
}

function hasCoordinateFrameReference(record: ObjectRecord): boolean {
  return stringValue(record.properties.coordinate_frame_id).length > 0;
}

function pushIf(condition: boolean, failures: ReceiptFailure[], rule: string, message: string): void {
  if (!condition) failures.push({ rule, message });
}

export function buildApartmentTwinSourceReceipt(options: ReceiptOptions = {}) {
  const root = resolve(options.root ?? REPO_ROOT);
  const sourcePath = normalizeRel(options.sourcePath ?? DEFAULT_APARTMENT_TWIN_SOURCE);
  const absoluteSourcePath = resolve(root, sourcePath);
  const sourceText = options.sourceText ?? readFileSync(absoluteSourcePath, 'utf8');
  const sourceHash = sha256(sourceText);
  const parser = new HoloCompositionParser();
  const parsed = parser.parse(sourceText);
  const failures: ReceiptFailure[] = [];
  const composition = parsed.success && parsed.ast ? parsed.ast : null;
  const objects = composition?.objects ?? [];
  const env = envProperties(composition);

  if (!parsed.success || !composition) {
    failures.push({
      rule: 'holo_parse_failed',
      message: `HoloCompositionParser rejected ${sourcePath}`,
    });
  }

  const coordinateFrames = recordsWithProperty(objects, 'coordinate_frame_id')
    .filter((record) => record.name.toLowerCase().includes('coordinateframe'));
  const zones = recordsWithProperty(objects, 'zone_id');
  const anchors = recordsWithProperty(objects, 'anchor_id');
  const surfaces = recordsWithProperty(objects, 'surface_id');
  const reconstructionRefs = recordsWithProperty(objects, 'reconstruction_asset');
  const fallbacks = recordsWithProperty(objects, 'fallback_mode');

  pushIf(composition?.name === 'ApartmentTwin', failures, 'composition_name', 'composition name must be ApartmentTwin');
  pushIf(
    stringValue(env.coordinate_frame) === 'apartment-local-floor-v0',
    failures,
    'environment_coordinate_frame',
    'environment must declare coordinate_frame apartment-local-floor-v0',
  );
  pushIf(coordinateFrames.length >= 1, failures, 'coordinate_frame_missing', 'at least one coordinate frame object is required');
  pushIf(zones.length >= 3, failures, 'zones_missing', 'at least three room zones are required');
  pushIf(anchors.length >= 3, failures, 'anchors_missing', 'at least three anchors are required');
  pushIf(surfaces.length >= 4, failures, 'surfaces_missing', 'at least four surface proxies are required');
  pushIf(reconstructionRefs.length >= 1, failures, 'reconstruction_asset_missing', 'at least one reconstruction asset ref is required');
  pushIf(fallbacks.length >= 1, failures, 'fallback_missing', 'at least one graceful fallback declaration is required');

  for (const collection of [zones, anchors, surfaces, reconstructionRefs, fallbacks]) {
    for (const record of collection) {
      pushIf(
        hasCoordinateFrameReference(record),
        failures,
        'object_coordinate_frame_missing',
        `${record.name} must reference coordinate_frame_id`,
      );
    }
  }

  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const validation = {
    ok: failures.length === 0,
    parser: {
      tool: 'HoloCompositionParser',
      success: Boolean(parsed.success),
      errors: parsed.errors ?? [],
    },
    failures,
  };

  return {
    schemaVersion: APARTMENT_TWIN_SOURCE_RECEIPT_SCHEMA,
    generatedAt,
    source: {
      path: sourcePath,
      sha256: sourceHash,
      bytes: Buffer.byteLength(sourceText, 'utf8'),
      lines: sourceText.split(/\r?\n/u).length,
    },
    questWorld: {
      worldId: 'apartment-twin',
      uri: 'holoscript://world/apartment-twin',
      generatedKotlin: 'apps/quest-universal-qr-scanner/android-mr/app/src/main/java/net/holoscript/qrscanner/World_apartment_twin.kt',
    },
    contract: {
      coordinateFrame: stringValue(env.coordinate_frame),
      units: stringValue(env.unit),
      privacyMode: stringValue(env.privacy_mode),
      fallbackMode: stringValue(env.fallback_mode),
    },
    counts: {
      objects: objects.length,
      coordinateFrames: coordinateFrames.length,
      zones: zones.length,
      anchors: anchors.length,
      surfaces: surfaces.length,
      reconstructionRefs: reconstructionRefs.length,
      fallbacks: fallbacks.length,
    },
    evidence: {
      coordinateFrames: coordinateFrames.map((record) => record.name),
      zones: zones.map((record) => ({
        name: record.name,
        zoneId: record.properties.zone_id,
        kind: record.properties.zone_kind,
      })),
      anchors: anchors.map((record) => ({
        name: record.name,
        anchorId: record.properties.anchor_id,
        kind: record.properties.anchor_kind,
      })),
      surfaces: surfaces.map((record) => ({
        name: record.name,
        surfaceId: record.properties.surface_id,
        kind: record.properties.surface_kind,
      })),
      reconstructionRefs: reconstructionRefs.map((record) => ({
        name: record.name,
        asset: record.properties.reconstruction_asset,
        redactionPolicy: record.properties.redaction_policy,
      })),
      fallbacks: fallbacks.map((record) => ({
        name: record.name,
        mode: record.properties.fallback_mode,
        source: record.properties.fallback_source,
      })),
    },
    validation,
    status: validation.ok ? 'pass' : 'fail',
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    root: REPO_ROOT,
    sourcePath: DEFAULT_APARTMENT_TWIN_SOURCE,
    out: '',
    json: false,
    check: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') args.root = resolve(argv[++index]);
    else if (arg === '--source') args.sourcePath = argv[++index];
    else if (arg === '--out') args.out = argv[++index];
    else if (arg === '--json') args.json = true;
    else if (arg === '--check') args.check = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: tsx scripts/apartment-twin-source-receipt.mts [--check] [--json] [--out <receipt>] [--source <path>]');
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return args;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function main(): void {
  const args = parseArgs();
  const receipt = buildApartmentTwinSourceReceipt(args);
  if (args.out) writeJson(resolve(args.out), receipt);
  if (args.json || receipt.status !== 'pass') console.log(JSON.stringify(receipt, null, 2));
  else {
    console.log(
      `PASS apartment-twin-source: zones=${receipt.counts.zones} anchors=${receipt.counts.anchors} surfaces=${receipt.counts.surfaces} reconstructionRefs=${receipt.counts.reconstructionRefs}`,
    );
  }
  if (args.check && receipt.status !== 'pass') process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!existsSync(resolve(REPO_ROOT, DEFAULT_APARTMENT_TWIN_SOURCE))) {
    console.error(`[apartment-twin-source-receipt] missing ${DEFAULT_APARTMENT_TWIN_SOURCE}`);
    process.exit(1);
  }
  main();
}
