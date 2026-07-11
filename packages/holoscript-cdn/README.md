# @holoscript/cdn

Browser CDN distribution for HoloScript. Embed spatial scenes in web pages using the `<holo-scene>` web component.

## Usage

```bash
pnpm install
pnpm build
```

Include the built bundle in a web page to register the `<holo-scene>` custom element.

## Development

```bash
pnpm dev      # Build with watch mode (tsup)
pnpm test     # Run tests (vitest)
```

## Package boundary & release posture

`@holoscript/cdn` targets **external, public** web developers and **agent framework** integrators embedding a HoloScript scene into an existing web page via a single `<script>` tag and the `<holo-scene>` custom element. The package boundary is a browser bundle plus a config surface (`HoloCDNConfig`, `defaultCDNConfig`): it **does not ship** scene content, a build pipeline, or hosting — you bring your own `.hs`/`.hsplus` scene file (via the `src` attribute) or inline markup, and can point it at your own CDN base URL by overriding `cdnBase` instead of the bundled `https://cdn.holoscript.net` default; nothing here assumes founder-local config.

**Known limitations (v0-preview):** target auto-detection (`detectOptimalTarget`) degrades to `threejs` when WebXR/WebGPU are unavailable, and only the `threejs` fallback is currently implemented end-to-end — `babylon`, `unity`, `godot`, `visionos`, and `android-xr` targets are declared in the type surface but not all are production-validated yet. Run `pnpm test` to validate the custom element registration and target-detection logic before embedding in a production page.

## License

MIT
