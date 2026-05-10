import { describe, expect, it } from 'vitest';
import { buildGitHubEvidenceUrl } from '../ConversionRecommendations';

describe('ConversionRecommendations evidence links', () => {
  it('builds GitHub blob links for HTTPS clone URLs', () => {
    expect(
      buildGitHubEvidenceUrl('https://github.com/acme/spatial-app.git', 'main', 'src/app/page.tsx')
    ).toBe('https://github.com/acme/spatial-app/blob/main/src/app/page.tsx');
  });

  it('builds GitHub blob links for SSH clone URLs and encoded branches', () => {
    expect(
      buildGitHubEvidenceUrl(
        'git@github.com:acme/spatial-app.git',
        'feature/conversion scan',
        'src/scene canvas.tsx'
      )
    ).toBe(
      'https://github.com/acme/spatial-app/blob/feature%2Fconversion%20scan/src/scene%20canvas.tsx'
    );
  });

  it('returns null for non-GitHub evidence sources', () => {
    expect(
      buildGitHubEvidenceUrl('https://example.test/repo.git', 'main', 'src/app.ts')
    ).toBeNull();
  });
});
