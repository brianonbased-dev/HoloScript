# Bundle Reflection Pattern - Usage Examples

Complete examples showing how to use the bundle reflection pattern in real-world scenarios.

## Example 1: Basic Setup with Vite Project

```bash
# Navigate to your Vite project
cd /path/to/my-vite-app

# Install build hook
bash ~/.claude/skills/frontend/bundle-reflection.sh install . vite

# Build your project (reflection runs automatically)
npm run build
```

**Expected Output:**
```
🔍 Analyzing bundle sizes...

✓ Found 5 bundles (847.32 KB)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 BUNDLE SIZE REFLECTION ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 Summary:
   Total bundles: 5
   Total size: 847.32 KB

✅ Analysis complete!
```

## Example 2: Detecting Size Increase

**Scenario:** You added a new dependency (moment.js) and rebuilt.

```bash
# After adding moment.js and rebuilding
npm run build
```

**Output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 BUNDLE SIZE REFLECTION ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 Summary:
   Total bundles: 5
   Total size: 1.12 MB
   Previous size: 847.32 KB
   Change: +273.68 KB (+32.31%)

🚨 Issues Detected:

   🔴 assets/main-abc123.js
      Bundle size increased by 35.87% (+273.68 KB)
      763.42 KB → 1.04 MB

💡 Optimization Recommendations:

   📂 DEPENDENCY:
      • Detected moment (~290KB)
        Fix: Replace with date-fns or day.js (~10KB)
        Savings: ~290KB

   📂 TREE-SHAKING:
      • Bundle exceeds 500KB
        Fix: Ensure tree-shaking is enabled (use ES modules)
        Savings: ~20-40%

📄 Detailed report saved to: .bundle-analysis/report-2026-02-27T10-30-45.json
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ 1 critical issue(s) found. Build may need optimization.
```

**Action:** Replace moment with day.js

```bash
npm uninstall moment
npm install dayjs

# Update imports in your code
# Before:
# import moment from 'moment';
# const date = moment().format('YYYY-MM-DD');

# After:
# import dayjs from 'dayjs';
# const date = dayjs().format('YYYY-MM-DD');

# Rebuild
npm run build
```

**New Output:**
```
📦 Summary:
   Total bundles: 5
   Total size: 857.32 KB  (-273.68 KB)
   Previous size: 1.12 MB
   Change: -273.68 KB (-24.43%)

✅ Analysis complete!
```

## Example 3: Implementing Code Splitting

**Scenario:** Reflection detects no lazy loading in your React app.

```bash
npm run build
```

**Output shows:**
```
💡 Optimization Recommendations:

   📂 CODE-SPLITTING:
      • No lazy loading detected (45 static imports)
        Fix: Implement route-based code splitting with React.lazy()
        Savings: ~30-50% of current bundle size
```

**Action:** Implement lazy loading for routes

```jsx
// Before: src/App.jsx
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/profile" element={<Profile />} />
      </Routes>
    </Router>
  );
}

// After: src/App.jsx with lazy loading
import { lazy, Suspense } from 'react';

const Home = lazy(() => import('./pages/Home'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Profile = lazy(() => import('./pages/Profile'));

function App() {
  return (
    <Router>
      <Suspense fallback={<div>Loading...</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/profile" element={<Profile />} />
        </Routes>
      </Suspense>
    </Router>
  );
}
```

**Rebuild and verify:**
```bash
npm run build
```

**Expected improvement:**
```
📦 Summary:
   Total bundles: 8  (now split into chunks)
   Total size: 594.82 KB  (-252.5 KB from previous)
   Previous size: 847.32 KB
   Change: -252.5 KB (-29.81%)

✅ Analysis complete!
```

## Example 4: CSS Optimization

**Scenario:** Large CSS bundle detected.

```bash
npm run build
```

**Output:**
```
💡 Optimization Recommendations:

   📂 CSS-OPTIMIZATION:
      • Large CSS bundle detected (147.23 KB)
        Fix: Use PurgeCSS to remove unused styles
        Savings: ~50-70% of CSS bundle
```

**Action:** Install and configure PurgeCSS

```bash
npm install -D @fullhuman/postcss-purgecss
```

```javascript
// postcss.config.js
module.exports = {
  plugins: [
    require('@fullhuman/postcss-purgecss')({
      content: ['./src/**/*.{js,jsx,ts,tsx,vue}'],
      defaultExtractor: content => content.match(/[\w-/:]+(?<!:)/g) || [],
      safelist: ['html', 'body'], // Keep these classes
    }),
  ],
};
```

**Rebuild:**
```bash
npm run build
```

**Expected result:**
```
📦 Summary:
   Total size: 697.12 KB
   Previous size: 847.32 KB
   Change: -150.2 KB (-17.73%)

   CSS bundle reduced: 147.23 KB → 51.45 KB (-65%)

✅ Analysis complete!
```

## Example 5: Auto-Fix Mode

**Enable auto-fix for automatic configuration updates:**

```bash
export BUNDLE_AUTO_FIX=true
npm run build
```

**Output:**
```
💡 Optimization Recommendations:
   [recommendations listed]

🔧 Applying auto-fixes...

✓ Applying: Enable tree-shaking optimizations
  Config changes: vite.config.js
  {
    "build": {
      "rollupOptions": {
        "output": {
          "manualChunks": {
            "vendor": ["react", "react-dom"]
          }
        }
      }
    }
  }

✓ Applying: Add CSS purging
  Steps to apply:
    - npm install -D @fullhuman/postcss-purgecss
    - Add to postcss.config.js

⏭️  Skipping manual fix: Replace heavy dependency: moment
    (Requires user review)
```

## Example 6: Viewing History

```bash
# View bundle size history
bash ~/.claude/skills/frontend/bundle-reflection.sh history .
```

**Output:**
```
📊 Bundle Size History

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 2026-02-27T08:15:30.000Z
   Total Size: 847MB
   Issues: 0
   Recommendations: 0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 2026-02-27T10:30:45.000Z
   Total Size: 1120MB
   Issues: 1
   Recommendations: 2

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 2026-02-27T14:22:10.000Z
   Total Size: 857MB
   Issues: 0
   Recommendations: 0
```

## Example 7: Detailed Report Analysis

```bash
# View latest detailed report
bash ~/.claude/skills/frontend/bundle-reflection.sh report .
```

**Output:** (JSON formatted report)
```json
{
  "timestamp": "2026-02-27T10:30:45.123Z",
  "summary": {
    "totalBundles": 5,
    "totalSize": 1175552,
    "previousSize": 867328,
    "delta": 308224,
    "percentageChange": "35.53"
  },
  "changes": [
    {
      "file": "assets/main-abc123.js",
      "type": "increased",
      "previousSize": 780288,
      "currentSize": 1088512,
      "delta": 308224,
      "percentage": 39.51
    }
  ],
  "issues": [
    {
      "severity": "critical",
      "file": "assets/main-abc123.js",
      "message": "Bundle size increased by 39.51% (301.00 KB)",
      "previousSize": 780288,
      "currentSize": 1088512,
      "delta": 308224,
      "percentage": 39.51
    }
  ],
  "recommendations": [
    {
      "category": "dependency",
      "severity": "high",
      "issue": "Detected moment (~290KB)",
      "fix": "Replace with date-fns or day.js (~10KB)",
      "estimatedSavings": "~290KB"
    }
  ]
}
```

## Example 8: CI/CD Integration

```yaml
# .github/workflows/build-and-analyze.yml
name: Build and Analyze Bundles

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v2

      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Bundle Reflection Analysis
        run: bash ~/.claude/skills/frontend/bundle-reflection.sh run .
        env:
          BUNDLE_THRESHOLD: 10
          BUNDLE_AUTO_FIX: false

      - name: Upload Analysis Report
        uses: actions/upload-artifact@v2
        with:
          name: bundle-analysis
          path: .bundle-analysis/

      - name: Comment PR with Bundle Size
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v5
        with:
          script: |
            const fs = require('fs');
            const report = JSON.parse(
              fs.readFileSync('.bundle-analysis/report-latest.json', 'utf8')
            );

            const comment = `## 📦 Bundle Size Report

            **Total Size**: ${(report.summary.totalSize / 1024).toFixed(2)} KB
            **Change**: ${report.summary.percentageChange > 0 ? '+' : ''}${report.summary.percentageChange}%

            ${report.issues.length > 0 ? '### 🚨 Issues\n' + report.issues.map(i => `- ${i.message}`).join('\n') : ''}
            ${report.recommendations.length > 0 ? '\n### 💡 Recommendations\n' + report.recommendations.map(r => `- ${r.issue}: ${r.fix}`).join('\n') : ''}
            `;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });
```

## Example 9: Custom Threshold per Environment

```json
// package.json
{
  "scripts": {
    "build:dev": "BUNDLE_THRESHOLD=20 vite build --mode development",
    "build:staging": "BUNDLE_THRESHOLD=15 vite build --mode staging",
    "build:prod": "BUNDLE_THRESHOLD=10 vite build --mode production",
    "postbuild:dev": "bash $HOME/.claude/skills/frontend/bundle-reflection.sh run .",
    "postbuild:staging": "bash $HOME/.claude/skills/frontend/bundle-reflection.sh run .",
    "postbuild:prod": "BUNDLE_AUTO_FIX=false bash $HOME/.claude/skills/frontend/bundle-reflection.sh run ."
  }
}
```

**Usage:**
```bash
# Development (lenient threshold)
npm run build:dev

# Staging (moderate threshold)
npm run build:staging

# Production (strict threshold, no auto-fix)
npm run build:prod
```

## Example 10: Tracking Progress Over 6 Months

```bash
# Month 0 (Baseline)
npm run build
# Total: 847.32 KB

# Month 1: Replace moment → day.js
npm uninstall moment && npm install dayjs
npm run build
# Total: 574.82 KB (-32.2%)

# Month 2: Implement lazy loading
# [Add React.lazy to routes]
npm run build
# Total: 427.15 KB (-49.6%)

# Month 3: PurgeCSS + tree-shaking optimization
# [Configure PurgeCSS]
npm run build
# Total: 362.41 KB (-57.2%)

# Month 6: Image optimization + final polish
# [Optimize images, remove unused code]
npm run build
# Total: 318.92 KB (-62.4%)

# View progress
bash ~/.claude/skills/frontend/bundle-reflection.sh history .
```

**Target Achievement:**
- Goal: 10-20% reduction → EXCEEDED (62.4% reduction)
- From 847 KB → 319 KB
- Lighthouse score: 75 → 94

## Summary

The bundle reflection pattern provides:

1. **Automated Detection**: Catches size increases immediately
2. **Root Cause Analysis**: Identifies why bundles grew
3. **Actionable Recommendations**: Specific fixes with examples
4. **Progress Tracking**: History and reports for trend analysis
5. **CI/CD Integration**: Automated checks in deployment pipeline

**Best Practices:**
- Install build hook for automatic monitoring
- Review recommendations after each build
- Track progress over time with history command
- Use auto-fix for config changes, manual review for code changes
- Set appropriate thresholds per environment
- Integrate with CI/CD for team-wide visibility

---

**Bundle Reflection Pattern v1.0**
*Continuous bundle optimization through reflection and analysis*
