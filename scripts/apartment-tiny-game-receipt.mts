#!/usr/bin/env tsx
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HoloCompositionParser } from '../packages/core/src/parser/HoloCompositionParser';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloValue,
} from '../packages/core/src/parser/HoloCompositionTypes';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

export const TINY_GAME_RECEIPT_SCHEMA = 'holoscript.tiny-game-receipt.v0.1.0';
export const DEFAULT_GAME_SOURCE =
  'apps/quest-universal-qr-scanner/worlds/apartment-signal-hunt.holo';
export const DEFAULT_TWIN_SOURCE = 'apps/quest-universal-qr-scanner/worlds/apartment-twin.holo';

type Failure = { rule: string; message: string };
type SourceInput = { path: string; text: string; sha256: string; bytes: number; lines: number };
type ParsedSource = {
  input: SourceInput;
  success: boolean;
  errors: unknown[];
  ast: HoloComposition | null;
};

type Options = {
  root?: string;
  gamePath?: string;
  twinPath?: string;
  gameText?: string;
  twinText?: string;
  generatedAt?: string;
};

function normalizeRel(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//u, '');
}

function sha256(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readSource(root: string, relPath: string, override?: string): SourceInput {
  const text = override ?? readFileSync(resolve(root, relPath), 'utf8');
  return {
    path: normalizeRel(relPath),
    text,
    sha256: sha256(text),
    bytes: Buffer.byteLength(text, 'utf8'),
    lines: text.split(/\r?\n/u).length,
  };
}

function parseSource(input: SourceInput): ParsedSource {
  const parsed = new HoloCompositionParser().parse(input.text);
  return {
    input,
    success: Boolean(parsed.success && parsed.ast),
    errors: parsed.errors ?? [],
    ast: parsed.success && parsed.ast ? parsed.ast : null,
  };
}

function props(object: HoloObjectDecl): Record<string, HoloValue> {
  const out: Record<string, HoloValue> = {};
  for (const prop of object.properties ?? []) out[prop.key] = prop.value;
  return out;
}

function env(composition: HoloComposition | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const prop of composition?.environment?.properties ?? []) out[prop.key] = prop.value;
  return out;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback;
}

function arrayValue(value: HoloValue | undefined): HoloValue[] {
  return Array.isArray(value) ? value : [];
}

function recordsWith(ast: HoloComposition | null, key: string) {
  return (ast?.objects ?? [])
    .map((object) => ({ name: object.name, properties: props(object) }))
    .filter((object) => object.properties[key] != null);
}

function pushIf(condition: boolean, failures: Failure[], rule: string, message: string): void {
  if (!condition) failures.push({ rule, message });
}

export function buildTinyGameReceipt(options: Options = {}) {
  const root = resolve(options.root ?? REPO_ROOT);
  const gamePath = normalizeRel(options.gamePath ?? DEFAULT_GAME_SOURCE);
  const twinPath = normalizeRel(options.twinPath ?? DEFAULT_TWIN_SOURCE);
  const game = parseSource(readSource(root, gamePath, options.gameText));
  const twin = parseSource(readSource(root, twinPath, options.twinText));
  const failures: Failure[] = [];

  if (!game.success)
    failures.push({ rule: 'game_parse_failed', message: `${gamePath} did not parse` });
  if (!twin.success)
    failures.push({ rule: 'twin_parse_failed', message: `${twinPath} did not parse` });

  const gameEnv = env(game.ast);
  const twinEnv = env(twin.ast);
  const beacons = recordsWith(game.ast, 'beacon_id').sort(
    (a, b) => numberValue(a.properties.sequence_index) - numberValue(b.properties.sequence_index)
  );
  const sequenceRules = recordsWith(game.ast, 'ordered_beacons');
  const timers = recordsWith(game.ast, 'time_limit_seconds');
  const receiptRules = recordsWith(game.ast, 'receipt_schema');
  const twinAnchors = new Map(
    recordsWith(twin.ast, 'anchor_id').map((record) => [
      stringValue(record.properties.anchor_id),
      record,
    ])
  );
  const twinZones = new Map(
    recordsWith(twin.ast, 'zone_id').map((record) => [
      stringValue(record.properties.zone_id),
      record,
    ])
  );

  pushIf(
    game.ast?.name === 'ApartmentSignalHunt',
    failures,
    'game_name',
    'game composition must be ApartmentSignalHunt'
  );
  pushIf(
    twin.ast?.name === 'ApartmentTwin',
    failures,
    'twin_name',
    'twin composition must be ApartmentTwin'
  );
  pushIf(
    stringValue(gameEnv.parent_twin) === 'apartment-twin',
    failures,
    'parent_twin_missing',
    'game must target apartment-twin'
  );
  pushIf(
    stringValue(twinEnv.coordinate_frame) === 'apartment-local-floor-v0',
    failures,
    'twin_coordinate_frame_missing',
    'twin coordinate frame missing'
  );
  pushIf(
    stringValue(gameEnv.objective).length >= 20,
    failures,
    'objective_missing',
    'readable objective required'
  );
  pushIf(
    beacons.length >= 3,
    failures,
    'beacons_missing',
    'at least three ordered beacons required'
  );
  pushIf(
    sequenceRules.length >= 1,
    failures,
    'sequence_rule_missing',
    'ordered sequence rule required'
  );
  pushIf(timers.length >= 1, failures, 'timer_rule_missing', 'timer rule required');
  pushIf(
    receiptRules.some((rule) => rule.properties.receipt_schema === 'TinyGameReceipt/v0.1.0'),
    failures,
    'completion_receipt_missing',
    'TinyGameReceipt rule required'
  );

  const beaconIds = new Set(beacons.map((beacon) => stringValue(beacon.properties.beacon_id)));
  const orderedBeaconIds = sequenceRules.flatMap((rule) =>
    arrayValue(rule.properties.ordered_beacons).map(String)
  );
  for (const expected of orderedBeaconIds) {
    pushIf(
      beaconIds.has(expected),
      failures,
      'sequence_beacon_missing',
      `ordered beacon ${expected} has no beacon object`
    );
  }
  for (const beacon of beacons) {
    const anchorId = stringValue(beacon.properties.target_anchor_id);
    const zoneId = stringValue(beacon.properties.target_zone_id);
    pushIf(
      twinAnchors.has(anchorId),
      failures,
      'beacon_anchor_missing',
      `${beacon.name} target anchor ${anchorId} missing from twin`
    );
    pushIf(
      twinZones.has(zoneId),
      failures,
      'beacon_zone_missing',
      `${beacon.name} target zone ${zoneId} missing from twin`
    );
    pushIf(
      stringValue(beacon.properties.feedback).length > 0,
      failures,
      'beacon_feedback_missing',
      `${beacon.name} needs feedback`
    );
  }

  const score = beacons.reduce((sum, beacon) => sum + numberValue(beacon.properties.points), 0);
  const durationSeconds = Math.min(numberValue(timers[0]?.properties.time_limit_seconds, 180), 180);
  const simulatedActions = beacons.map((beacon) => ({
    beaconId: beacon.properties.beacon_id,
    targetAnchorId: beacon.properties.target_anchor_id,
    targetZoneId: beacon.properties.target_zone_id,
    feedback: beacon.properties.feedback,
    accepted: true,
  }));

  const validationOk = failures.length === 0;
  return {
    schemaVersion: TINY_GAME_RECEIPT_SCHEMA,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    gameSource: {
      path: game.input.path,
      sha256: game.input.sha256,
      bytes: game.input.bytes,
      lines: game.input.lines,
    },
    twinSource: {
      path: twin.input.path,
      sha256: twin.input.sha256,
      bytes: twin.input.bytes,
      lines: twin.input.lines,
    },
    questWorld: {
      worldId: 'apartment-signal-hunt',
      uri: 'holoscript://world/apartment-signal-hunt',
      generatedKotlin:
        'apps/quest-universal-qr-scanner/android-mr/app/src/main/java/net/holoscript/qrscanner/World_apartment_signal_hunt.kt',
    },
    game: {
      id: stringValue(gameEnv.game_id),
      parentTwin: stringValue(gameEnv.parent_twin),
      objective: stringValue(gameEnv.objective),
      expectedDurationSeconds: numberValue(gameEnv.expected_duration_seconds),
    },
    counts: {
      beacons: beacons.length,
      sequenceRules: sequenceRules.length,
      timerRules: timers.length,
      receiptRules: receiptRules.length,
      twinAnchors: twinAnchors.size,
      twinZones: twinZones.size,
      failures: failures.length,
    },
    simulatedRun: {
      completed: validationOk,
      playerAction: stringValue(sequenceRules[0]?.properties.player_action),
      durationSeconds,
      score,
      actions: simulatedActions,
    },
    completionReceipt: validationOk
      ? {
          schema: 'TinyGameReceipt/v0.1.0',
          game_id: stringValue(gameEnv.game_id),
          parent_twin: stringValue(gameEnv.parent_twin),
          ordered_beacons: simulatedActions.map((action) => action.beaconId),
          score,
          duration_seconds: durationSeconds,
          source_hash: game.input.sha256,
        }
      : null,
    validation: {
      ok: validationOk,
      parser: {
        game: { success: game.success, errors: game.errors },
        twin: { success: twin.success, errors: twin.errors },
      },
      failures,
    },
    status: validationOk ? 'pass' : 'fail',
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    root: REPO_ROOT,
    gamePath: DEFAULT_GAME_SOURCE,
    twinPath: DEFAULT_TWIN_SOURCE,
    out: '',
    json: false,
    check: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') args.root = resolve(argv[++index]);
    else if (arg === '--game') args.gamePath = argv[++index];
    else if (arg === '--twin') args.twinPath = argv[++index];
    else if (arg === '--out') args.out = argv[++index];
    else if (arg === '--json') args.json = true;
    else if (arg === '--check') args.check = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: tsx scripts/apartment-tiny-game-receipt.mts [--check] [--json] [--out <receipt>] [--game <path>] [--twin <path>]'
      );
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
  const receipt = buildTinyGameReceipt(args);
  if (args.out) writeJson(resolve(args.out), receipt);
  if (args.json || receipt.status !== 'pass') console.log(JSON.stringify(receipt, null, 2));
  else {
    console.log(
      `PASS apartment-tiny-game: beacons=${receipt.counts.beacons} score=${receipt.simulatedRun.score}`
    );
  }
  if (args.check && receipt.status !== 'pass') process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!existsSync(resolve(REPO_ROOT, DEFAULT_GAME_SOURCE))) {
    console.error(`[apartment-tiny-game-receipt] missing ${DEFAULT_GAME_SOURCE}`);
    process.exit(1);
  }
  main();
}
