#!/usr/bin/env node
/**
 * check-capability-registry.mjs
 *
 * Enforces: every package under packages/ must map to at least one active
 * surface (paper, product, test) in docs/capability-registry.md OR have an
 * explicit retired-ledger entry in docs/cross-language-deletion-ledger.md.
 *
 * Usage:
 *   node scripts/check-capability-registry.mjs          # full scan
 *   node scripts/check-capability-registry.mjs --diff  # scan staged/HEAD diff only
 *   node scripts/check-capability-registry.mjs --staged # scan staged deletions only
 */

import { readdirSync, readFileSync, existsSync } from "fs";
import { join, basename } from "path";
import { execSync } from "child_process";

const REPO_ROOT = process.cwd();
const REGISTRY_PATH = join(REPO_ROOT, "docs", "capability-registry.md");
const LEDGER_PATH = join(REPO_ROOT, "docs", "cross-language-deletion-ledger.md");
const PACKAGES_DIR = join(REPO_ROOT, "packages");

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const NC = "\x1b[0m";

let FAILED = 0;
let WARNINGS = 0;

function logError(msg) {
  console.error(`${RED}${msg}${NC}`);
  FAILED = 1;
}

function logWarn(msg) {
  console.warn(`${YELLOW}${msg}${NC}`);
  WARNINGS++;
}

function logOk(msg) {
  console.log(`${GREEN}${msg}${NC}`);
}

// ── Parse registry ──
function parseRegistry(path) {
  if (!existsSync(path)) {
    logError(`Registry not found: ${path}`);
    return new Set();
  }
  const text = readFileSync(path, "utf-8");
  const pkgs = new Set();
  // Match table rows that start with `| packages/...`
  const rowRe = /^\| `?(packages\/([^`| ]+))`?\s*\|/gm;
  let m;
  while ((m = rowRe.exec(text)) !== null) {
    pkgs.add(m[2]);
  }
  return pkgs;
}

// ── Parse ledger ──
function parseLedger(path) {
  if (!existsSync(path)) {
    logError(`Ledger not found: ${path}`);
    return new Set();
  }
  const text = readFileSync(path, "utf-8");
  const pkgs = new Set();
  const rowRe = /^\| \d+ \| `?(packages\/([^`| ]+))`?\s*\|/gm;
  let m;
  while ((m = rowRe.exec(text)) !== null) {
    pkgs.add(m[2]);
  }
  return pkgs;
}

// ── List actual package directories ──
function listPackages(dir) {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules")
    .map((e) => e.name);
}

// ── Git diff: deleted package directories ──
function gitDeletedPackages(ref = "HEAD") {
  try {
    const diff = execSync(`git diff --name-status --diff-filter=D ${ref} -- packages/`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const deletions = diff
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => l.split("\t"))
      .filter(([status, path]) => status === "D" && path.startsWith("packages/"))
      .map(([, path]) => {
        const parts = path.split("/");
        return parts.length >= 2 ? parts[1] : null;
      })
      .filter(Boolean);
    return [...new Set(deletions)];
  } catch {
    return [];
  }
}

function gitStagedDeletedPackages() {
  try {
    const diff = execSync("git diff --cached --name-status --diff-filter=D -- packages/", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const deletions = diff
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => l.split("\t"))
      .filter(([status, path]) => status === "D" && path.startsWith("packages/"))
      .map(([, path]) => {
        const parts = path.split("/");
        return parts.length >= 2 ? parts[1] : null;
      })
      .filter(Boolean);
    return [...new Set(deletions)];
  } catch {
    return [];
  }
}

// ── Main ──
const args = process.argv.slice(2);
const diffMode = args.includes("--diff");
const stagedMode = args.includes("--staged");

const registryPkgs = parseRegistry(REGISTRY_PATH);
const ledgerPkgs = parseLedger(LEDGER_PATH);

if (diffMode || stagedMode) {
  const deleted = stagedMode ? gitStagedDeletedPackages() : gitDeletedPackages();
  if (deleted.length === 0) {
    logOk("No deleted package directories detected.");
    process.exit(0);
  }

  console.log(`Checking ${deleted.length} deleted package root(s) against registry + ledger...`);
  for (const pkg of deleted) {
    const inRegistry = registryPkgs.has(pkg);
    const inLedger = ledgerPkgs.has(pkg);
    if (!inRegistry && !inLedger) {
      logError(`UNMAPPED DELETION: packages/${pkg}`);
      console.error(`  → Not in capability-registry.md and not in cross-language-deletion-ledger.md`);
      console.error(`  → Before deleting, either:`);
      console.error(`     1. Add a registry row (if the package maps to an active surface), OR`);
      console.error(`     2. Add a ledger entry (if retired/merged/migrated/superseded).`);
    } else if (inLedger) {
      console.log(`  OK: packages/${pkg} → ledgered`);
    } else {
      console.log(`  OK: packages/${pkg} → registry`);
    }
  }
  process.exit(FAILED);
}

// Full scan mode
const actualPkgs = listPackages(PACKAGES_DIR);
const unmapped = [];

for (const pkg of actualPkgs) {
  const inRegistry = registryPkgs.has(pkg);
  const inLedger = ledgerPkgs.has(pkg);
  if (!inRegistry && !inLedger) {
    unmapped.push(pkg);
  }
}

if (unmapped.length > 0) {
  logError(`UNMAPPED PACKAGES (${unmapped.length}):`);
  for (const pkg of unmapped) {
    console.error(`  - packages/${pkg}`);
  }
  console.error("");
  console.error("Fix: add a row to docs/capability-registry.md (active surface) OR");
  console.error("     add an entry to docs/cross-language-deletion-ledger.md (retired).");
} else {
  logOk(`All ${actualPkgs.length} package directories mapped to registry or ledger.`);
}

// Extra: warn if registry lists packages that no longer exist on disk (stale rows)
const stale = [];
for (const pkg of registryPkgs) {
  const dirPath = join(PACKAGES_DIR, pkg);
  if (!existsSync(dirPath) && !ledgerPkgs.has(pkg)) {
    stale.push(pkg);
  }
}
if (stale.length > 0) {
  logWarn(`STALE REGISTRY ROWS (${stale.length}): package removed from disk but no ledger entry.`);
  for (const pkg of stale) {
    console.warn(`  - packages/${pkg}`);
  }
}

process.exit(FAILED);
