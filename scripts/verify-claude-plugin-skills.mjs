#!/usr/bin/env node
/**
 * Ensure .claude-plugin/plugin.json "skills" matches each .claude/skills/<name>/SKILL.md
 *
 * Usage: node scripts/verify-claude-plugin-skills.mjs [repoRoot]
 * Default repoRoot: cwd
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.argv[2] || process.cwd());
const PLUGIN = path.join(ROOT, '.claude-plugin', 'plugin.json');
const SKILLS_DIR = path.join(ROOT, '.claude', 'skills');

function main() {
  if (!fs.existsSync(PLUGIN)) {
    console.error(`[verify-claude-plugin-skills] Missing ${PLUGIN}`);
    process.exit(1);
  }
  if (!fs.existsSync(SKILLS_DIR)) {
    console.error(`[verify-claude-plugin-skills] Missing ${SKILLS_DIR}`);
    process.exit(1);
  }

  const { skills: listed = [] } = JSON.parse(fs.readFileSync(PLUGIN, 'utf8'));
  const listedSet = new Set(listed.map(String));

  const onDisk = [];
  for (const ent of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const skillMd = path.join(SKILLS_DIR, ent.name, 'SKILL.md');
    if (fs.existsSync(skillMd)) onDisk.push(ent.name);
  }
  const diskSet = new Set(onDisk);

  const missingDirs = [...listedSet].filter((s) => !diskSet.has(s));
  const unlisted = [...diskSet].filter((s) => !listedSet.has(s));

  if (missingDirs.length || unlisted.length) {
    console.error('[verify-claude-plugin-skills] plugin.json ↔ .claude/skills mismatch:\n');
    if (missingDirs.length) {
      console.error('  In plugin.json but no .claude/skills/<name>/SKILL.md:');
      missingDirs.forEach((s) => console.error(`    - ${s}`));
    }
    if (unlisted.length) {
      console.error('  On disk but not in plugin.json skills[]:');
      unlisted.forEach((s) => console.error(`    - ${s}`));
    }
    process.exit(1);
  }

  console.log(
    `[verify-claude-plugin-skills] OK — ${listedSet.size} skill(s) in sync (${ROOT})`
  );
}

main();
