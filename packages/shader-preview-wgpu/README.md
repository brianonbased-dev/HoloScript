# shader-preview-wgpu

Offscreen wgpu render-to-texture pipeline for HoloScript shader preview. Renders shader output to a texture and encodes the result as a PNG/base64 image.

## Usage

```bash
cargo build
```

```rust
use shader_preview_wgpu;
```

## Development

```bash
cargo build
cargo test
cargo bench       # Run render benchmarks (criterion)
```
