/** Headless Chromium page: depth-parallax quilt renderer (dimensions match depth map). */

export function buildWorkerRenderHtml(
  sourceUrl: string,
  mediaType: 'image' | 'gif' | 'video',
  internalWidth: number,
  internalHeight: number,
): string {
  const escapedSource = JSON.stringify(sourceUrl);
  const escapedMediaType = JSON.stringify(mediaType);
  const w = String(internalWidth);
  const h = String(internalHeight);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html, body { margin: 0; background: black; overflow: hidden; }
    canvas { display: block; }
  </style>
</head>
<body>
  <canvas id="render"></canvas>
  <script>
    window.__HOLOGRAM_READY = false;
    window.__HOLOGRAM_RENDER_ERROR = null;
  </script>
  <script>
    (async () => {
      const sourceUrl = ${escapedSource};
      const mediaType = ${escapedMediaType};
      const internalWidth = ${w};
      const internalHeight = ${h};
      const canvas = document.getElementById('render');
      const ctx = canvas.getContext('2d');

      canvas.width = internalWidth;
      canvas.height = internalHeight;

      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = internalWidth;
      sourceCanvas.height = internalHeight;
      const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });

      const depthCanvas = document.createElement('canvas');
      depthCanvas.width = internalWidth;
      depthCanvas.height = internalHeight;
      const depthCtx = depthCanvas.getContext('2d', { willReadFrequently: true });

      async function loadMedia() {
        if (mediaType === 'video') {
          const video = document.createElement('video');
          video.src = sourceUrl;
          video.crossOrigin = 'anonymous';
          video.muted = true;
          video.loop = true;
          video.playsInline = true;
          video.autoplay = true;
          await new Promise((resolve, reject) => {
            video.onloadeddata = () => resolve();
            video.onerror = () => reject(new Error('Failed to load video source'));
          });
          try { await video.play(); } catch {}
          sourceCtx.drawImage(video, 0, 0, internalWidth, internalHeight);
          return { kind: 'video', element: video };
        }

        const img = new Image();
        img.src = sourceUrl;
        img.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Failed to load image source'));
        });
        sourceCtx.drawImage(img, 0, 0, internalWidth, internalHeight);
        return { kind: 'image', element: img };
      }

      function computeDepthMap() {
        const injected = window.__INJECTED_DEPTH_MAP;
        if (injected && injected.length === internalWidth * internalHeight) {
          const depthImage = depthCtx.createImageData(internalWidth, internalHeight);
          for (let i = 0; i < injected.length; i++) {
            const value = Math.max(0, Math.min(255, Math.round(injected[i] * 255)));
            depthImage.data[i * 4] = value;
            depthImage.data[i * 4 + 1] = value;
            depthImage.data[i * 4 + 2] = value;
            depthImage.data[i * 4 + 3] = 255;
          }
          depthCtx.putImageData(depthImage, 0, 0);
          return injected;
        }

        const imageData = sourceCtx.getImageData(0, 0, internalWidth, internalHeight);
        const depthImage = depthCtx.createImageData(internalWidth, internalHeight);
        const depthMap = new Float32Array(internalWidth * internalHeight);

        for (let i = 0; i < depthMap.length; i++) {
          const px = i * 4;
          const r = imageData.data[px] / 255;
          const g = imageData.data[px + 1] / 255;
          const b = imageData.data[px + 2] / 255;
          const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
          const depth = 1.0 - luminance;
          depthMap[i] = depth;
          const value = Math.max(0, Math.min(255, Math.round(depth * 255)));
          depthImage.data[px] = value;
          depthImage.data[px + 1] = value;
          depthImage.data[px + 2] = value;
          depthImage.data[px + 3] = 255;
        }

        depthCtx.putImageData(depthImage, 0, 0);
        return depthMap;
      }

      function renderWarpedView(depthMap, normalizedOffset, shear = 0) {
        const src = sourceCtx.getImageData(0, 0, internalWidth, internalHeight);
        const dst = ctx.createImageData(internalWidth, internalHeight);
        const maxShift = 28;

        for (let y = 0; y < internalHeight; y++) {
          for (let x = 0; x < internalWidth; x++) {
            const dstIndex = (y * internalWidth + x) * 4;
            const depth = depthMap[y * internalWidth + x];
            const shift = Math.round(normalizedOffset * maxShift * (depth - 0.5) + shear * 8);
            const srcX = Math.max(0, Math.min(internalWidth - 1, x - shift));
            const srcIndex = (y * internalWidth + srcX) * 4;
            dst.data[dstIndex] = src.data[srcIndex];
            dst.data[dstIndex + 1] = src.data[srcIndex + 1];
            dst.data[dstIndex + 2] = src.data[srcIndex + 2];
            dst.data[dstIndex + 3] = src.data[srcIndex + 3];
          }
        }

        return dst;
      }

      try {
        const media = await loadMedia();
        const depthMap = computeDepthMap();

        window.__HOLOGRAM_RT = {
          width: internalWidth,
          height: internalHeight,
          depthBackend: window.__INJECTED_DEPTH_BACKEND ?? 'luminance-proxy',
          mediaKind: media.kind,
          renderViewDataUrl(offset = 0, shear = 0) {
            const imageData = renderWarpedView(depthMap, offset, shear);
            ctx.putImageData(imageData, 0, 0);
            return canvas.toDataURL('image/png');
          },
          renderQuiltDataUrl(tileSpecs, quiltWidth, quiltHeight, tileWidth, tileHeight) {
            const quiltCanvas = document.createElement('canvas');
            quiltCanvas.width = quiltWidth;
            quiltCanvas.height = quiltHeight;
            const quiltCtx = quiltCanvas.getContext('2d');

            for (const tile of tileSpecs) {
              const imageData = renderWarpedView(depthMap, tile.normalizedOffset, tile.viewShear || 0);
              ctx.putImageData(imageData, 0, 0);
              quiltCtx.drawImage(canvas, tile.column * tileWidth, tile.row * tileHeight, tileWidth, tileHeight);
            }

            return quiltCanvas.toDataURL('image/png');
          }
        };

        window.__HOLOGRAM_READY = true;
      } catch (error) {
        window.__HOLOGRAM_RENDER_ERROR = error instanceof Error ? error.message : String(error);
      }
    })();
  </script>
</body>
</html>`;
}
