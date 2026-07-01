# No-App WebXR Publish

Studio publish returns a browser-native WebXR launch receipt for each `.holo`
world. The canonical path is:

1. Author or import the world in Studio.
2. `POST /api/publish` with `code`, `title`, optional `metadata`, and optional
   `customDomain`.
3. Open the returned `/w/:id` URL. Studio rewrites it to `/shared/:id`, where the
   HoloScript source is rendered by the shared WebXR viewer.
4. Use `qrCode.dataUrl` or `share.url` to open the same world on a phone,
   desktop browser, or headset browser without an app install.
5. Use `customDomain.receiptId` when a requested domain is ready for DNS
   verification.

The response includes `webxrUrl`, `qrCode`, `share`, `custody`, and `receipts`.
`receipts.compileReceiptId`, `receipts.hostReceiptId`, and
`receipts.shareReceiptId` form the triad proof for the published preview.

## 8th Wall Migration

8th Wall's hosted platform retired on February 28, 2026. Existing published
experiences remain live through February 28, 2027. Migration users should move
the source world into HoloScript and publish through Studio's no-app WebXR lane
rather than adopting the 8th Wall runtime.

HoloGate is an umbrella term in docs. The concrete publish proof is HoloKey
custody, Studio umbrella routing, local QR/share metadata, optional custom-domain
mapping receipts, and the compile-host-share triad.
