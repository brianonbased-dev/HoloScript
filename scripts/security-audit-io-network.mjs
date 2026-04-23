#!/usr/bin/env node
/**
 * Security Audit: File I/O and Network Input Validation
 * 
 * Scans HoloScript packages for security gaps in:
 * 1. File I/O operations (path traversal, missing validation)
 * 2. Network operations (unsanitized URLs, missing host validation)
 * 3. Input validation (unsafe string concatenation, injection risk)
 *
 * Returns findings with severity levels. Exit code:
 *   0 = all checks passed or warnings only (use --strict for exit 1)
 *   1 = critical vulnerabilities found (or --strict mode with any findings)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const STRICT_MODE = process.argv.includes('--strict');
const VERBOSE = process.argv.includes('--verbose');

// ═════════════════════════════════════════════════════════════════════════════
// Configuration
// ═════════════════════════════════════════════════════════════════════════════

const SECURITY_PATTERNS = [
  // FILE I/O VULNERABILITIES
  {
    category: 'file_io',
    name: 'Unvalidated path concatenation',
    severity: 'high',
    patterns: [
      /fs\.(readFile|writeFile|writeFileSync|readFileSync)\s*\(\s*path\.join\s*\(\s*userInput|\/\/\s*@ts-ignore.*fs\.|path\.join.*user/i,
    ],
    description: 'User input concatenated directly into file paths without validation',
  },
  {
    category: 'file_io',
    name: 'Path traversal risk (..)',
    severity: 'high',
    patterns: [
      /path\.join\s*\([^)]*\.\.\s*[,)]/,
      /\/\.\.\//,
    ],
    description: 'Path traversal sequence (..) allowed without sanitization',
  },
  {
    category: 'file_io',
    name: 'Missing traversal check',
    severity: 'medium',
    patterns: [
      /fs\.(readFile|writeFile|rmdir|unlink).*(?!hasTraversal|traversal|normali|resolve)/i,
    ],
    description: 'File operation without prior traversal validation',
    note: 'Review context for false positives',
  },

  // NETWORK VULNERABILITIES
  {
    category: 'network',
    name: 'Unsanitized URL in fetch/request',
    severity: 'high',
    patterns: [
      /fetch\s*\(\s*[`'"]\$|new\s+URL\s*\(\s*userInput|fetch\s*\(\s*url\s*\)\s*(?!.*validat)/i,
    ],
    description: 'URL constructed from user input without validation',
  },
  {
    category: 'network',
    name: 'Missing host whitelist in network call',
    severity: 'medium',
    patterns: [
      /fetch\s*\([`"']https?:\/\/[^\/]/,
    ],
    description: 'Hardcoded external URL without allowedHosts policy check',
    note: 'Review for allowedHosts enforcement',
  },
  {
    category: 'network',
    name: 'WebSocket without origin validation',
    severity: 'medium',
    patterns: [
      /new\s+WebSocket\s*\([`'"']wss?:\/\//,
    ],
    description: 'WebSocket connection without origin/host validation',
  },

  // INPUT VALIDATION GAPS
  {
    category: 'input_validation',
    name: 'Unsafe string interpolation in shell',
    severity: 'high',
    patterns: [
      /execSync\s*\(\s*`[^`]*\$\{|spawnSync.*\$\{user|child_process.*\$\{/i,
    ],
    description: 'Shell command with unescaped variable interpolation',
  },
  {
    category: 'input_validation',
    name: 'eval or Function constructor',
    severity: 'critical',
    patterns: [
      /\beval\s*\(|new\s+Function\s*\(|vm\.runInContext/i,
    ],
    description: 'Dynamic code execution with user input',
  },
  {
    category: 'input_validation',
    name: 'JSON.parse without try-catch',
    severity: 'medium',
    patterns: [
      /(?<!try\s*{[\s\S]{0,100})JSON\.parse\s*\(/,
    ],
    description: 'JSON parsing without error handling for invalid input',
    note: 'May have false positives',
  },
];

const GOOD_PATTERNS = [
  {
    category: 'file_io',
    name: 'Path traversal protection',
    patterns: [
      /hasTraversal|traversal.*detect|path\.normalize|normalize.*path|StdlibPolicy|validatePath/i,
    ],
    description: 'Code includes path traversal checks',
  },
  {
    category: 'network',
    name: 'Host whitelist validation',
    patterns: [
      /allowedHosts|allowNetwork|policy\.allows|validateImports|SecurityPolicy/i,
    ],
    description: 'Code includes network host validation',
  },
  {
    category: 'input_validation',
    name: 'Input sanitization',
    patterns: [
      /sanitize|validate.*input|escape|Shell.*escape|escapeArg/i,
    ],
    description: 'Code includes input sanitization',
  },
];

// ═════════════════════════════════════════════════════════════════════════════
// File Discovery
// ═════════════════════════════════════════════════════════════════════════════

function findTypeScriptFiles(dir, maxDepth = 5) {
  const files = [];

  function walk(current, depth) {
    if (depth > maxDepth) return;

    try {
      const entries = fs.readdirSync(current, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

        const fullPath = path.join(current, entry.name);

        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        } else if (
          entry.isFile() &&
          (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
          !entry.name.endsWith('.d.ts')
        ) {
          files.push(fullPath);
        }
      }
    } catch (err) {
      // Ignore read errors
    }
  }

  walk(dir, 0);
  return files;
}

// ═════════════════════════════════════════════════════════════════════════════
// Security Scanning
// ═════════════════════════════════════════════════════════════════════════════

function scanFile(filePath) {
  const findings = [];

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    // Check for vulnerabilities
    for (const patternDef of SECURITY_PATTERNS) {
      for (const pattern of patternDef.patterns) {
        let match;
        // Note: we can't use global flag with line-based matching easily
        for (let i = 0; i < lines.length; i++) {
          if (pattern.test(lines[i])) {
            findings.push({
              file: filePath,
              type: 'vulnerability',
              category: patternDef.category,
              severity: patternDef.severity,
              name: patternDef.name,
              description: patternDef.description,
              note: patternDef.note,
              lineNumber: i + 1,
              line: lines[i].trim().substring(0, 100),
            });
            break; // Only report once per pattern per file
          }
        }
      }
    }

    // Check for good practices
    const hasGoodPractices = {};
    for (const goodDef of GOOD_PATTERNS) {
      for (const pattern of goodDef.patterns) {
        if (pattern.test(content)) {
          if (!hasGoodPractices[goodDef.category]) {
            hasGoodPractices[goodDef.category] = [];
          }
          hasGoodPractices[goodDef.category].push(goodDef.name);
        }
      }
    }

    return { findings, goodPractices: hasGoodPractices };
  } catch (err) {
    return { findings: [], goodPractices: {} };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Reporting
// ═════════════════════════════════════════════════════════════════════════════

function formatFinding(f) {
  const severityColors = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢',
  };

  const icon = severityColors[f.severity] || '⚪';
  const line = `[${f.lineNumber}] ${f.line}`;

  return `  ${icon} ${f.severity.toUpperCase()}: ${f.name}
      File: ${path.relative(process.cwd(), f.file)}
      Line: ${line}
      ${f.description}${f.note ? `\n      Note: ${f.note}` : ''}`;
}

function main() {
  const holoscriptRoot = path.join(process.cwd());

  // Find all TypeScript files in packages/{security*,mcp-server,studio,platform}/src
  const searchDirs = [
    'packages/mcp-server/src',
    'packages/security-sandbox/src',
    'packages/studio/src',
    'packages/platform/src',
    'packages/core/src/security',
  ];

  const allFiles = [];
  for (const searchDir of searchDirs) {
    const fullPath = path.join(holoscriptRoot, searchDir);
    if (fs.existsSync(fullPath)) {
      allFiles.push(...findTypeScriptFiles(fullPath));
    }
  }

  if (allFiles.length === 0) {
    console.log('⚠️  No TypeScript files found to scan');
    process.exit(1);
  }

  console.log(`🔍 Security Audit: File I/O & Network Validation`);
  console.log(`📁 Scanning ${allFiles.length} files...`);
  console.log('');

  const allFindings = [];
  const criticalFiles = new Set();
  const fileStats = {};

  for (const file of allFiles) {
    const { findings, goodPractices } = scanFile(file);

    if (findings.length > 0) {
      allFindings.push(...findings);
      fileStats[file] = { findings: findings.length, goodPractices };

      for (const f of findings) {
        if (f.severity === 'critical') {
          criticalFiles.add(file);
        }
      }
    }
  }

  // Summary by severity
  const bySeverity = {};
  for (const f of allFindings) {
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
  }

  // Summary by category
  const byCategory = {};
  for (const f of allFindings) {
    byCategory[f.category] = (byCategory[f.category] || 0) + 1;
  }

  console.log('📊 Summary:');
  console.log(`  Total findings: ${allFindings.length}`);
  if (bySeverity.critical) console.log(`  🔴 Critical: ${bySeverity.critical}`);
  if (bySeverity.high) console.log(`  🟠 High: ${bySeverity.high}`);
  if (bySeverity.medium) console.log(`  🟡 Medium: ${bySeverity.medium}`);
  if (bySeverity.low) console.log(`  🟢 Low: ${bySeverity.low}`);
  console.log('');

  console.log('📋 By Category:');
  for (const [category, count] of Object.entries(byCategory)) {
    console.log(`  ${category}: ${count}`);
  }
  console.log('');

  // Report findings
  if (allFindings.length > 0) {
    console.log('🚨 Findings:');
    console.log('');

    for (const finding of allFindings) {
      console.log(formatFinding(finding));
      console.log('');
    }
  } else {
    console.log('✅ No security vulnerabilities detected!');
    console.log('');
  }

  // Exit code logic
  const hasCritical = allFindings.some((f) => f.severity === 'critical');
  const hasHigh = allFindings.some((f) => f.severity === 'high');

  if (hasCritical) {
    console.log('❌ CRITICAL vulnerabilities found — fix immediately');
    process.exit(1);
  }

  if (STRICT_MODE && allFindings.length > 0) {
    console.log('❌ Findings detected in strict mode');
    process.exit(1);
  }

  if (hasHigh && !STRICT_MODE) {
    console.log('⚠️  High-severity findings present — review recommended');
    process.exit(0);
  }

  process.exit(0);
}

main();
