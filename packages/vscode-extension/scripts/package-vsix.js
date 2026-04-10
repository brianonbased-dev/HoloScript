#!/usr/bin/env node

/**
 * Platform-Specific VSIX Packager
 *
 * Pattern P.002.01: Platform-specific VSIX bundling
 *
 * Builds separate VSIXs for each platform with native LSP binaries:
 * - win32-x64 (Windows x64)
 * - darwin-x64 (macOS Intel)
 * - darwin-arm64 (macOS Apple Silicon)
 * - linux-x64 (Linux x64)
 *
 * Usage:
 *   node package-vsix.js                    # Package all platforms
 *   node package-vsix.js --platform win32-x64  # Package single platform
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PLATFORMS = ['win32-x64', 'darwin-x64', 'darwin-arm64', 'linux-x64'];

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function exec(command, options = {}) {
  log(`  $ ${command}`, 'blue');
  return execSync(command, { stdio: 'inherit', ...options });
}

function packagePlatform(platform) {
  log(`\n📦 Packaging VSIX for ${platform}...`, 'green');

  const binDir = path.join(__dirname, '..', 'bin', platform);

  // Check if platform-specific binaries exist
  if (!fs.existsSync(binDir)) {
    log(`⚠️  No binaries found for ${platform}, skipping`, 'yellow');
    return;
  }

  // Check if LSP binary exists
  const lspBinary = platform.startsWith('win32') ? 'holoscript-lsp.exe' : 'holoscript-lsp';

  const lspPath = path.join(binDir, lspBinary);

  if (!fs.existsSync(lspPath)) {
    log(`⚠️  LSP binary not found: ${lspPath}`, 'yellow');
    log(`   Using TypeScript LSP fallback`, 'yellow');
  }

  // Package VSIX with vsce
  try {
    exec(`vsce package --target ${platform} -o holoscript-${platform}.vsix`, {
      cwd: path.join(__dirname, '..'),
    });
    log(`✅ Created: holoscript-${platform}.vsix`, 'green');
  } catch (err) {
    log(`❌ Failed to package ${platform}: ${err.message}`, 'yellow');
  }
}

function main() {
  const args = process.argv.slice(2);
  const platformArg = args.find((arg) => arg.startsWith('--platform='));

  if (platformArg) {
    const platform = platformArg.split('=')[1];
    if (!PLATFORMS.includes(platform)) {
      log(`❌ Invalid platform: ${platform}`, 'yellow');
      log(`   Valid platforms: ${PLATFORMS.join(', ')}`, 'yellow');
      process.exit(1);
    }
    packagePlatform(platform);
  } else {
    log('🚀 Packaging VSCode extension for all platforms\n', 'blue');

    for (const platform of PLATFORMS) {
      packagePlatform(platform);
    }

    log('\n✨ All platforms packaged!', 'green');
    log('\nPublish to marketplace:', 'blue');
    log('  vsce publish --packagePath holoscript-*.vsix', 'blue');
  }
}

main();
