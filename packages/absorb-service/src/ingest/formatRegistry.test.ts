import { describe, expect, it } from 'vitest';
import {
  PROFESSIONAL_FORMAT_REGISTRY,
  detectProfessionalFormat,
  listProfessionalFormats,
} from './formatRegistry';

describe('professional format registry', () => {
  it('covers every first-tier adapter family with synthetic fixtures', () => {
    const fixtures = [
      { family: 'foundation', fileName: 'protocol.pdf', expected: 'pdf' },
      { family: 'scientific-medical', fileName: 'observation.fits', expected: 'fits' },
      { family: 'spatial-engineering', fileName: 'implant.stl', expected: 'stl' },
      { family: 'enterprise-security', fileName: 'incident.spdx.json', expected: 'sbom' },
      { family: 'platform-software', fileName: 'agent.ts', expected: 'code-source' },
    ] as const;

    for (const fixture of fixtures) {
      const result = detectProfessionalFormat({ fileName: fixture.fileName });
      expect(result.entry?.family).toBe(fixture.family);
      expect(result.entry?.id).toBe(fixture.expected);
    }
  });

  it('detects canonical medical formats by extension', () => {
    const result = detectProfessionalFormat({ fileName: 'synthetic-study.DCM' });

    expect(result.entry?.id).toBe('dicom');
    expect(result.confidence).toBeGreaterThanOrEqual(0.65);
    expect(result.matchedBy).toContain('extension');
  });

  it('uses MIME type and signature as stronger signals', () => {
    const pdfSignature = new TextEncoder().encode('%PDF-1.7');
    const result = detectProfessionalFormat({
      fileName: 'report.bin',
      mimeType: 'application/pdf; charset=binary',
      signature: pdfSignature,
    });

    expect(result.entry?.id).toBe('pdf');
    expect(result.confidence).toBeGreaterThanOrEqual(0.95);
    expect(result.matchedBy).toEqual(expect.arrayContaining(['mime', 'signature']));
  });

  it('filters registry entries by vertical, status, and priority', () => {
    const healthcareP0 = listProfessionalFormats({
      verticalTag: 'healthcare',
      priority: 'p0',
    });
    const nativeFormats = listProfessionalFormats({ supportStatus: 'native' });

    expect(healthcareP0.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(['dicom', 'fhir-json', 'hl7v2', 'pdf', 'docx'])
    );
    expect(nativeFormats.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(['gltf-glb', 'code-source'])
    );
  });

  it('keeps current codebase absorption represented as native and separate', () => {
    const code = PROFESSIONAL_FORMAT_REGISTRY.find((entry) => entry.id === 'code-source');

    expect(code?.supportStatus).toBe('native');
    expect(code?.notes).toContain('CodebaseScanner');
  });

  it('returns a null entry for unsupported files', () => {
    const result = detectProfessionalFormat({ fileName: 'archive.unknown-professional-format' });

    expect(result.entry).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.matchedBy).toEqual([]);
  });
});
