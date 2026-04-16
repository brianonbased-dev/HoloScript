# Bundle Reflection Pattern

Automated bundle size monitoring and optimization system that uses reflection to detect size increases, analyze root causes, and generate actionable recommendations.

## Overview

After each build, the system:
1. **Measures** bundle sizes vs. previous build
2. **Detects** size increases >10% (configurable)
3. **Analyzes** root causes (new dependencies, tree-shaking failures, lazy loading opportunities)
4. **Generates** optimization recommendations
5. **Auto-applies** fixes (optional)

**Target**: 10-20% incremental size reduction over 6 months

## Quick Start

### Install Build Hook

```bash
cd /path/to/your/project
bash ~/.claude/skills/frontend/bundle-reflection.sh install . vite
```

This adds a `postbuild` script to your `package.json` that automatically runs reflection after each build.

### Manual Run

```bash
# Run analysis on current project
bash ~/.claude/skills/frontend/bundle-reflection.sh run .

# Run with custom threshold (15%)
export BUNDLE_THRESHOLD=15
bash ~/.claude/skills/frontend/bundle-reflection.sh run .

# Run with auto-fix enabled
export BUNDLE_AUTO_FIX=true
bash ~/.claude/skills/frontend/bundle-reflection.sh run .
```

## Configuration

### Environment Variables

```bash
# Size increase threshold percentage (default: 10)
export BUNDLE_THRESHOLD=10

# Auto-apply fixes (default: false)
export BUNDLE_AUTO_FIX=true
```

### Project Setup

The system expects:
- **Dist directory**: `./dist` (configurable in bundle-reflection.js)
- **Build output**: JS, CSS, HTML files in dist
- **Package.json**: For build hook installation

## Features

### 1. Size Comparison

Compares current build with previous build:
- Total bundle size
- Individual file sizes
- Delta (bytes and percentage)
- New/deleted files

### 2. Issue Detection

Triggers analysis when:
- Any bundle increases >10% (configurable threshold)
- Total size exceeds targets
- New dependencies added

**Severity Levels**:
- **Critical**: >20% increase or bundle >500KB
- **Warning**: 10-20% increase

### 3. Root Cause Analysis

Analyzes issues to identify:

**Dependency Bloat**:
- Detects heavy libraries (moment, lodash, jquery, etc.)
- Suggests lighter alternatives
- Estimates size savings

**Code Duplication**:
- Finds duplicate functions
- Recommends extraction to shared utilities

**Missing Code Splitting**:
- Detects absence of lazy loading
- Counts static vs. dynamic imports
- Recommends route-based splitting

**Tree-Shaking Failures**:
- Identifies bundles >500KB
- Checks for ES module usage
- Suggests optimization strategies

**CSS Optimization**:
- Detects large CSS bundles (>100KB)
- Recommends PurgeCSS or similar tools

### 4. Optimization Recommendations

Categorized recommendations:
- **Dependencies**: Replace heavy libraries
- **Code Splitting**: Implement lazy loading
- **Tree-Shaking**: Enable/fix optimizations
- **CSS**: Purge unused styles
- **Duplication**: Extract shared code

Each recommendation includes:
- Issue description
- Fix suggestion
- Estimated savings
- Code examples

### 5. Auto-Fix (Optional)

When `BUNDLE_AUTO_FIX=true`, system can:
- Modify config files (vite.config.js, webpack.config.js)
- Add optimization plugins
- Update build scripts

**Manual fixes** (require user review):
- Dependency replacements
- Code refactoring

### 6. History Tracking

Maintains `.bundle-history.json` with:
- Last 30 builds
- Timestamp, sizes, issues, recommendations
- Trend analysis

View history:
```bash
bash ~/.claude/skills/frontend/bundle-reflection.sh history .
```

### 7. Detailed Reports

Generated after each analysis in `.bundle-analysis/`:
- JSON reports with full details
- Timestamp-based filenames
- Changes, issues, recommendations

View latest report:
```bash
bash ~/.claude/skills/frontend/bundle-reflection.sh report .
```

## Example Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 BUNDLE SIZE REFLECTION ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 Summary:
   Total bundles: 5
   Total size: 847.32 KB
   Previous size: 712.45 KB
   Change: +134.87 KB (+18.93%)

🚨 Issues Detected:

   🔴 assets/main-abc123.js
      Bundle size increased by 23.45% (+98.23 KB)
      421.32 KB → 519.55 KB

💡 Optimization Recommendations:

   📂 DEPENDENCY:
      • Detected moment (~290KB)
        Fix: Replace with date-fns or day.js (~10KB)
        Savings: ~290KB

   📂 CODE-SPLITTING:
      • No lazy loading detected (45 static imports)
        Fix: Implement route-based code splitting with React.lazy()
        Savings: ~30-50% of current bundle size

   📂 TREE-SHAKING:
      • Bundle exceeds 500KB
        Fix: Ensure tree-shaking is enabled (use ES modules)
        Savings: ~20-40%

📄 Detailed report saved to: .bundle-analysis/report-2026-02-27T10-30-45.json
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Integration Examples

### Vite

```json
// package.json
{
  "scripts": {
    "build": "vite build",
    "postbuild": "bash $HOME/.claude/skills/frontend/bundle-reflection.sh run ."
  }
}
```

### Webpack

```json
// package.json
{
  "scripts": {
    "build": "webpack --mode production",
    "postbuild": "bash $HOME/.claude/skills/frontend/bundle-reflection.sh run ."
  }
}
```

### CI/CD Pipeline

```yaml
# .github/workflows/build.yml
- name: Build
  run: npm run build

- name: Bundle Reflection
  run: bash ~/.claude/skills/frontend/bundle-reflection.sh run .
  env:
    BUNDLE_THRESHOLD: 10
    BUNDLE_AUTO_FIX: false

- name: Upload Report
  uses: actions/upload-artifact@v2
  with:
    name: bundle-analysis
    path: .bundle-analysis/
```

## Files Generated

```
your-project/
├── .bundle-history.json          # Last 30 builds
├── .bundle-analysis/              # Detailed reports
│   ├── report-2026-02-27T10-30-45.json
│   ├── report-2026-02-27T14-15-20.json
│   └── ...
└── dist/                          # Build output (analyzed)
```

## Security

All operations use the shared security library:
- Path validation (prevents traversal)
- Command whitelisting
- Secure logging
- No external network access

## Troubleshooting

### "No dist directory found"

Run your build first:
```bash
npm run build
# or
yarn build
```

### "jq not installed"

Install jq for better JSON handling:
```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt-get install jq

# Windows
choco install jq
```

Or add the postbuild script manually to package.json.

### Reports not generated

Check permissions:
```bash
ls -la .bundle-analysis/
```

Ensure the directory is writable.

### Auto-fix not working

Set environment variable:
```bash
export BUNDLE_AUTO_FIX=true
bash ~/.claude/skills/frontend/bundle-reflection.sh run .
```

## Advanced Usage

### Custom Analysis Dir

Edit `bundle-reflection.js`:
```javascript
const CONFIG = {
  analysisDir: path.join(process.cwd(), 'custom-analysis-dir'),
  // ...
};
```

### Custom Threshold Per Project

Add to package.json:
```json
{
  "scripts": {
    "postbuild": "BUNDLE_THRESHOLD=15 bash $HOME/.claude/skills/frontend/bundle-reflection.sh run ."
  }
}
```

### Programmatic Usage

```javascript
const { execSync } = require('child_process');

// Run reflection
execSync('node ~/.claude/skills/frontend/bundle-reflection.js', {
  cwd: '/path/to/project',
  env: {
    ...process.env,
    BUNDLE_THRESHOLD: '12',
    BUNDLE_AUTO_FIX: 'false',
  },
});
```

## Metrics & Goals

### Target Improvements

| Metric | Baseline | 3 Months | 6 Months |
|--------|----------|----------|----------|
| Total Bundle | 850KB | 700KB (-17%) | 600KB (-29%) |
| Main JS | 520KB | 410KB (-21%) | 350KB (-33%) |
| CSS | 120KB | 60KB (-50%) | 50KB (-58%) |
| Lighthouse Score | 75 | 85 | 90+ |

### Expected Savings

**Quick Wins (Week 1)**:
- Replace moment → day.js: -280KB
- Add lazy loading: -150KB (30% of routes)
- PurgeCSS: -60KB (50% of unused styles)
- **Total**: -490KB (58% reduction)

**Long-term (6 months)**:
- Code splitting all routes: -30-40%
- Tree-shaking optimization: -20-30%
- Image optimization: -15-25%
- **Total**: 10-20% cumulative reduction

## Related Documentation

- [Frontend Skill Guide](./SKILL.md)
- [Performance Budget](./references/performance-budget.md)
- [Security Library](../lib/security.sh)

## License

Part of Claude Skills - Frontend Development

---

**Bundle Reflection Pattern v1.0**
*Automated bundle optimization through continuous monitoring*
