# Bundle Reflection Pattern - Integration Guide

Complete guide to integrating bundle reflection into your frontend projects with security, CI/CD, and team workflows.

## Table of Contents

1. [Quick Integration](#quick-integration)
2. [Build Tool Integration](#build-tool-integration)
3. [CI/CD Integration](#cicd-integration)
4. [Team Workflow](#team-workflow)
5. [Security Considerations](#security-considerations)
6. [Monitoring & Alerts](#monitoring--alerts)

## Quick Integration

### Step 1: Install Build Hook

```bash
cd /path/to/your/project
bash ~/.claude/skills/frontend/bundle-reflection.sh install . vite
```

This automatically adds to your `package.json`:
```json
{
  "scripts": {
    "postbuild": "bash $HOME/.claude/skills/frontend/bundle-reflection.sh run ."
  }
}
```

### Step 2: Run Your First Analysis

```bash
npm run build
```

The reflection will run automatically after build completes.

### Step 3: Review Results

```bash
# View latest analysis
bash ~/.claude/skills/frontend/bundle-reflection.sh report .

# View history
bash ~/.claude/skills/frontend/bundle-reflection.sh history .
```

## Build Tool Integration

### Vite

**Automatic (recommended):**
```bash
bash ~/.claude/skills/frontend/bundle-reflection.sh install . vite
```

**Manual package.json configuration:**
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "postbuild": "bash $HOME/.claude/skills/frontend/bundle-reflection.sh run .",
    "build:analyze": "BUNDLE_THRESHOLD=5 npm run build"
  }
}
```

**Custom vite.config.js with reflection hook:**
```javascript
import { defineConfig } from 'vite';
import { execSync } from 'child_process';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
  plugins: [
    {
      name: 'bundle-reflection',
      closeBundle() {
        // Run reflection after bundle is written
        try {
          execSync(
            'bash $HOME/.claude/skills/frontend/bundle-reflection.sh run .',
            { stdio: 'inherit' }
          );
        } catch (err) {
          console.warn('Bundle reflection failed:', err.message);
        }
      },
    },
  ],
});
```

### Webpack

**package.json:**
```json
{
  "scripts": {
    "build": "webpack --mode production",
    "postbuild": "bash $HOME/.claude/skills/frontend/bundle-reflection.sh run ."
  }
}
```

**webpack.config.js with plugin:**
```javascript
const { execSync } = require('child_process');

class BundleReflectionPlugin {
  apply(compiler) {
    compiler.hooks.done.tap('BundleReflectionPlugin', (stats) => {
      if (!stats.hasErrors()) {
        try {
          execSync(
            'bash $HOME/.claude/skills/frontend/bundle-reflection.sh run .',
            { stdio: 'inherit' }
          );
        } catch (err) {
          console.warn('Bundle reflection failed:', err.message);
        }
      }
    });
  }
}

module.exports = {
  // ... your webpack config
  plugins: [
    new BundleReflectionPlugin(),
  ],
};
```

### Rollup

**package.json:**
```json
{
  "scripts": {
    "build": "rollup -c",
    "postbuild": "bash $HOME/.claude/skills/frontend/bundle-reflection.sh run ."
  }
}
```

**rollup.config.js:**
```javascript
import { execSync } from 'child_process';

export default {
  input: 'src/main.js',
  output: {
    dir: 'dist',
    format: 'es',
  },
  plugins: [
    {
      name: 'bundle-reflection',
      closeBundle() {
        try {
          execSync(
            'bash $HOME/.claude/skills/frontend/bundle-reflection.sh run .',
            { stdio: 'inherit' }
          );
        } catch (err) {
          console.warn('Bundle reflection failed:', err.message);
        }
      },
    },
  ],
};
```

### Parcel

**package.json:**
```json
{
  "scripts": {
    "build": "parcel build src/index.html",
    "postbuild": "bash $HOME/.claude/skills/frontend/bundle-reflection.sh run ."
  }
}
```

## CI/CD Integration

### GitHub Actions

**Complete workflow with PR comments:**

```yaml
# .github/workflows/bundle-analysis.yml
name: Bundle Analysis

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  analyze:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v3
        with:
          fetch-depth: 0  # Get full history for trend analysis

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install bundle reflection tools
        run: |
          mkdir -p ~/.claude/skills/frontend
          mkdir -p ~/.claude/skills/lib
          # Copy reflection scripts from repo
          cp .claude/skills/frontend/* ~/.claude/skills/frontend/
          cp .claude/skills/lib/security.sh ~/.claude/skills/lib/

      - name: Build project
        run: npm run build

      - name: Run bundle reflection
        id: reflection
        run: |
          bash ~/.claude/skills/frontend/bundle-reflection.sh run . > reflection_output.txt 2>&1 || true
          cat reflection_output.txt
        env:
          BUNDLE_THRESHOLD: 10
          BUNDLE_AUTO_FIX: false

      - name: Upload analysis artifacts
        uses: actions/upload-artifact@v3
        with:
          name: bundle-analysis
          path: |
            .bundle-history.json
            .bundle-analysis/
            reflection_output.txt

      - name: Parse reflection results
        id: parse
        run: |
          # Extract key metrics from latest report
          LATEST_REPORT=$(ls -t .bundle-analysis/report-*.json | head -n1)
          TOTAL_SIZE=$(jq -r '.summary.totalSize' "$LATEST_REPORT")
          PERCENT_CHANGE=$(jq -r '.summary.percentageChange // "N/A"' "$LATEST_REPORT")
          ISSUE_COUNT=$(jq -r '.issues | length' "$LATEST_REPORT")

          # Set outputs
          echo "total_size=$TOTAL_SIZE" >> $GITHUB_OUTPUT
          echo "percent_change=$PERCENT_CHANGE" >> $GITHUB_OUTPUT
          echo "issue_count=$ISSUE_COUNT" >> $GITHUB_OUTPUT

      - name: Comment PR with results
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');

            // Read latest report
            const reports = fs.readdirSync('.bundle-analysis')
              .filter(f => f.startsWith('report-'))
              .sort()
              .reverse();

            const report = JSON.parse(
              fs.readFileSync(`.bundle-analysis/${reports[0]}`, 'utf8')
            );

            // Format size
            function formatBytes(bytes) {
              if (bytes === 0) return '0 Bytes';
              const k = 1024;
              const sizes = ['Bytes', 'KB', 'MB', 'GB'];
              const i = Math.floor(Math.log(bytes) / Math.log(k));
              return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
            }

            // Build comment
            let comment = `## 📦 Bundle Size Analysis\n\n`;
            comment += `**Total Size**: ${formatBytes(report.summary.totalSize)}\n`;

            if (report.summary.percentageChange !== undefined) {
              const sign = report.summary.percentageChange > 0 ? '+' : '';
              const emoji = report.summary.percentageChange > 10 ? '🔴' :
                            report.summary.percentageChange > 5 ? '⚠️' : '✅';
              comment += `**Change**: ${emoji} ${sign}${report.summary.percentageChange}% (${formatBytes(report.summary.delta)})\n`;
            }

            comment += `\n### 📊 Details\n\n`;
            comment += `- Total bundles: ${report.summary.totalBundles}\n`;
            comment += `- Issues found: ${report.issues.length}\n`;
            comment += `- Recommendations: ${report.recommendations.length}\n`;

            if (report.issues.length > 0) {
              comment += `\n### 🚨 Issues\n\n`;
              report.issues.forEach(issue => {
                comment += `- **${issue.severity === 'critical' ? '🔴' : '⚠️'} ${issue.file}**: ${issue.message}\n`;
              });
            }

            if (report.recommendations.length > 0) {
              comment += `\n### 💡 Top Recommendations\n\n`;
              const topRecs = report.recommendations.slice(0, 3);
              topRecs.forEach(rec => {
                comment += `- **${rec.issue}**: ${rec.fix}\n`;
                comment += `  - Estimated savings: ${rec.estimatedSavings}\n`;
              });

              if (report.recommendations.length > 3) {
                comment += `\n_...and ${report.recommendations.length - 3} more recommendations_\n`;
              }
            }

            comment += `\n<details>\n<summary>View detailed report</summary>\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n\n</details>\n`;

            // Post comment
            await github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });

      - name: Fail if critical issues
        if: steps.parse.outputs.issue_count > 0
        run: |
          echo "::warning::${{ steps.parse.outputs.issue_count }} bundle size issue(s) detected"
          # Uncomment to fail the build on critical issues:
          # exit 1
```

### GitLab CI

```yaml
# .gitlab-ci.yml
stages:
  - build
  - analyze

build:
  stage: build
  script:
    - npm ci
    - npm run build
  artifacts:
    paths:
      - dist/
      - .bundle-history.json
      - .bundle-analysis/
    expire_in: 1 week

bundle_analysis:
  stage: analyze
  dependencies:
    - build
  script:
    - bash ~/.claude/skills/frontend/bundle-reflection.sh run .
  artifacts:
    reports:
      junit: .bundle-analysis/report-latest.json
  allow_failure: true
```

### Jenkins

```groovy
// Jenkinsfile
pipeline {
  agent any

  stages {
    stage('Build') {
      steps {
        sh 'npm ci'
        sh 'npm run build'
      }
    }

    stage('Bundle Analysis') {
      steps {
        sh '''
          export BUNDLE_THRESHOLD=10
          export BUNDLE_AUTO_FIX=false
          bash ~/.claude/skills/frontend/bundle-reflection.sh run .
        '''
      }
    }

    stage('Archive Results') {
      steps {
        archiveArtifacts artifacts: '.bundle-analysis/**', fingerprint: true
        archiveArtifacts artifacts: '.bundle-history.json', fingerprint: true
      }
    }
  }

  post {
    always {
      script {
        def report = readJSON file: '.bundle-analysis/report-latest.json'
        def totalSize = report.summary.totalSize
        def changePercent = report.summary.percentageChange ?: 'N/A'

        echo "Bundle size: ${totalSize} bytes (${changePercent}% change)"

        if (report.issues.size() > 0) {
          currentBuild.result = 'UNSTABLE'
          echo "WARNING: ${report.issues.size()} bundle size issues detected"
        }
      }
    }
  }
}
```

## Team Workflow

### 1. Development Workflow

**Developer pre-commit checks:**
```bash
# .git/hooks/pre-commit
#!/bin/bash

# Run build with bundle analysis
npm run build

# Check for critical issues
if grep -q "critical" .bundle-analysis/report-*.json 2>/dev/null; then
  echo "⚠️  Critical bundle size issues detected!"
  echo "Review .bundle-analysis/report-latest.json"
  echo ""
  echo "Continue with commit? (y/n)"
  read -r response
  if [[ ! "$response" =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi
```

**Pre-push validation:**
```bash
# .git/hooks/pre-push
#!/bin/bash

BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [[ "$BRANCH" == "main" || "$BRANCH" == "master" ]]; then
  npm run build
  bash ~/.claude/skills/frontend/bundle-reflection.sh run .

  ISSUE_COUNT=$(jq '.issues | length' .bundle-analysis/report-*.json 2>/dev/null | tail -1)

  if [[ "$ISSUE_COUNT" -gt 0 ]]; then
    echo "❌ Cannot push to $BRANCH with bundle size issues"
    exit 1
  fi
fi
```

### 2. Code Review Guidelines

**Bundle size checklist for reviewers:**

```markdown
## Bundle Size Review

- [ ] Bundle size change is within acceptable threshold (<10%)
- [ ] New dependencies are justified and minimal
- [ ] Code splitting is implemented where appropriate
- [ ] Tree-shaking is not broken by changes
- [ ] CSS is optimized (no unused styles)
- [ ] Reflection report reviewed and understood
- [ ] Recommendations addressed or documented as accepted debt

**Bundle Analysis:**
[Paste reflection output or link to CI artifact]

**Decision:**
- ✅ Approve (no significant size impact)
- ⚠️ Approve with technical debt (document in ticket)
- ❌ Reject (optimize before merge)
```

### 3. Metrics Dashboard

**Track trends with custom dashboard:**

```javascript
// scripts/generate-dashboard.js
const fs = require('fs');
const path = require('path');

const history = JSON.parse(
  fs.readFileSync('.bundle-history.json', 'utf8')
);

// Generate HTML dashboard
const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Bundle Size Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
  <h1>Bundle Size Trend</h1>
  <canvas id="sizeChart"></canvas>

  <script>
    const data = ${JSON.stringify(history.builds.map(b => ({
      timestamp: b.timestamp,
      size: b.totalSize,
      issues: b.issues,
    })))};

    new Chart(document.getElementById('sizeChart'), {
      type: 'line',
      data: {
        labels: data.map(d => d.timestamp.split('T')[0]),
        datasets: [{
          label: 'Total Size (bytes)',
          data: data.map(d => d.size),
          borderColor: 'rgb(75, 192, 192)',
        }]
      }
    });
  </script>
</body>
</html>
`;

fs.writeFileSync('bundle-dashboard.html', html);
console.log('Dashboard generated: bundle-dashboard.html');
```

**Add to package.json:**
```json
{
  "scripts": {
    "dashboard": "node scripts/generate-dashboard.js && open bundle-dashboard.html"
  }
}
```

## Security Considerations

### 1. Path Validation

All file paths are validated using the shared security library:

```bash
# bundle-reflection.sh uses security.sh
source ~/.claude/skills/lib/security.sh

VALIDATED_PATH=$(validate_path "$USER_INPUT" "$(pwd)")
if [[ $? -ne 0 ]]; then
  echo "Invalid path"
  exit 1
fi
```

### 2. Command Whitelisting

Only approved commands are executed:
- `node` (for reflection script)
- `jq` (for JSON parsing)
- File operations within project directory only

### 3. Environment Variable Security

Never commit sensitive data:

```bash
# .gitignore
.bundle-history.json
.bundle-analysis/
reflection_output.txt

# Environment variables in CI only
# BUNDLE_THRESHOLD - safe to expose
# BUNDLE_AUTO_FIX - safe to expose
```

### 4. CI/CD Secrets

Store API keys securely:

```yaml
# GitHub Actions
- name: Upload to monitoring service
  env:
    MONITORING_API_KEY: ${{ secrets.MONITORING_API_KEY }}
  run: |
    curl -X POST https://monitoring.example.com/bundles \
      -H "Authorization: Bearer $MONITORING_API_KEY" \
      -d @.bundle-analysis/report-latest.json
```

## Monitoring & Alerts

### 1. Slack Notifications

```bash
# scripts/notify-slack.sh
#!/bin/bash

WEBHOOK_URL="$SLACK_WEBHOOK_URL"
REPORT=$(cat .bundle-analysis/report-latest.json)

TOTAL_SIZE=$(echo "$REPORT" | jq -r '.summary.totalSize')
CHANGE_PERCENT=$(echo "$REPORT" | jq -r '.summary.percentageChange // "N/A"')
ISSUE_COUNT=$(echo "$REPORT" | jq -r '.issues | length')

if [[ "$ISSUE_COUNT" -gt 0 ]]; then
  COLOR="danger"
  EMOJI=":warning:"
else
  COLOR="good"
  EMOJI=":white_check_mark:"
fi

curl -X POST "$WEBHOOK_URL" \
  -H 'Content-Type: application/json' \
  -d "{
    \"attachments\": [{
      \"color\": \"$COLOR\",
      \"title\": \"${EMOJI} Bundle Size Report\",
      \"fields\": [
        {\"title\": \"Total Size\", \"value\": \"$(($TOTAL_SIZE / 1024)) KB\", \"short\": true},
        {\"title\": \"Change\", \"value\": \"${CHANGE_PERCENT}%\", \"short\": true},
        {\"title\": \"Issues\", \"value\": \"$ISSUE_COUNT\", \"short\": true}
      ]
    }]
  }"
```

**Add to CI:**
```yaml
- name: Notify Slack
  if: always()
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
  run: bash scripts/notify-slack.sh
```

### 2. Datadog/New Relic Integration

```javascript
// scripts/send-metrics.js
const https = require('https');
const fs = require('fs');

const report = JSON.parse(
  fs.readFileSync('.bundle-analysis/report-latest.json', 'utf8')
);

const metrics = [
  {
    metric: 'bundle.total_size',
    points: [[Date.now() / 1000, report.summary.totalSize]],
    type: 'gauge',
  },
  {
    metric: 'bundle.issue_count',
    points: [[Date.now() / 1000, report.issues.length]],
    type: 'gauge',
  },
];

const options = {
  hostname: 'api.datadoghq.com',
  path: '/api/v1/series',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'DD-API-KEY': process.env.DATADOG_API_KEY,
  },
};

const req = https.request(options);
req.write(JSON.stringify({ series: metrics }));
req.end();
```

### 3. Email Reports

```bash
# scripts/email-report.sh
#!/bin/bash

REPORT_FILE=".bundle-analysis/report-latest.json"
RECIPIENTS="team@example.com"

SUBJECT="Bundle Size Report - $(date '+%Y-%m-%d')"
BODY=$(jq -r '
  "Total Size: \(.summary.totalSize) bytes\n" +
  "Change: \(.summary.percentageChange // "N/A")%\n" +
  "Issues: \(.issues | length)\n\n" +
  "See attached for full report."
' "$REPORT_FILE")

echo "$BODY" | mail -s "$SUBJECT" -A "$REPORT_FILE" "$RECIPIENTS"
```

## Troubleshooting Integration

### Issue: Reflection not running after build

**Check:**
1. Verify postbuild script exists in package.json
2. Ensure reflection scripts are executable (`chmod +x`)
3. Check npm logs: `npm run build --verbose`

**Fix:**
```bash
npm pkg set scripts.postbuild="bash $HOME/.claude/skills/frontend/bundle-reflection.sh run ."
```

### Issue: CI failing with "command not found"

**Cause:** Reflection scripts not in CI environment

**Fix:** Add setup step to CI workflow
```yaml
- name: Setup reflection tools
  run: |
    mkdir -p ~/.claude/skills/{frontend,lib}
    cp -r .claude/skills/* ~/.claude/skills/
```

### Issue: False positives in threshold detection

**Cause:** Threshold too strict for dev builds

**Fix:** Use different thresholds per environment
```json
{
  "scripts": {
    "build:dev": "BUNDLE_THRESHOLD=20 npm run build",
    "build:prod": "BUNDLE_THRESHOLD=5 npm run build"
  }
}
```

## Next Steps

1. **Install** reflection in your project
2. **Configure** thresholds for your use case
3. **Integrate** with CI/CD pipeline
4. **Monitor** trends over time
5. **Act** on recommendations
6. **Share** results with team

---

**Bundle Reflection Pattern v1.0**
*Enterprise-ready bundle optimization monitoring*
