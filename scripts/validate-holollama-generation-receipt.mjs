#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseHolo } from '@holoscript/core/parser';
import {
  WebGPUCompiler,
  createTestCompilerToken,
  generateHoloScriptGbnf,
} from '@holoscript/core/compiler';

const receiptPath = process.argv[2];
if (!receiptPath) {
  console.error('usage: node scripts/validate-holollama-generation-receipt.mjs <receipt.json>');
  process.exit(2);
}

const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
const failures = [];

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

function attemptById(id) {
  return (receipt.attempts || []).find((attempt) => attempt.id === id);
}

check(receipt.schema === 'holollama.constrained-native-generation.receipt.v1', 'schema mismatch');

const grammar = generateHoloScriptGbnf();
check(receipt.constraint?.sha256 === sha256(grammar), 'constraint grammar sha256 mismatch');

const rejected = (receipt.attempts || []).find(
  (attempt) => attempt.finalDisposition === 'rejected_invalid_syntax'
);
check(Boolean(rejected), 'missing rejected invalid-syntax attempt');
if (rejected) {
  const parse = parseHolo(rejected.generatedSource);
  check(!parse.success, 'invalid-syntax attempt parsed successfully');
  check(rejected.compile?.attempted === false, 'invalid-syntax attempt should not compile');
}

const promoted = attemptById(receipt.finalDisposition?.promotedAttemptId);
check(Boolean(promoted), 'missing promoted attempt');
if (promoted) {
  const parse = parseHolo(promoted.generatedSource);
  check(parse.success === true && Boolean(parse.ast), 'promoted source did not parse');
  if (parse.success && parse.ast) {
    const compiled = new WebGPUCompiler().compile(parse.ast, createTestCompilerToken());
    check(
      sha256(compiled) === promoted.compile?.outputSha256,
      'promoted compile output sha256 mismatch'
    );
    check(
      String(compiled).includes('navigator.gpu'),
      'promoted compile output missing WebGPU marker'
    );
  }
  check(
    promoted.semantic?.status === 'not_proven',
    'receipt must not claim semantic/render success from parse+compile only'
  );
}

let holollama;
try {
  holollama = await import('@holoscript/holollama');
} catch (error) {
  failures.push(
    `failed to import @holoscript/holollama; run pnpm --filter @holoscript/holollama build first (${error.message})`
  );
}

if (holollama && receipt.holollamaPath) {
  const profile = receipt.holollamaPath.profile;
  const profileSource = holollama.readHoloLlamaProfileSource(profile);
  check(
    receipt.holollamaPath.profileSourceSha256 === sha256(profileSource),
    'HoloLlama profile source sha256 mismatch'
  );
  const bundle = holollama.compileHoloLlamaBundle({ profile });
  check(
    bundle.launch.executable === receipt.holollamaPath.selectedExecutable,
    'HoloLlama selected executable mismatch'
  );
  check(
    /build-holo[\\/]+bin/i.test(bundle.launch.executable),
    'HoloLlama selected executable is not a build-holo binary'
  );
}

if (failures.length) {
  console.error(`[holollama-generation-receipt] FAIL ${receiptPath}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `[holollama-generation-receipt] PASS ${receiptPath}: ${receipt.attempts.length} attempt(s), promoted=${receipt.finalDisposition.promotedAttemptId}`
);
