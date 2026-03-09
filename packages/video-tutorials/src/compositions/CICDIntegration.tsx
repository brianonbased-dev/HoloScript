import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { TitleCard } from '../components/TitleCard';
import { CodeStep } from '../components/CodeStep';

const STEPS = [
  {
    title: 'GitHub Actions Overview',
    description: 'The HoloScript CI pipeline is triggered on every push and pull request to main.',
    lines: [
      { content: '# .github/workflows/ci.yml', dim: true },
      { content: 'name: HoloScript CI', highlight: true },
      { content: '' },
      { content: 'on:', highlight: true },
      { content: '  push:', annotation: 'runs on every push' },
      { content: '    branches: [main, development]' },
      { content: '  pull_request:' },
      { content: '    branches: [main]' },
      { content: '' },
      { content: 'jobs:', highlight: true },
      { content: '  build-and-test:' },
      { content: '    runs-on: ubuntu-latest', annotation: 'Linux runner' },
      { content: '    strategy:' },
      { content: '      matrix:' },
      {
        content: "        node-version: ['18.x', '20.x', '22.x']",
        type: 'added' as const,
        annotation: '3 Node versions',
      },
    ],
  },
  {
    title: 'Build Pipeline',
    description:
      'Install dependencies with pnpm, build the core package, then run full type-checking.',
    lines: [
      { content: '    steps:', highlight: true },
      { content: '      - uses: actions/checkout@v4' },
      { content: '' },
      { content: '      - uses: pnpm/action-setup@v3', highlight: true },
      { content: "        with: { version: '9' }" },
      { content: '' },
      { content: '      - name: Install dependencies', highlight: true },
      {
        content: '        run: pnpm install --frozen-lockfile',
        annotation: 'reproducible installs',
      },
      { content: '' },
      { content: '      - name: Build core package', highlight: true },
      { content: '        run: pnpm --filter @holoscript/core build', type: 'added' as const },
      { content: '' },
      { content: '      - name: Type check all packages', highlight: true },
      {
        content: '        run: pnpm -r exec tsc --noEmit',
        type: 'added' as const,
        annotation: 'zero-error policy',
      },
    ],
  },
  {
    title: 'E2E Export Tests',
    description:
      'Run the ExportTargets end-to-end test suite to verify all 15 compiler targets produce valid output.',
    lines: [
      { content: '      - name: Run unit tests', highlight: true },
      { content: '        run: pnpm -r test --reporter=verbose' },
      { content: '' },
      {
        content: '      - name: Run E2E export tests',
        highlight: true,
        annotation: 'all 15 compilers',
      },
      { content: '        run: |' },
      { content: '          pnpm --filter @holoscript/core vitest run \\' },
      {
        content: '            src/compiler/__tests__/ExportTargets.e2e.test.ts',
        type: 'added' as const,
      },
      { content: '' },
      { content: '      - name: Upload coverage', highlight: true },
      { content: '        uses: codecov/codecov-action@v4', type: 'added' as const },
      { content: '        with:', type: 'added' as const },
      {
        content: '          token: ${{ secrets.CODECOV_TOKEN }}',
        type: 'added' as const,
        annotation: 'secret',
      },
      { content: '          fail_ci_if_error: true', type: 'added' as const },
      { content: '          threshold: 80', type: 'added' as const, annotation: '≥80% required' },
    ],
  },
  {
    title: 'Release Automation',
    description:
      'semantic-release reads conventional commits, bumps the version, and publishes to npm automatically.',
    lines: [
      { content: '# .github/workflows/release.yml', dim: true },
      { content: '      - name: Release', highlight: true },
      {
        content: '        uses: cycjimmy/semantic-release-action@v4',
        annotation: 'semantic-release',
      },
      { content: '        env:' },
      { content: '          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}', type: 'added' as const },
      {
        content: '          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}',
        type: 'added' as const,
        annotation: 'publish token',
      },
      { content: '' },
      { content: '# .releaserc.json — configuration', dim: true },
      { content: '{', highlight: true },
      { content: '  "branches": ["main"],' },
      { content: '  "plugins": [' },
      { content: '    "@semantic-release/commit-analyzer",' },
      { content: '    "@semantic-release/release-notes-generator",' },
      { content: '    "@semantic-release/npm",' },
      {
        content: '    "@semantic-release/github"',
        type: 'added' as const,
        annotation: 'creates GitHub release',
      },
      { content: '  ]' },
      { content: '}' },
    ],
  },
  {
    title: 'Codecov Integration',
    description:
      'Coverage reports are uploaded to Codecov on every CI run, enforcing the 80% threshold gate.',
    lines: [
      { content: '# codecov.yml — threshold configuration', dim: true },
      { content: 'coverage:', highlight: true },
      { content: '  status:', highlight: true },
      { content: '    project:', annotation: 'overall project coverage' },
      { content: '      default:' },
      { content: '        target: 80%', type: 'added' as const, highlight: true },
      { content: '        threshold: 2%    # allow 2% drop', type: 'added' as const },
      { content: '    patch:', annotation: 'new code in PR' },
      { content: '      default:' },
      { content: '        target: 90%', type: 'added' as const },
      { content: '' },
      { content: '# README badge — auto-updates from Codecov', dim: true },
      {
        content: '[![Coverage](https://codecov.io/gh/holoscript/holoscript/graph/badge.svg)]',
        highlight: true,
        annotation: 'badge',
      },
      { content: '(https://codecov.io/gh/holoscript/holoscript)' },
    ],
  },
];

export const CICDIntegration: React.FC = () => {
  const { fps } = useVideoConfig();
  const titleDuration = 3 * fps;
  const stepDuration = 5 * fps;

  return (
    <AbsoluteFill style={{ background: '#0f1117' }}>
      <Sequence from={0} durationInFrames={titleDuration}>
        <TitleCard
          title="CI/CD Integration"
          subtitle="Automate compilation, testing, and release of HoloScript projects in GitHub Actions"
          tag="Advanced"
        />
      </Sequence>

      {STEPS.map((step, i) => (
        <Sequence key={i} from={titleDuration + i * stepDuration} durationInFrames={stepDuration}>
          <CodeStep
            stepNumber={i + 1}
            title={step.title}
            description={step.description}
            lines={step.lines}
            language="yaml"
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
