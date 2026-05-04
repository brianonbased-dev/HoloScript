// @vitest-environment jsdom

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import * as qrcode from 'qrcode';
import { QRCodeImage } from './QRCodeImage';

vi.mock('qrcode', () => ({
  toDataURL: vi.fn(),
}));

describe('QRCodeImage', () => {
  const toDataURL = vi.mocked(qrcode.toDataURL);

  beforeEach(() => {
    toDataURL.mockReset();
    toDataURL.mockResolvedValue('data:image/png;base64,qr-code');
  });

  it('renders a locally generated data URL image', async () => {
    render(<QRCodeImage url="https://studio.test/scan/mobile" size={128} alt="Mobile scan QR" />);

    expect(screen.getByTestId('local-qr-code-loading')).toBeInTheDocument();

    const image = await screen.findByRole('img', { name: 'Mobile scan QR' });
    expect(image).toHaveAttribute('src', 'data:image/png;base64,qr-code');
    expect(image).toHaveAttribute('width', '128');
    expect(toDataURL).toHaveBeenCalledWith(
      'https://studio.test/scan/mobile',
      expect.objectContaining({
        width: 128,
        margin: 2,
        errorCorrectionLevel: 'M',
      }),
    );
  });

  it('falls back to the raw link when QR generation fails', async () => {
    toDataURL.mockRejectedValueOnce(new Error('QR generation failed'));

    render(<QRCodeImage url="https://studio.test/remote/session" />);

    const link = await screen.findByRole('link', { name: 'Open link' });
    expect(link).toHaveAttribute('href', 'https://studio.test/remote/session');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
