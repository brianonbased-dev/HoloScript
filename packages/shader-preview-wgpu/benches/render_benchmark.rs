//! Criterion benchmark: wgpu render-to-texture at 720p.
//!
//! Run with:
//!   cargo bench -p shader-preview-wgpu
//!
//! Or for the built-in benchmark:
//!   cargo test -p shader-preview-wgpu -- --ignored test_benchmark_720p_30fps --nocapture

use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use shader_preview_wgpu::{ShaderPreviewPipeline, RenderConfig};

fn bench_render_frame(c: &mut Criterion) {
    let mut group = c.benchmark_group("shader_preview_render");

    // Test at multiple resolutions
    let resolutions: Vec<(u32, u32, &str)> = vec![
        (640, 360, "360p"),
        (1280, 720, "720p"),
        (1920, 1080, "1080p"),
    ];

    for (width, height, label) in &resolutions {
        let config = RenderConfig {
            width: *width,
            height: *height,
            target_fps: 30,
            encode_base64: false, // Raw PNG for fair render-only comparison
            soft_budget: true,
            ..Default::default()
        };

        let pipeline = ShaderPreviewPipeline::new(config);
        if pipeline.is_err() {
            eprintln!("Skipping {} benchmark: no GPU adapter available", label);
            continue;
        }
        let mut pipeline = pipeline.unwrap();

        group.bench_with_input(
            BenchmarkId::new("render_only", label),
            label,
            |b, _| {
                b.iter(|| {
                    let result = pipeline.render_frame_simple();
                    black_box(result).ok();
                });
            },
        );
    }

    group.finish();

    // Benchmark with base64 encoding (full pipeline)
    let mut group = c.benchmark_group("shader_preview_full_pipeline");

    for (width, height, label) in &resolutions {
        let config = RenderConfig {
            width: *width,
            height: *height,
            target_fps: 30,
            encode_base64: true,
            soft_budget: true,
            ..Default::default()
        };

        let pipeline = ShaderPreviewPipeline::new(config);
        if pipeline.is_err() {
            continue;
        }
        let mut pipeline = pipeline.unwrap();

        group.bench_with_input(
            BenchmarkId::new("render_and_encode", label),
            label,
            |b, _| {
                b.iter(|| {
                    let result = pipeline.render_frame_simple();
                    black_box(result).ok();
                });
            },
        );
    }

    group.finish();
}

fn bench_pipeline_init(c: &mut Criterion) {
    c.bench_function("pipeline_init_720p", |b| {
        b.iter(|| {
            let config = RenderConfig::default();
            let pipeline = ShaderPreviewPipeline::new(config);
            black_box(pipeline).ok();
        });
    });
}

criterion_group!(benches, bench_render_frame, bench_pipeline_init);
criterion_main!(benches);
