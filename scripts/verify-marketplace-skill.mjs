#!/usr/bin/env node
/**
 * Smoke-check the repo-local marketplace skill against the shipped
 * @holoscript/marketplace-api route surface.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SKILL = path.join(ROOT, '.claude', 'skills', 'marketplace', 'SKILL.md');
const PLUGIN = path.join(ROOT, '.claude-plugin', 'plugin.json');
const MARKETPLACE_SRC = path.join(ROOT, 'packages', 'marketplace-api', 'src');

const checks = [];

function fail(message) {
  checks.push({ ok: false, message });
}

function pass(message) {
  checks.push({ ok: true, message });
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function expectFile(file, label) {
  if (!fs.existsSync(file)) {
    fail(`${label} missing: ${path.relative(ROOT, file)}`);
    return false;
  }
  pass(`${label} exists`);
  return true;
}

function expectIncludes(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    fail(`${label}: missing ${needle}`);
    return;
  }
  pass(`${label}: ${needle}`);
}

function routeFile(name) {
  return path.join(MARKETPLACE_SRC, name);
}

if (!expectFile(SKILL, 'marketplace skill')) process.exit(1);
if (!expectFile(PLUGIN, 'plugin manifest')) process.exit(1);

const skill = read(SKILL);
const plugin = JSON.parse(read(PLUGIN));

expectIncludes(skill, 'name: marketplace', 'frontmatter');
expectIncludes(skill, 'pnpm verify:marketplace-skill', 'self-verification command');

if (Array.isArray(plugin.skills) && plugin.skills.includes('marketplace')) {
  pass('plugin manifest lists marketplace skill');
} else {
  fail('plugin manifest does not list marketplace skill');
}

const routeExpectations = [
  {
    file: 'routes.ts',
    routeLiterals: [
      "'/traits'",
      "'/traits/:id/download'",
      "'/verification'",
      "'/users/:id/verification'",
    ],
    skillLiterals: [
      '/api/v1/traits',
      '/api/v1/traits/<trait-id>/download',
      '/api/v1/verification',
      '/api/v1/users/<user-id>/verification',
    ],
  },
  {
    file: 'skillRoutes.ts',
    routeLiterals: ["'/publish'", "'/search'", "'/:id/purchase'", "'/:id/download'", "'/:id/install'"],
    skillLiterals: [
      '/api/v1/skills/publish',
      '/api/v1/skills/search',
      '/api/v1/skills/<skill-id>/purchase',
      '/api/v1/skills/<skill-id>/download',
      '/api/v1/skills/<skill-id>/install',
    ],
  },
  {
    file: 'pluginRoutes.ts',
    routeLiterals: [
      "'/plugins'",
      "'/plugins/:id/purchase'",
      "'/plugins/:id/download'",
      "'/plugins/:id/install-plan'",
      "'/plugins/:id/provenance'",
      "'/keys'",
    ],
    skillLiterals: [
      '/api/v1/plugins',
      '/api/v1/plugins/<plugin-id>/purchase',
      '/api/v1/plugins/<plugin-id>/download',
      '/api/v1/plugins/<plugin-id>/install-plan',
      '/api/v1/plugins/<plugin-id>/provenance',
      '/api/v1/keys',
    ],
  },
  {
    file: 'hololandRoutes.ts',
    routeLiterals: [
      "'/payments/x402/callback'",
      "'/create-vrr-twin'",
      "'/create-quest'",
      "'/mint-story_weaver-book'",
      "'/business/:id/vrr-twin'",
      "'/agent/:id/quests'",
    ],
    skillLiterals: [
      '/api/v1/payments/x402/callback',
      '/api/v1/create-vrr-twin',
      '/api/v1/create-quest',
      '/api/v1/mint-story_weaver-book',
      '/api/v1/business/<business-id>/vrr-twin',
      '/api/v1/agent/<agent-id>/quests',
    ],
  },
  {
    file: path.join('economy', 'ast-licensing-middleware.ts'),
    routeLiterals: [
      "'/ast-assets'",
      "'/ast-assets/:assetId/manifest'",
      "'/ast-assets/:assetId'",
    ],
    skillLiterals: [
      '/api/v1/ast-assets',
      '/api/v1/ast-assets/<asset-id>/manifest',
      '/api/v1/ast-assets/<asset-id>',
    ],
  },
];

for (const expectation of routeExpectations) {
  const filePath = routeFile(expectation.file);
  if (!expectFile(filePath, `route file ${expectation.file}`)) continue;
  const source = read(filePath);
  for (const literal of expectation.routeLiterals) {
    expectIncludes(source, literal, `route literal ${expectation.file}`);
  }
  for (const literal of expectation.skillLiterals) {
    expectIncludes(skill, literal, `skill route ${expectation.file}`);
  }
}

const requiredConcepts = [
  'MARKETPLACE_API_URL',
  'MARKETPLACE_AUTH_TOKEN',
  'Authorization: Bearer',
  'X-Payment-ID',
  'X-PAYMENT',
  'WWW-Authenticate',
  '402',
  'publish',
  'search',
  'purchase',
  'download',
  'verify',
];

for (const concept of requiredConcepts) {
  expectIncludes(skill, concept, 'agent concept');
}

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  const prefix = check.ok ? '[ok]' : '[fail]';
  console.log(`${prefix} ${check.message}`);
}

if (failed.length > 0) {
  console.error(`[verify-marketplace-skill] FAIL - ${failed.length} check(s) failed`);
  process.exit(1);
}

console.log(`[verify-marketplace-skill] OK - ${checks.length} checks passed`);
