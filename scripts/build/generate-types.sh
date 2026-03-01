#!/usr/bin/env bash
# Generate TypeScript types from Rust code using Typeshare

set -e

echo "🔄 Generating TypeScript types from Rust..."

# Install typeshare CLI if not present
if ! command -v typeshare &> /dev/null; then
    echo "📦 Installing typeshare CLI..."
    cargo install typeshare-cli
fi

# Generate types for compiler-wasm package
echo "📝 Generating types for compiler-wasm..."
typeshare packages/compiler-wasm/src \
    --lang=typescript \
    --output-file=packages/core/src/generated/ast.types.ts

echo "✅ TypeScript types generated successfully!"
echo "📁 Output: packages/core/src/generated/ast.types.ts"

# Format generated types with prettier if available
if command -v pnpm &> /dev/null; then
    echo "🎨 Formatting generated types..."
    pnpm prettier --write packages/core/src/generated/ast.types.ts
fi

echo "✨ Done!"
