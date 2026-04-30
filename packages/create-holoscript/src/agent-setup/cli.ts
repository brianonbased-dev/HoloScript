/**
 * @holoscript/agent-setup — CLI entry point
 *
 * Set up multi-agent infrastructure for any existing repo.
 * Works with Claude, Copilot, Cursor, Windsurf, Gemini, Codex, Devin.
 *
 * Usage:
 *   npx @holoscript/agent-setup           # Interactive setup in current directory
 *   npx @holoscript/agent-setup --yes     # Non-interactive, accept all defaults
 *   npx @holoscript/agent-setup --dry-run # Preview files without writing
 *   npx @holoscript/agent-setup ./path    # Target a specific directory
 */

import fs from 'node:fs';
import path from 'node:path';
import prompts from 'prompts';
import pc from 'picocolors';
import { scanProject } from './scanner.js';
import { generateAllFiles } from './generator.js';
import type { GeneratedFile } from './generator.js';

// ─── Args ──────────────────────────────────────────────────────────────────

interface ParsedArgs {
  targetDir: string;
  yes: boolean;
  dryRun: boolean;
  force: boolean;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const flags = args.filter(a => a.startsWith('-'));
  const positional = args.filter(a => !a.startsWith('-'));

  return {
    targetDir: positional[0] || '.',
    yes: flags.includes('--yes') || flags.includes('-y'),
    dryRun: flags.includes('--dry-run') || flags.includes('-n'),
    force: flags.includes('--force') || flags.includes('-f'),
  };
}

// ─── Banner ────────────────────────────────────────────────────────────────

function printBanner(): void {
  console.log();
  console.log(pc.cyan('  ╔═══════════════════════════════════════════════╗'));
  console.log(pc.cyan('  ║') + pc.bold('     @holoscript/agent-setup                  ') + pc.cyan('║'));
  console.log(pc.cyan('  ║') + pc.dim('   Multi-agent infrastructure for any repo    ') + pc.cyan('║'));
  console.log(pc.cyan('  ╚═══════════════════════════════════════════════╝'));
  console.log();
}

// ─── File writing ──────────────────────────────────────────────────────────

function writeFiles(dir: string, files: GeneratedFile[], force: boolean): { written: string[]; skipped: string[] } {
  const written: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const fullPath = path.join(dir, file.path);
    const parentDir = path.dirname(fullPath);

    // Skip if file exists and not forced
    if (fs.existsSync(fullPath) && !force) {
      skipped.push(file.path);
      continue;
    }

    // Create parent directories
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(fullPath, file.content, 'utf-8');
    written.push(file.path);
  }

  return { written, skipped };
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  printBanner();

  const { targetDir, yes, dryRun, force } = parseArgs();
  const absDir = path.resolve(targetDir);

  // Verify directory exists
  if (!fs.existsSync(absDir)) {
    console.log(pc.red(`  Error: Directory "${absDir}" does not exist.`));
    process.exit(1);
  }

  // ─── Scan ──────
  console.log(`  ${pc.blue('Scanning')} ${pc.bold(absDir)}...\n`);
  const dna = scanProject(absDir);

  // Show results
  console.log(`  ${pc.green('Project')}: ${pc.bold(dna.name)}`);
  console.log(`  ${pc.green('Languages')}: ${dna.languages.join(', ') || 'none detected'}`);
  console.log(`  ${pc.green('Frameworks')}: ${dna.frameworks.join(', ') || 'none detected'}`);
  console.log(`  ${pc.green('Stack')}: ${dna.techStack.join(', ') || 'minimal'}`);
  console.log(`  ${pc.green('Packages')}: ${dna.packageCount}`);
  if (dna.repoUrl) {
    console.log(`  ${pc.green('Repository')}: ${dna.repoUrl}`);
  }
  console.log();

  // ─── Generate ──────
  const files = generateAllFiles(dna);

  // Show what will be created
  console.log(`  ${pc.cyan('Files to generate')}:\n`);
  for (const file of files) {
    const exists = fs.existsSync(path.join(absDir, file.path));
    const icon = exists
      ? force ? pc.yellow('↻') : pc.dim('─')
      : pc.green('+');
    const status = exists && !force ? pc.dim('(exists, skip)') : '';
    console.log(`    ${icon} ${pc.bold(file.path)} ${status}`);
    console.log(`      ${pc.dim(file.description)}`);
  }
  console.log();

  // Dry run — show files and exit
  if (dryRun) {
    console.log(pc.yellow('  Dry run — no files written.'));
    console.log(`  Run without --dry-run to write files.`);
    console.log();
    return;
  }

  // Confirm unless --yes
  if (!yes) {
    const existing = files.filter(f => fs.existsSync(path.join(absDir, f.path)));
    if (existing.length > 0 && !force) {
      console.log(pc.yellow(`  ${existing.length} file(s) already exist and will be skipped.`));
      console.log(`  Use ${pc.bold('--force')} to overwrite.\n`);
    }

    const response = await prompts({
      type: 'confirm',
      name: 'proceed',
      message: 'Write agent config files?',
      initial: true,
    });

    if (!response.proceed) {
      console.log(pc.red('\n  Cancelled.\n'));
      process.exit(0);
    }
  }

  // ─── Write ──────
  const { written, skipped } = writeFiles(absDir, files, force);

  console.log();
  for (const f of written) {
    console.log(`  ${pc.green('✓')} ${f}`);
  }
  for (const f of skipped) {
    console.log(`  ${pc.dim('─')} ${f} ${pc.dim('(exists)')}`);
  }

  // ─── Success ──────
  console.log();
  console.log(pc.green(`  ✓ Agent infrastructure ready! ${written.length} files written.`));
  console.log();
  console.log('  What was set up:');
  console.log();
  console.log(`    ${pc.cyan('AGENTS.md')}           — Every AI coding tool reads this`);
  console.log(`    ${pc.cyan('.cursorrules')}         — Cursor IDE`);
  console.log(`    ${pc.cyan('copilot-instructions')} — GitHub Copilot`);
  console.log(`    ${pc.cyan('GEMINI.md')}            — Gemini CLI / Code Assist`);
  console.log(`    ${pc.cyan('.claude/')}             — Claude Code (instructions + oracle + memory)`);
  console.log(`    ${pc.cyan('team-connect.mjs')}     — Multi-IDE agent coordination`);
  console.log();
  console.log('  Next steps:');
  console.log();
  console.log(`    1. ${pc.cyan('git add AGENTS.md .cursorrules .github/ GEMINI.md .claude/ team-connect.mjs')}`);
  console.log(`    2. ${pc.cyan('git commit -m "feat: add multi-agent infrastructure"')}`);
  console.log(`    3. Open your repo in any AI-powered IDE — it just works.`);
  console.log();
  console.log(`  For deep analysis, team boards, and self-improvement daemons:`);
  console.log(`    ${pc.cyan('https://studio.holoscript.net/start')}`);
  console.log();
}

main().catch((err) => {
  console.error(pc.red(`\n  Error: ${err.message}\n`));
  process.exit(1);
});
