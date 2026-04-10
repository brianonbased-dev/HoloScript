#!/usr/bin/env python3
"""
A.011.02f Migration Script: Move skills and negotiation from core to framework.

Reuses pattern from A.011.02c, A.011.02d, and A.011.02e.
Copy files → update imports → create shims → wire exports.
"""

import os
import shutil
import re
from pathlib import Path

# Configuration
REPO_ROOT = Path(__file__).parent
CORE_SKILLS = REPO_ROOT / "packages/core/src/skills"
CORE_NEGOTIATION = REPO_ROOT / "packages/core/src/negotiation"
FRAMEWORK_SKILLS = REPO_ROOT / "packages/framework/src/skills"
FRAMEWORK_NEGOTIATION = REPO_ROOT / "packages/framework/src/negotiation"

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
    print("\n🚀 Starting A.011.02f Migration (skills + negotiation)")
    print("=" * 70)
    
    # Step 1: Copy skills files
    print("\n📋 Step 1: Copying skills files...")
    skills_copied = copy_files(CORE_SKILLS, FRAMEWORK_SKILLS, "skills")
    
    # Step 2: Copy negotiation files
    print("\n📋 Step 1b: Copying negotiation files...")
    negotiation_copied = copy_files(CORE_NEGOTIATION, FRAMEWORK_NEGOTIATION, "negotiation")
    
    # Step 3: Update imports
    print("\n🔧 Step 2: Updating imports...")
    for src_file in FRAMEWORK_SKILLS.rglob("*.ts"):
        if not should_skip(str(src_file)):
            update_imports(src_file, "skills")
    for src_file in FRAMEWORK_NEGOTIATION.rglob("*.ts"):
        if not should_skip(str(src_file)):
            update_imports(src_file, "negotiation")
    
    # Step 4: Create barrels
    print("\n📦 Step 3: Creating barrels...")
    create_index_barrel(FRAMEWORK_SKILLS, "skills")
    create_index_barrel(FRAMEWORK_NEGOTIATION, "negotiation")
    
    # Summary
    print("\n" + "=" * 70)
    print(f"✅ Migration complete!")
    print(f"   - Copied {len(skills_copied)} skills files")
    print(f"   - Copied {len(negotiation_copied)} negotiation files")
    print(f"   - Created barrels in framework")
    print("\n📝 Next steps:")
    print("   1. Update framework/package.json exports (./skills, ./negotiation)")
    print("   2. Update framework/tsup.config.ts entries")
    print("   3. Update framework/src/index.ts imports")
    print("   4. Validate isolated builds")
    print("   5. git add packages/framework packages/core")
    print("   6. git commit -m 'refactor(framework): extract skills and negotiation from core'")

if __name__ == "__main__":
    main()
