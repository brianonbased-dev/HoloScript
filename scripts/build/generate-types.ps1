# Generate TypeScript types from Rust code using Typeshare

$ErrorActionPreference = "Stop"

Write-Host "🔄 Generating TypeScript types from Rust..." -ForegroundColor Cyan

# Check if typeshare CLI is installed
$typeshareInstalled = Get-Command typeshare -ErrorAction SilentlyContinue

if (-not $typeshareInstalled) {
    Write-Host "📦 Installing typeshare CLI..." -ForegroundColor Yellow
    cargo install typeshare-cli
}

# Generate types for compiler-wasm package
Write-Host "📝 Generating types for compiler-wasm..." -ForegroundColor Cyan
typeshare packages/compiler-wasm/src `
    --lang=typescript `
    --output-file=packages/core/src/generated/ast.types.ts

Write-Host "✅ TypeScript types generated successfully!" -ForegroundColor Green
Write-Host "📁 Output: packages/core/src/generated/ast.types.ts" -ForegroundColor Gray

# Format generated types with prettier if available
$pnpmInstalled = Get-Command pnpm -ErrorAction SilentlyContinue

if ($pnpmInstalled) {
    Write-Host "🎨 Formatting generated types..." -ForegroundColor Cyan
    pnpm prettier --write packages/core/src/generated/ast.types.ts
}

Write-Host "✨ Done!" -ForegroundColor Green
