#!/usr/bin/env python3
"""
A.011.02d Migration Script: Move training & learning from core to framework.

Reuses pattern from A.011.02c (AI extraction).
Copy files → update imports → create shims → wire exports.
"""

import os
import shutil
import re
from pathlib import Path

# Configuration
REPO_ROOT = Path(__file__).parent
CORE_TRAINING = REPO_ROOT / "packages/core/src/training"
CORE_LEARNING = REPO_ROOT / "packages/core/src/learning"
FRAMEWORK_TRAINING = REPO_ROOT / "packages/framework/src/training"
FRAMEWORK_LEARNING = REPO_ROOT / "packages/framework/src/learning"

# Files to skip
SKIP_PATTERNS = ["__tests__", ".test.ts", ".spec.ts"]

def should_skip(filepath: str) -> bool:
    """Check if file should be skipped."""
    for pattern in SKIP_PATTERNS:
        if pattern in filepath:
            return True
    return False

def copy_files(source_dir: Path, dest_dir: Path, module_name: str) -> list:
    """Copy non-test files and return list of copied files."""
    if not source_dir.exists():
        print(f"❌ Source dir not found: {source_dir}")
        return []
    
    dest_dir.mkdir(parents=True, exist_ok=True)
    copied = []
    
    for src_file in source_dir.rglob("*.ts"):
        if should_skip(str(src_file)):
            continue
        
        # Compute relative path
        rel_path = src_file.relative_to(source_dir)
        dst_file = dest_dir / rel_path
        
        # Create dest subdirs
        dst_file.parent.mkdir(parents=True, exist_ok=True)
        
        # Copy file
        shutil.copy2(src_file, dst_file)
        copied.append(str(rel_path))
        print(f"  ✓ Copied {module_name}/{rel_path}")
    
    return sorted(copied)

def update_imports(filepath: Path, module_name: str):
    """Update imports in migrated file."""
    content = open(filepath, 'r', encoding='utf-8').read()
    original = content
    
    # Update relative imports that go outside the module
    # e.g., ../../../../core/parser -> @holoscript/core/parser
    content = re.sub(
        r"from\s+['\"]\.\.\/\.\.\/\.\.\/\.\.\/([^\/]+)\/([^'\"]+)['\"]",
        r"from '@holoscript/\1/\2'",
        content
    )
    
    # Also handle some 5-level up imports
    content = re.sub(
        r"from\s+['\"]\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/([^\/]+)\/([^'\"]+)['\"]",
        r"from '@holoscript/\1/\2'",
        content
    )
    
    # Update @holoscript/core/src/* to @holoscript/core/*
    content = re.sub(
        r"from\s+['\"]@holoscript\/core\/src\/",
        r"from '@holoscript/core/",
        content
    )
    
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"  ✓ Updated imports in {filepath.name}")

def create_shim_file(filepath: Path, framework_module_name: str):
    """Create export shim for core file."""
    shim_content = f'''/**
 * @deprecated This module has moved to `@holoscript/framework/{framework_module_name}`.
 * Import from `@holoscript/framework` or `@holoscript/framework/{framework_module_name}` instead.
 * This re-export shim will be removed in a future release.
 */
export * from '@holoscript/framework/{framework_module_name}';
'''
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(shim_content)

def create_index_barrel(dest_dir: Path, module_name: str):
    """Create index.ts barrel if it doesn't exist."""
    index_file = dest_dir / "index.ts"
    if index_file.exists():
        return  # Don't overwrite existing
    
    # Glob all .ts files (non-test) and create exports
    files = sorted([
        f.stem for f in dest_dir.glob("*.ts")
        if f.name != "index.ts" and not should_skip(f.name)
    ])
    
    exports = "\n".join([f"export * from './{name}';" for name in files])
    
    content = f'''/**
 * {module_name.capitalize()} module barrel
 * Re-exports all {module_name} functionality from @holoscript/framework
 */
{exports}
'''
    with open(index_file, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"  ✓ Created {module_name}/index.ts barrel")

def main():
    print("\n🚀 Starting A.011.02d Migration (training + learning)")
    print("=" * 70)
    
    # Step 1: Copy training files
    print("\n📋 Step 1: Copying training files...")
    training_copied = copy_files(CORE_TRAINING, FRAMEWORK_TRAINING, "training")
    
    # Step 2: Copy learning files
    print("\n📋 Step 2: Copying learning files...")
    learning_copied = copy_files(CORE_LEARNING, FRAMEWORK_LEARNING, "learning")
    
    # Step 3: Update imports in framework copies
    print("\n🔧 Step 3: Updating imports in framework copies...")
    for src_file in FRAMEWORK_TRAINING.rglob("*.ts"):
        if not should_skip(str(src_file)):
            update_imports(src_file, "training")
    
    for src_file in FRAMEWORK_LEARNING.rglob("*.ts"):
        if not should_skip(str(src_file)):
            update_imports(src_file, "learning")
    
    # Step 4: Create shims in core
    print("\n🔄 Step 4: Creating shims in core...")
    
    # Create core/src/training/index.ts shim
    training_index = CORE_TRAINING / "index.ts"
    if training_index.exists():
        create_shim_file(training_index, "training")
        print("  ✓ Shimmed core/src/training/index.ts")
    
    # Create core/src/learning/index.ts shim
    learning_index = CORE_LEARNING / "index.ts"
    if learning_index.exists():
        create_shim_file(learning_index, "learning")
        print("  ✓ Shimmed core/src/learning/index.ts")
    
    # Step 5: Create barrels if needed
    print("\n📦 Step 5: Creating barrels...")
    create_index_barrel(FRAMEWORK_TRAINING, "training")
    create_index_barrel(FRAMEWORK_LEARNING, "learning")
    
    # Summary
    print("\n" + "=" * 70)
    print(f"✅ Migration complete!")
    print(f"   - Copied {len(training_copied)} training files")
    print(f"   - Copied {len(learning_copied)} learning files")
    print(f"   - Created shims in core")
    print(f"   - Created barrels in framework")
    print("\n📝 Next steps:")
    print("   1. npm run build:framework (validate isolated builds)")
    print("   2. git add packages/framework packages/core")
    print("   3. git commit -m 'migration: move training/learning to framework'")
    print("   4. Mark board task done")

if __name__ == "__main__":
    main()
