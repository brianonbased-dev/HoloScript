import type { HologramBundle } from '@holoscript/engine/hologram';

export async function uploadHologramToStudio(
  studioBase: string,
  token: string,
  bundle: HologramBundle,
): Promise<{ hash: string; written?: string[] }> {
  const url = `${studioBase.replace(/\/$/, '')}/api/hologram/upload`;
  const form = new FormData();
  form.set('meta', JSON.stringify(bundle.meta));
  form.set(
    'depth.bin',
    new File([new Uint8Array(bundle.depthBin)], 'depth.bin', { type: 'application/octet-stream' }),
  );
  form.set(
    'normal.bin',
    new File([new Uint8Array(bundle.normalBin)], 'normal.bin', { type: 'application/octet-stream' }),
  );
  if (bundle.quiltPng?.byteLength) {
    form.set('quilt.png', new File([new Uint8Array(bundle.quiltPng)], 'quilt.png', { type: 'image/png' }));
  }
  if (bundle.mvhevcMp4?.byteLength) {
    form.set(
      'mvhevc.mp4',
      new File([new Uint8Array(bundle.mvhevcMp4)], 'mvhevc.mp4', { type: 'video/mp4' }),
    );
  }
  if (bundle.parallaxWebm?.byteLength) {
    form.set(
      'parallax.webm',
      new File([new Uint8Array(bundle.parallaxWebm)], 'parallax.webm', { type: 'video/webm' }),
    );
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Studio upload failed ${res.status}: ${text.slice(0, 500)}`);
  }
  return (await res.json()) as { hash: string; written?: string[] };
}
