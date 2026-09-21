// @vitest-environment jsdom
/**
 * The export button, end to end through the real component.
 *
 * Why this file exists: until 2026-09-21 that button was labelled
 * "Export HIPAA Log", imported the export function, and carried NO onClick. It
 * did nothing when pressed, and nothing in the suite could tell — the scenario
 * tests call the export function directly, never the UI that is supposed to
 * reach it. A button is not wired because a helper beside it is tested.
 *
 * So this renders the actual panel, clicks the actual button, and reads what
 * would have been written to disk.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TherapySessionPanel } from '../TherapySessionPanel';

/** Capture what the click would have downloaded, without touching the disk. */
function captureDownload() {
  const captured: { name: string | null; text: string | null } = { name: null, text: null };
  const blobs = new Map<string, Blob>();
  let n = 0;

  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob) => {
    const url = `blob:test/${n++}`;
    blobs.set(url, blob);
    return url;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = realCreate(tag) as HTMLElement;
    if (tag === 'a') {
      (el as HTMLAnchorElement).click = () => {
        const anchor = el as HTMLAnchorElement;
        captured.name = anchor.download;
        const blob = blobs.get(anchor.href);
        if (blob) {
          // Blob.text() is async; read the payload we stored synchronously.
          captured.text = (blob as Blob & { __text?: string }).__text ?? null;
        }
      };
    }
    return el;
  });

  // Blob in jsdom does not expose its content synchronously, so remember it.
  const RealBlob = globalThis.Blob;
  vi.stubGlobal(
    'Blob',
    class extends RealBlob {
      __text: string;
      constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        this.__text = parts.map(String).join('');
      }
    }
  );

  return captured;
}

describe('TherapySessionPanel — Export Redacted Log', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('is labelled honestly and no longer says HIPAA', () => {
    render(<TherapySessionPanel />);
    expect(screen.getByText(/Export Redacted Log/i)).toBeTruthy();
    expect(screen.queryByText(/HIPAA/i)).toBeNull();
  });

  it('actually exports when clicked, instead of doing nothing', () => {
    const captured = captureDownload();
    render(<TherapySessionPanel />);

    fireEvent.click(screen.getByText(/Export Redacted Log/i));

    // A dead button leaves both of these null. That is the regression.
    expect(captured.name).toBeTruthy();
    expect(captured.text).toBeTruthy();
    expect(captured.name).toMatch(/-redacted\.json$/);
  });

  it('exports a redacted patient identifier, never a readable one', () => {
    const captured = captureDownload();
    render(<TherapySessionPanel />);
    fireEvent.click(screen.getByText(/Export Redacted Log/i));

    const payload = JSON.parse(captured.text as string) as Record<string, unknown>;
    expect(payload).toHaveProperty('patientId');
    // Every letter and digit masked: nothing identifying survives the export.
    expect(String(payload.patientId)).toMatch(/^[^\p{L}\p{N}]*(X[^\p{L}\p{N}]*)+$/u);
    expect(payload).toHaveProperty('sessionId');
  });
});
