#!/usr/bin/env node
/**
 * MCP Manifest Diff — Authoritative source-vs-live comparison.
 *
 * Scans the HoloScript source (AST-based) for all MCP tool definitions,
 * fetches the live manifest from /.well-known/mcp, and produces a
 * zero-false-positive diff.
 */

import ts from 'typescript';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// ── Phase 0: Gather source files ───────────────────────────────────────────
function collectSourceFiles(dir) {
  const files = [];
  function walk(d) {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === '__tests__' || ent.name === 'node_modules' || ent.name === 'dist') continue;
        walk(full);
      } else if (ent.isFile() && ent.name.endsWith('.ts') && !ent.name.endsWith('.test.ts')) {
        files.push(full);
      }
    }
  }
  walk(dir);
  return files;
}

const SOURCE_DIRS = [
  path.join(REPO_ROOT, 'packages/mcp-server/src'),
  path.join(REPO_ROOT, 'packages/absorb-service/src/mcp'),
];

const allFiles = SOURCE_DIRS.flatMap(collectSourceFiles);

// ── Phase 1: Parse every file and extract exported Tool[] arrays ───────────
const arrayMap = new Map(); // arrayName -> { file, names: string[], generated: boolean[] }

function unwrapExpression(node) {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) {
    node = node.expression;
  }
  return node;
}

function getName(node, sourceFile) {
  node = unwrapExpression(node);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function resolveTemplate(templateNode, paramName, value, sourceFile) {
  templateNode = unwrapExpression(templateNode);
  if (!ts.isTemplateExpression(templateNode)) return null;
  let result = '';
  if (templateNode.head) result += templateNode.head.text;
  for (let i = 0; i < templateNode.templateSpans.length; i++) {
    const span = templateNode.templateSpans[i];
    const expr = span.expression;
    if (ts.isIdentifier(expr) && expr.text === paramName) {
      result += value;
    } else {
      return null; // Cannot resolve
    }
    result += span.literal.text;
  }
  return result;
}

function extractNamesFromArray(arrayNode, arrayName, sourceFile, out) {
  for (const elem of arrayNode.elements) {
    if (ts.isObjectLiteralExpression(elem)) {
      const nameProp = elem.properties.find(
        (p) => ts.isPropertyAssignment(p) && p.name.getText(sourceFile) === 'name'
      );
      if (nameProp && ts.isPropertyAssignment(nameProp)) {
        const nameVal = nameProp.initializer;
        const resolved = getName(nameVal, sourceFile);
        if (resolved) {
          out.push({ name: resolved, generated: false });
        }
      }
    } else if (ts.isSpreadElement(elem)) {
      const expr = elem.expression;
      // Case: ...([...] as const).map((x) => ({ name: `...${x}...` }))
      if (
        ts.isCallExpression(expr) &&
        ts.isPropertyAccessExpression(expr.expression) &&
        expr.expression.name.text === 'map'
      ) {
        const arrExpr = expr.expression.expression;
        let arrayLit = null;
        if (ts.isArrayLiteralExpression(arrExpr)) {
          arrayLit = arrExpr;
        } else if (ts.isParenthesizedExpression(arrExpr)) {
          const inner = arrExpr.expression;
          if (ts.isAsExpression(inner) && ts.isArrayLiteralExpression(inner.expression)) {
            arrayLit = inner.expression;
          }
        }

        const mapArrow = expr.arguments[0];
        if (
          arrayLit &&
          (ts.isArrowFunction(mapArrow) || ts.isFunctionExpression(mapArrow)) &&
          mapArrow.parameters.length === 1
        ) {
          const paramName = mapArrow.parameters[0].name.getText(sourceFile);
          let bodyObj = null;
          const unwrappedBody = unwrapExpression(mapArrow.body);
          if (ts.isObjectLiteralExpression(unwrappedBody)) {
            bodyObj = unwrappedBody;
          } else if (ts.isBlock(unwrappedBody)) {
            for (const stmt of unwrappedBody.statements) {
              if (ts.isReturnStatement(stmt) && stmt.expression) {
                const retExpr = unwrapExpression(stmt.expression);
                if (ts.isObjectLiteralExpression(retExpr)) {
                  bodyObj = retExpr;
                  break;
                }
              }
            }
          }
          if (bodyObj) {
            const nameProp = bodyObj.properties.find(
              (p) => ts.isPropertyAssignment(p) && p.name.getText(sourceFile) === 'name'
            );
            if (nameProp && ts.isPropertyAssignment(nameProp)) {
              const init = unwrapExpression(nameProp.initializer);
              if (ts.isTemplateExpression(init)) {
                for (const arrElem of arrayLit.elements) {
                  const v = getName(arrElem, sourceFile);
                  if (v) {
                    const resolved = resolveTemplate(init, paramName, v, sourceFile);
                    if (resolved) {
                      out.push({ name: resolved, generated: true });
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

for (const filePath of allFiles) {
  const sourceText = fs.readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);

  function visit(node) {
    if (ts.isVariableStatement(node)) {
      const isExported = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (!isExported) {
        ts.forEachChild(node, visit);
        return;
      }

      for (const decl of node.declarationList.declarations) {
        const declName = decl.name.getText(sourceFile);
        if (!declName.match(/(?:^tools$|Tools$|ToolDefinitions$)/)) {
          ts.forEachChild(decl, visit);
          continue;
        }

        if (!decl.initializer || !ts.isArrayLiteralExpression(decl.initializer)) {
          ts.forEachChild(decl, visit);
          continue;
        }

        const entries = [];
        extractNamesFromArray(decl.initializer, declName, sourceFile, entries);
        // Always register the array, even if empty (e.g. tools.ts is all spreads)
        const existing = arrayMap.get(declName);
        if (existing) {
          existing.names.push(...entries.map((e) => e.name));
          existing.generated.push(...entries.map((e) => e.generated));
        } else {
          arrayMap.set(declName, {
            file: filePath,
            names: entries.map((e) => e.name),
            generated: entries.map((e) => e.generated),
          });
        }
      }
      return; // Don't recurse into children of variable statement (already handled)
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

// ── Phase 2: Resolve the canonical `tools` array from tools.ts ──────────────
const toolsFile = path.join(REPO_ROOT, 'packages/mcp-server/src/tools.ts');
const toolsSource = ts.createSourceFile(
  toolsFile,
  fs.readFileSync(toolsFile, 'utf-8'),
  ts.ScriptTarget.Latest,
  true
);

function resolveArrayByName(name, visited = new Set()) {
  if (visited.has(name)) return [];
  visited.add(name);

  const info = arrayMap.get(name);
  if (!info) return [];

  const result = [];
  // Re-parse the specific file for this array to resolve spreads
  const sf = ts.createSourceFile(info.file, fs.readFileSync(info.file, 'utf-8'), ts.ScriptTarget.Latest, true);
  function findArray(node) {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (decl.name.getText(sf) === name && decl.initializer && ts.isArrayLiteralExpression(decl.initializer)) {
          return decl.initializer;
        }
      }
    }
    let found = null;
    ts.forEachChild(node, (c) => {
      if (!found) found = findArray(c);
    });
    return found;
  }
  const arr = findArray(sf);
  if (!arr) return info.names.map((n, i) => ({ name: n, generated: info.generated[i] }));

  for (const elem of arr.elements) {
    if (ts.isObjectLiteralExpression(elem)) {
      const nameProp = elem.properties.find(
        (p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === 'name'
      );
      if (nameProp && ts.isPropertyAssignment(nameProp)) {
        const resolved = getName(nameProp.initializer, sf);
        if (resolved) result.push({ name: resolved, generated: false });
      }
    } else if (ts.isSpreadElement(elem)) {
      const expr = elem.expression;
      if (ts.isIdentifier(expr)) {
        result.push(...resolveArrayByName(expr.text, visited));
      } else if (
        ts.isCallExpression(expr) &&
        ts.isPropertyAccessExpression(expr.expression) &&
        expr.expression.name.text === 'map'
      ) {
        // inline generated spread
        const entries = [];
        extractNamesFromArray(ts.factory.createArrayLiteralExpression([elem]), name, sf, entries);
        result.push(...entries);
      }
    }
  }
  return result;
}

const toolsArray = resolveArrayByName('tools');
const toolsNames = new Set(toolsArray.map((e) => e.name));

// ── Phase 3: Resolve ALL_AVAILABLE_TOOLS from index.ts ─────────────────────
const indexFile = path.join(REPO_ROOT, 'packages/mcp-server/src/index.ts');
const indexSource = ts.createSourceFile(
  indexFile,
  fs.readFileSync(indexFile, 'utf-8'),
  ts.ScriptTarget.Latest,
  true
);

const allAvailableEntries = [];
function findAllAvailable(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(indexSource) === 'ALL_AVAILABLE_TOOLS') {
    if (node.initializer && ts.isArrayLiteralExpression(node.initializer)) {
      for (const elem of node.initializer.elements) {
        if (ts.isObjectLiteralExpression(elem)) {
          const nameProp = elem.properties.find(
            (p) => ts.isPropertyAssignment(p) && p.name.getText(indexSource) === 'name'
          );
          if (nameProp && ts.isPropertyAssignment(nameProp)) {
            const resolved = getName(nameProp.initializer, indexSource);
            if (resolved) allAvailableEntries.push({ name: resolved, source: 'inline', generated: false });
          }
        } else if (ts.isSpreadElement(elem)) {
          const expr = elem.expression;
          if (ts.isIdentifier(expr)) {
            allAvailableEntries.push(...resolveArrayByName(expr.text).map((e) => ({ ...e, source: expr.text })));
          }
        }
      }
    }
  }
  ts.forEachChild(node, findAllAvailable);
}
findAllAvailable(indexSource);
const allAvailableNames = new Set(allAvailableEntries.map((e) => e.name));

// ── Phase 4: Fetch live manifest ───────────────────────────────────────────
const LIVE_URL = process.argv.includes('--live-url')
  ? process.argv[process.argv.indexOf('--live-url') + 1]
  : 'https://mcp.holoscript.net/.well-known/mcp';
const JSON_MODE = process.argv.includes('--json');
const liveRes = await fetch(LIVE_URL);
if (!liveRes.ok) {
  console.error(`Failed to fetch live manifest: ${liveRes.status}`);
  process.exit(2);
}
const liveManifest = await liveRes.json();
const liveTools = liveManifest.tools || [];
const liveNames = new Set(liveTools.map((t) => t.name));

// ── Phase 5: Detect duplicates ────────────────────────────────────────────
const duplicateNames = [];
const seen = new Map(); // name -> [arrayName]
for (const [arrayName, info] of arrayMap) {
  for (const name of info.names) {
    const prev = seen.get(name) || [];
    prev.push(arrayName);
    seen.set(name, prev);
  }
}
for (const [name, arrays] of seen) {
  if (arrays.length > 1) {
    duplicateNames.push({ name, arrays });
  }
}

// ── Phase 6: Classify differences ──────────────────────────────────────────
function classify(name) {
  if (name.startsWith('uaa2_') || name.startsWith('hs_plugin_')) return 'plugin';
  if (name === 'holoscript_discover_tools' || name === 'holoscript_batch_execute') return 'meta';
  const genEntry = toolsArray.find((e) => e.name === name);
  if (genEntry?.generated) return 'generated';
  return 'core';
}

const sourceOnly = [];
for (const name of toolsNames) {
  if (!liveNames.has(name)) {
    sourceOnly.push({ name, classification: classify(name) });
  }
}

const liveOnly = [];
for (const name of liveNames) {
  if (!toolsNames.has(name)) {
    liveOnly.push({ name, classification: classify(name) });
  }
}

const inAllAvailableButNotTools = [];
for (const name of allAvailableNames) {
  if (!toolsNames.has(name)) {
    inAllAvailableButNotTools.push({ name, classification: classify(name) });
  }
}

const matched = [...toolsNames].filter((n) => liveNames.has(n));
const concreteGaps =
  sourceOnly.filter((x) => x.classification !== 'meta' && x.classification !== 'plugin').length +
  liveOnly.filter((x) => x.classification !== 'plugin').length +
  inAllAvailableButNotTools.filter((x) => x.classification !== 'meta').length;

const report = {
  meta: {
    sourceArrays: arrayMap.size,
    sourceTools: toolsNames.size,
    liveTools: liveNames.size,
    allAvailableTools: allAvailableNames.size,
    matched: matched.length,
    sourceOnly: sourceOnly.length,
    liveOnly: liveOnly.length,
    httpOnly: inAllAvailableButNotTools.length,
    duplicates: duplicateNames.length,
    concreteGaps,
  },
  sourceOnly: sourceOnly.sort((a, b) => a.name.localeCompare(b.name)),
  liveOnly: liveOnly.sort((a, b) => a.name.localeCompare(b.name)),
  httpOnly: inAllAvailableButNotTools.sort((a, b) => a.name.localeCompare(b.name)),
  duplicates: duplicateNames.sort((a, b) => a.name.localeCompare(b.name)),
};

if (JSON_MODE) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`=== MCP Manifest Diff ===\n`);
  console.log(`Source arrays scanned: ${report.meta.sourceArrays}`);
  console.log(`Source tools array (tools.ts): ${report.meta.sourceTools}`);
  console.log(`Live manifest tools: ${report.meta.liveTools}`);
  console.log(`ALL_AVAILABLE_TOOLS (index.ts): ${report.meta.allAvailableTools}`);
  if (report.meta.duplicates) {
    console.log(`Duplicate source definitions: ${report.meta.duplicates}`);
  }
  console.log();

  if (sourceOnly.length) {
    console.log(`SOURCE-ONLY (in tools.ts but NOT live) — ${sourceOnly.length}`);
    for (const { name, classification } of sourceOnly) {
      console.log(`  [${classification}] ${name}`);
    }
    console.log();
  }

  if (liveOnly.length) {
    console.log(`LIVE-ONLY (in live manifest but NOT in tools.ts) — ${liveOnly.length}`);
    for (const { name, classification } of liveOnly) {
      console.log(`  [${classification}] ${name}`);
    }
    console.log();
  }

  if (inAllAvailableButNotTools.length) {
    console.log(`HTTP-ONLY (in ALL_AVAILABLE_TOOLS but NOT in tools.ts) — ${inAllAvailableButNotTools.length}`);
    for (const { name, classification } of inAllAvailableButNotTools) {
      console.log(`  [${classification}] ${name}`);
    }
    console.log();
  }

  if (duplicateNames.length) {
    console.log(`DUPLICATES (defined in >1 array) — ${duplicateNames.length}`);
    for (const { name, arrays } of duplicateNames) {
      console.log(`  ${name} in: ${arrays.join(', ')}`);
    }
    console.log();
  }

  console.log('Summary:');
  console.log(`  Matched: ${report.meta.matched}`);
  console.log(`  Source-only: ${report.meta.sourceOnly}`);
  console.log(`  Live-only: ${report.meta.liveOnly}`);
  console.log(`  HTTP-only (stdio vs HTTP gap): ${report.meta.httpOnly}`);

  if (concreteGaps > 0) {
    console.log(`\nConcrete gaps detected: ${concreteGaps}`);
  } else {
    console.log('\nNo concrete gaps (all explainable as meta/plugin/generated).');
  }
}

process.exit(concreteGaps > 0 ? 1 : 0);
