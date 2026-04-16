# Bundle Reflection Pattern - Quick Reference Card

## Installation

```bash
cd /path/to/your/project
bash ~/.claude/skills/frontend/bundle-reflection.sh install . vite
```

## Commands

| Command | Description |
|---------|-------------|
| `bash ~/.claude/skills/frontend/bundle-reflection.sh run .` | Run analysis on current project |
| `bash ~/.claude/skills/frontend/bundle-reflection.sh install . vite` | Install build hook |
| `bash ~/.claude/skills/frontend/bundle-reflection.sh history .` | View bundle size history |
| `bash ~/.claude/skills/frontend/bundle-reflection.sh report .` | View latest detailed report |
| `bash ~/.claude/skills/frontend/bundle-reflection.sh help` | Show usage help |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BUNDLE_THRESHOLD` | 10 | Size increase threshold (%) |
| `BUNDLE_AUTO_FIX` | false | Auto-apply fixes |

## Usage Examples

### Basic Usage
```bash
# Automatic (after installation)
npm run build

# Manual
bash ~/.claude/skills/frontend/bundle-reflection.sh run .
```

### Custom Threshold
```bash
# Stricter threshold (5%)
BUNDLE_THRESHOLD=5 npm run build

# More lenient (20%)
BUNDLE_THRESHOLD=20 npm run build
```

### Auto-Fix Mode
```bash
# Enable auto-fix for config changes
BUNDLE_AUTO_FIX=true npm run build
```

### Per-Environment Configuration
```json
{
  "scripts": {
    "build:dev": "BUNDLE_THRESHOLD=20 vite build",
    "build:staging": "BUNDLE_THRESHOLD=15 vite build",
    "build:prod": "BUNDLE_THRESHOLD=10 vite build"
  }
}
```

## File Locations

| File | Location | Purpose |
|------|----------|---------|
| Analysis script | `~/.claude/skills/frontend/bundle-reflection.js` | Core engine |
| Wrapper script | `~/.claude/skills/frontend/bundle-reflection.sh` | CLI interface |
| History file | `.bundle-history.json` (project root) | Last 30 builds |
| Reports | `.bundle-analysis/` (project root) | Detailed reports |
| Logs | `~/.claude/skills/frontend/logs/` | Execution logs |

## Generated Files (per project)

```
your-project/
├── .bundle-history.json          # Last 30 builds
├── .bundle-analysis/              # Detailed reports
│   ├── report-2026-02-27T10-30-45.json
│   └── ...
└── package.json                  # Updated with postbuild
```

## CI/CD Integration

### GitHub Actions (minimal)
```yaml
- name: Bundle Analysis
  run: bash ~/.claude/skills/frontend/bundle-reflection.sh run .
  env:
    BUNDLE_THRESHOLD: 10
```

### package.json (automatic)
```json
{
  "scripts": {
    "postbuild": "bash $HOME/.claude/skills/frontend/bundle-reflection.sh run ."
  }
}
```

## Output Examples

### No Issues
```
✓ Found 5 bundles (847.32 KB)

📦 Summary:
   Total size: 847.32 KB

✅ Analysis complete!
```

### Issues Detected
```
🚨 Issues Detected:

   🔴 assets/main-abc123.js
      Bundle size increased by 23.45% (+98.23 KB)

💡 Optimization Recommendations:

   📂 DEPENDENCY:
      • Detected moment (~290KB)
        Fix: Replace with date-fns or day.js
        Savings: ~290KB
```

## Common Recommendations

| Issue | Fix | Savings |
|-------|-----|---------|
| Detected moment | Replace with day.js | ~280KB |
| Detected lodash | Use lodash-es with tree-shaking | ~60KB |
| No lazy loading | Implement React.lazy() | 30-50% |
| Bundle >500KB | Enable tree-shaking | 20-40% |
| Large CSS (>100KB) | Use PurgeCSS | 50-70% |

## Quick Fixes

### Replace moment with day.js
```bash
npm uninstall moment
npm install dayjs

# Update imports
sed -i 's/import moment from "moment"/import dayjs from "dayjs"/g' src/**/*.js
```

### Implement Lazy Loading (React)
```javascript
// Before
import Component from './Component';

// After
const Component = React.lazy(() => import('./Component'));

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Component />
    </Suspense>
  );
}
```

### Add PurgeCSS
```bash
npm install -D @fullhuman/postcss-purgecss

# postcss.config.js
module.exports = {
  plugins: [
    require('@fullhuman/postcss-purgecss')({
      content: ['./src/**/*.{js,jsx,ts,tsx}'],
    })
  ]
}
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "No dist directory found" | Run build first: `npm run build` |
| Reflection not running | Check postbuild script in package.json |
| False positives | Adjust `BUNDLE_THRESHOLD` |
| Auto-fix not working | Set `BUNDLE_AUTO_FIX=true` |
| CI failing | Copy scripts to CI environment |

## Performance Impact

- Analysis time: ~1-3 seconds
- Build time increase: <1%
- Storage: <1MB for 6 months of data

## Security

✅ Path validation (prevents traversal)
✅ Command whitelisting
✅ Argument sanitization
✅ Secure logging
✅ No external network access

## Expected Results

| Timeframe | Reduction | Actions |
|-----------|-----------|---------|
| Week 1 | 30-50% | Replace moment, add lazy loading, PurgeCSS |
| Month 1 | 40-60% | Full code splitting, tree-shaking |
| Month 6 | 10-20% | Continuous incremental improvements |

## Documentation

| Document | Description |
|----------|-------------|
| `README-bundle-reflection.md` | Complete user guide |
| `INTEGRATION.md` | CI/CD and team workflows |
| `examples/bundle-reflection-example.md` | 10 usage examples |
| `BUNDLE-REFLECTION-SUMMARY.md` | Implementation overview |
| `QUICK-REFERENCE.md` | This card |

## Support

For detailed information, see:
- User guide: `~/.claude/skills/frontend/README-bundle-reflection.md`
- Integration guide: `~/.claude/skills/frontend/INTEGRATION.md`
- Examples: `~/.claude/skills/frontend/examples/bundle-reflection-example.md`

## Testing

```bash
# Run test suite
bash ~/.claude/skills/frontend/tests/test-bundle-reflection.sh
```

---

**Bundle Reflection Pattern v1.0**
*Quick Reference Card*
