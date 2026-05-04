'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface QRCodeImageProps {
  url: string;
  size?: number;
  alt?: string;
  className?: string;
}

type QRCodeState =
  | { status: 'loading' }
  | { status: 'ready'; src: string }
  | { status: 'error' };

export function QRCodeImage({
  url,
  size = 180,
  alt = 'QR code',
  className = 'rounded-xl border border-studio-border',
}: QRCodeImageProps) {
  const [state, setState] = useState<QRCodeState>({ status: 'loading' });

  useEffect(() => {
    let isCurrent = true;
    setState({ status: 'loading' });

    import('qrcode')
      .then((qr) =>
        qr.toDataURL(url, {
          width: size,
          margin: 2,
          errorCorrectionLevel: 'M',
          color: {
            dark: '#0f172a',
            light: '#ffffff',
          },
        }),
      )
      .then((src) => {
        if (isCurrent) {
          setState({ status: 'ready', src });
        }
      })
      .catch(() => {
        if (isCurrent) {
          setState({ status: 'error' });
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [size, url]);

  if (state.status === 'ready') {
    return (
      <img
        data-testid="local-qr-code"
        src={state.src}
        alt={alt}
        width={size}
        height={size}
        className={`bg-white ${className}`}
      />
    );
  }

  if (state.status === 'error') {
    return (
      <div
        data-testid="local-qr-code-fallback"
        style={{ width: size, height: size }}
        className={`flex items-center justify-center bg-studio-surface p-3 text-center text-[11px] text-studio-muted ${className}`}
      >
        <a href={url} className="break-all text-studio-accent hover:text-studio-text">
          Open link
        </a>
      </div>
    );
  }

  return (
    <div
      data-testid="local-qr-code-loading"
      style={{ width: size, height: size }}
      className={`flex items-center justify-center bg-studio-surface ${className}`}
    >
      <Loader2 className="h-5 w-5 animate-spin text-studio-muted" aria-label="Generating QR code" />
    </div>
  );
}
