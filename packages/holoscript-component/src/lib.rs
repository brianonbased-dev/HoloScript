//! HoloScript WASM Component
//!
//! This crate implements the HoloScript parser, validator, compiler, type checker,
//! generator, spatial engine, and formatter as a WASM Component following the
//! WASI Preview 3 Component Model.
//!
//! The component can be instantiated from any language with Component Model
//! support: JavaScript (jco), Python (wasmtime), Rust (wasmtime), Go (wazero).
//!
//! Architecture:
//! - Engine-core interfaces: parser, validator, type-checker, compiler, generator,
//!   spatial-engine, formatter (all in this component)
//! - Platform-plugin interfaces: unity, godot, etc. (separate components)
//!
//! Binary size target: <2MB for the full holoscript-runtime world.
//! Current measured size: ~459KB (parser + validator + compiler + generator).

mod compiler;
mod lexer;
mod parser;
mod traits;

use wit_bindgen::generate;

// Generate bindings from WIT interface
generate!({
    world: "holoscript-runtime",
    path: "wit",
});

// Import common types and interfaces from generated bindings
use exports::holoscript::core::{
    compiler::{Guest as CompilerGuest},
    generator::{Guest as GeneratorGuest},
    parser::{Guest as ParserGuest},
    validator::{Guest as ValidatorGuest},
    type_checker::{Guest as TypeCheckerGuest},
    spatial_engine::{Guest as SpatialEngineGuest},
    formatter::{Guest as FormatterGuest},
};

use holoscript::core::types::{
    CompileResult, CompileTarget, CompositionNode, Diagnostic,
    ParseResult, Severity, TraitDef, TraitFull, TypeInfo,
    ValidationResult,
};

// =============================================================================
// COMPONENT STRUCT
// =============================================================================

struct HoloscriptComponent;

// =============================================================================
// PARSER IMPLEMENTATION
// =============================================================================

impl ParserGuest for HoloscriptComponent {
    fn parse(source: String) -> ParseResult {
        match parser::parse_holoscript(&source) {
            Ok(composition) => ParseResult::Ok(composition),
            Err(errors) => ParseResult::Err(errors),
        }
    }

    fn parse_header(source: String) -> Result<String, String> {
        parser::parse_header(&source)
    }

    fn parse_to_json(source: String) -> Result<String, String> {
        match parser::parse_holoscript(&source) {
            Ok(composition) => {
                // Serialize the composition node to JSON for IPC
                serde_json::to_string(&composition_to_json(&composition))
                    .map_err(|e| format!("JSON serialization error: {}", e))
            }
            Err(errors) => {
                let err_json = errors
                    .iter()
                    .map(|d| format!("{}:{}: {}",
                        d.span.as_ref().map_or(0, |s| s.start.line),
                        d.span.as_ref().map_or(0, |s| s.start.column),
                        d.message))
                    .collect::<Vec<_>>()
                    .join("\n");
                Err(err_json)
            }
        }
    }

    fn parse_incremental(
        _previous_ast_json: String,
        _edit_offset: u32,
        _edit_length: u32,
        _new_text: String,
    ) -> Result<String, String> {
        // TODO: Implement incremental parsing for LSP integration
        // For now, fall back to full re-parse
        Err("Incremental parsing not yet implemented; use full parse".to_string())
    }
}

// =============================================================================
// VALIDATOR IMPLEMENTATION
// =============================================================================

impl ValidatorGuest for HoloscriptComponent {
    fn validate(source: String) -> ValidationResult {
        let (valid, diagnostics) = parser::validate_holoscript(&source);
        ValidationResult { valid, diagnostics }
    }

    fn validate_with_options(
        source: String,
        _max_severity: String,
        check_traits: bool,
        _check_types: bool,
    ) -> ValidationResult {
        let (mut valid, mut diagnostics) = parser::validate_holoscript(&source);

        if check_traits {
            // Additional trait validation pass
            if let Ok(composition) = parser::parse_holoscript(&source) {
                for obj in &composition.objects {
                    for trait_name in &obj.traits {
                        if !traits::trait_exists(trait_name) {
                            diagnostics.push(Diagnostic {
                                severity: Severity::Warning,
                                message: format!("Unknown trait: @{}", trait_name),
                                span: obj.span.clone(),
                                code: Some("W001".to_string()),
                            });
                        }
                    }
                }
                if !diagnostics.is_empty() {
                    valid = false;
                }
            }
        }

        ValidationResult { valid, diagnostics }
    }

    fn trait_exists(name: String) -> bool {
        traits::trait_exists(&name)
    }

    fn get_trait(name: String) -> Option<TraitDef> {
        traits::get_trait(&name)
    }

    fn get_trait_full(name: String) -> Option<TraitFull> {
        traits::get_trait_full(&name)
    }

    fn list_traits() -> Vec<TraitDef> {
        traits::list_all_traits()
    }

    fn list_traits_by_category(category: String) -> Vec<TraitDef> {
        traits::list_traits_by_category(&category)
    }

    fn list_categories() -> Vec<String> {
        traits::list_categories()
    }
}

// =============================================================================
// TYPE CHECKER IMPLEMENTATION
// =============================================================================

impl TypeCheckerGuest for HoloscriptComponent {
    fn check(source: String) -> Vec<Diagnostic> {
        // Basic type checking: parse and validate, return diagnostics
        let (_, diagnostics) = parser::validate_holoscript(&source);
        diagnostics
    }

    fn infer_type_at(_source: String, _offset: u32) -> Option<TypeInfo> {
        // TODO: Implement positional type inference
        None
    }

    fn completions_at(_source: String, _offset: u32) -> Vec<String> {
        // TODO: Implement completion candidates based on context
        // For now, return trait names as basic completions
        traits::list_all_traits()
            .into_iter()
            .map(|t| format!("@{}", t.name))
            .collect()
    }
}

// =============================================================================
// COMPILER IMPLEMENTATION
// =============================================================================

impl CompilerGuest for HoloscriptComponent {
    fn compile(source: String, target: CompileTarget) -> CompileResult {
        match parser::parse_holoscript(&source) {
            Ok(ast) => Self::compile_ast(ast, target),
            Err(errors) => CompileResult::Error(errors),
        }
    }

    fn compile_ast(ast: CompositionNode, target: CompileTarget) -> CompileResult {
        match target {
            CompileTarget::Threejs => match compiler::compile_threejs(&ast) {
                Ok(code) => CompileResult::Text(code),
                Err(e) => CompileResult::Error(vec![e]),
            },
            CompileTarget::Babylonjs => match compiler::compile_babylonjs(&ast) {
                Ok(code) => CompileResult::Text(code),
                Err(e) => CompileResult::Error(vec![e]),
            },
            CompileTarget::AframeHtml => match compiler::compile_aframe(&ast) {
                Ok(code) => CompileResult::Text(code),
                Err(e) => CompileResult::Error(vec![e]),
            },
            CompileTarget::GltfJson => match compiler::compile_gltf_json(&ast) {
                Ok(json) => CompileResult::Text(json),
                Err(e) => CompileResult::Error(vec![e]),
            },
            CompileTarget::GlbBinary => match compiler::compile_glb(&ast) {
                Ok(bytes) => CompileResult::Binary(bytes),
                Err(e) => CompileResult::Error(vec![e]),
            },
            CompileTarget::JsonAst => {
                match serde_json::to_string_pretty(&composition_to_json(&ast)) {
                    Ok(json) => CompileResult::Text(json),
                    Err(e) => CompileResult::Error(vec![Diagnostic {
                        severity: Severity::Error,
                        message: format!("JSON serialization error: {}", e),
                        span: None,
                        code: Some("E200".to_string()),
                    }]),
                }
            }
        }
    }

    fn list_targets() -> Vec<CompileTarget> {
        vec![
            CompileTarget::Threejs,
            CompileTarget::Babylonjs,
            CompileTarget::AframeHtml,
            CompileTarget::GltfJson,
            CompileTarget::GlbBinary,
            CompileTarget::JsonAst,
        ]
    }

    fn version() -> String {
        env!("CARGO_PKG_VERSION").to_string()
    }
}

// =============================================================================
// GENERATOR IMPLEMENTATION
// =============================================================================

impl GeneratorGuest for HoloscriptComponent {
    fn generate_object(description: String) -> Result<String, String> {
        let traits = traits::suggest_traits_for_description(&description);
        let trait_str = traits
            .iter()
            .map(|t| format!("@{}", t.name))
            .collect::<Vec<_>>()
            .join(" ");

        let object_name = extract_object_name(&description);
        let geometry = infer_geometry(&description);

        Ok(format!(
            r#"object "{}" {} {{
  geometry: "{}"
  position: [0, 0, 0]
}}"#,
            object_name, trait_str, geometry
        ))
    }

    fn generate_scene(description: String) -> Result<String, String> {
        let scene_name = extract_scene_name(&description);
        let objects = generate_objects_from_description(&description);

        Ok(format!(
            r#"composition "{}" {{
  environment {{
    skybox: "gradient"
    ambient_light: 0.4
  }}

{}
}}"#,
            scene_name, objects
        ))
    }

    fn suggest_traits(description: String) -> Vec<TraitDef> {
        traits::suggest_traits_for_description(&description)
    }

    fn from_json(json: String) -> Result<String, String> {
        // Parse JSON scene graph and convert to HoloScript syntax
        let value: serde_json::Value = serde_json::from_str(&json)
            .map_err(|e| format!("Invalid JSON: {}", e))?;

        let name = value.get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("ImportedScene");

        let mut holo = format!("composition \"{}\" {{\n", name);

        if let Some(objects) = value.get("objects").and_then(|v| v.as_array()) {
            for obj in objects {
                let obj_name = obj.get("name").and_then(|v| v.as_str()).unwrap_or("Object");
                let geometry = obj.get("geometry").and_then(|v| v.as_str()).unwrap_or("cube");
                holo.push_str(&format!("  object \"{}\" {{\n    geometry: \"{}\"\n  }}\n", obj_name, geometry));
            }
        }

        holo.push_str("}\n");
        Ok(holo)
    }
}

// =============================================================================
// SPATIAL ENGINE IMPLEMENTATION
// =============================================================================

impl SpatialEngineGuest for HoloscriptComponent {
    fn perlin_noise_two_d(x: f64, y: f64, seed: i32) -> f64 {
        let ix = x.floor() as i32;
        let iy = y.floor() as i32;
        let fx = x - ix as f64;
        let fy = y - iy as f64;
        let sx = fx * fx * (3.0 - 2.0 * fx);
        let sy = fy * fy * (3.0 - 2.0 * fy);

        let n00 = hash2d(ix, iy, seed);
        let n10 = hash2d(ix + 1, iy, seed);
        let n01 = hash2d(ix, iy + 1, seed);
        let n11 = hash2d(ix + 1, iy + 1, seed);

        let nx0 = n00 * (1.0 - sx) + n10 * sx;
        let nx1 = n01 * (1.0 - sx) + n11 * sx;
        nx0 * (1.0 - sy) + nx1 * sy
    }

    fn perlin_noise_three_d(x: f64, y: f64, z: f64, seed: i32) -> f64 {
        let xy = Self::perlin_noise_two_d(x, y, seed);
        let yz = Self::perlin_noise_two_d(y, z, seed.wrapping_add(1));
        let xz = Self::perlin_noise_two_d(x, z, seed.wrapping_add(2));
        (xy + yz + xz) / 3.0
    }

    fn fbm_noise(x: f64, y: f64, octaves: i32, lacunarity: f64, persistence: f64, seed: i32) -> f64 {
        let mut total = 0.0;
        let mut amplitude = 1.0;
        let mut frequency = 1.0;
        let mut max_amplitude = 0.0;

        for i in 0..octaves {
            total += Self::perlin_noise_two_d(x * frequency, y * frequency, seed + i) * amplitude;
            max_amplitude += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }

        if max_amplitude > 0.0 { total / max_amplitude } else { 0.0 }
    }

    fn sphere_sphere_test(
        ax: f64, ay: f64, az: f64, ar: f64,
        bx: f64, by: f64, bz: f64, br: f64,
    ) -> bool {
        let dx = bx - ax;
        let dy = by - ay;
        let dz = bz - az;
        let dist_sq = dx * dx + dy * dy + dz * dz;
        let rad_sum = ar + br;
        dist_sq <= rad_sum * rad_sum
    }

    fn aabb_overlap(
        amin_x: f64, amin_y: f64, amin_z: f64,
        amax_x: f64, amax_y: f64, amax_z: f64,
        bmin_x: f64, bmin_y: f64, bmin_z: f64,
        bmax_x: f64, bmax_y: f64, bmax_z: f64,
    ) -> bool {
        amin_x <= bmax_x && amax_x >= bmin_x
            && amin_y <= bmax_y && amax_y >= bmin_y
            && amin_z <= bmax_z && amax_z >= bmin_z
    }

    fn ray_aabb_test(
        ray_ox: f64, ray_oy: f64, ray_oz: f64,
        ray_dx: f64, ray_dy: f64, ray_dz: f64,
        min_x: f64, min_y: f64, min_z: f64,
        max_x: f64, max_y: f64, max_z: f64,
    ) -> f64 {
        let inv_dx = if ray_dx.abs() > 1e-10 { 1.0 / ray_dx } else { f64::INFINITY };
        let inv_dy = if ray_dy.abs() > 1e-10 { 1.0 / ray_dy } else { f64::INFINITY };
        let inv_dz = if ray_dz.abs() > 1e-10 { 1.0 / ray_dz } else { f64::INFINITY };

        let t1 = (min_x - ray_ox) * inv_dx;
        let t2 = (max_x - ray_ox) * inv_dx;
        let t3 = (min_y - ray_oy) * inv_dy;
        let t4 = (max_y - ray_oy) * inv_dy;
        let t5 = (min_z - ray_oz) * inv_dz;
        let t6 = (max_z - ray_oz) * inv_dz;

        let tmin = t1.min(t2).max(t3.min(t4)).max(t5.min(t6));
        let tmax = t1.max(t2).min(t3.max(t4)).min(t5.max(t6));

        if tmax < 0.0 || tmin > tmax { -1.0 } else { tmin.max(0.0) }
    }

    fn frustum_cull_aabb(
        _frustum_json: String,
        _min_x: f64, _min_y: f64, _min_z: f64,
        _max_x: f64, _max_y: f64, _max_z: f64,
    ) -> bool {
        // TODO: Parse frustum planes from JSON and test AABB
        // For now, always visible
        true
    }
}

// =============================================================================
// FORMATTER IMPLEMENTATION
// =============================================================================

impl FormatterGuest for HoloscriptComponent {
    fn format(source: String) -> Result<String, String> {
        // Basic formatter: normalize indentation and whitespace
        let mut result = String::new();
        let mut indent = 0usize;

        for line in source.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                result.push('\n');
                continue;
            }

            // Decrease indent before closing brace
            if trimmed.starts_with('}') && indent > 0 {
                indent -= 1;
            }

            // Apply indentation
            for _ in 0..indent {
                result.push_str("  ");
            }
            result.push_str(trimmed);
            result.push('\n');

            // Increase indent after opening brace
            if trimmed.ends_with('{') {
                indent += 1;
            }
        }

        Ok(result)
    }

    fn format_with_options(source: String, _options_json: String) -> Result<String, String> {
        // TODO: Parse options and apply custom formatting rules
        Self::format(source)
    }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

fn hash2d(ix: i32, iy: i32, seed: i32) -> f64 {
    let mut h = ix.wrapping_mul(374761393)
        .wrapping_add(iy.wrapping_mul(668265263))
        .wrapping_add(seed.wrapping_mul(1013904223));
    h = (h >> 13 ^ h).wrapping_mul(1274126177);
    h = h >> 16 ^ h;
    (h & 0x7fff_ffff) as f64 / 0x7fff_ffff as f64 * 2.0 - 1.0
}

fn composition_to_json(comp: &CompositionNode) -> serde_json::Value {
    serde_json::json!({
        "name": comp.name,
        "objects": comp.objects.len(),
        "templates": comp.templates.len(),
        "lights": comp.lights.len(),
        "cameras": comp.cameras.len(),
        "animations": comp.animations.len(),
        "has_environment": comp.environment.is_some(),
    })
}

fn extract_object_name(description: &str) -> String {
    let words: Vec<&str> = description.split_whitespace().collect();
    for word in &words {
        let lower = word.to_lowercase();
        if !["a", "an", "the", "create", "make", "add", "with", "that", "can"]
            .contains(&lower.as_str())
        {
            return word.to_string();
        }
    }
    "Object".to_string()
}

fn extract_scene_name(description: &str) -> String {
    let lower = description.to_lowercase();
    if lower.contains("space") { "SpaceScene".to_string() }
    else if lower.contains("forest") { "ForestScene".to_string() }
    else if lower.contains("city") { "CityScene".to_string() }
    else if lower.contains("ocean") { "OceanScene".to_string() }
    else { "MyScene".to_string() }
}

fn infer_geometry(description: &str) -> &'static str {
    let lower = description.to_lowercase();
    if lower.contains("ball") || lower.contains("sphere") || lower.contains("orb") { "sphere" }
    else if lower.contains("box") || lower.contains("cube") || lower.contains("crate") { "cube" }
    else if lower.contains("cylinder") || lower.contains("pillar") || lower.contains("column") { "cylinder" }
    else if lower.contains("cone") || lower.contains("pyramid") { "cone" }
    else if lower.contains("ring") || lower.contains("torus") || lower.contains("donut") { "torus" }
    else if lower.contains("floor") || lower.contains("ground") || lower.contains("plane") { "plane" }
    else if lower.contains("capsule") || lower.contains("pill") { "capsule" }
    else { "cube" }
}

fn generate_objects_from_description(description: &str) -> String {
    let lower = description.to_lowercase();
    let mut objects = Vec::new();

    if lower.contains("floor") || lower.contains("ground") {
        objects.push(r##"  object "Ground" @collidable {
    geometry: "plane"
    scale: [10, 1, 10]
    position: [0, 0, 0]
    color: "#444444"
  }"##.to_string());
    }

    if lower.contains("player") {
        objects.push(r##"  object "Player" @physics @collidable {
    geometry: "capsule"
    position: [0, 1, 0]
    color: "#00ff00"
  }"##.to_string());
    }

    if lower.contains("light") || lower.contains("sun") {
        objects.push(r##"  directional_light "Sun" {
    position: [5, 10, 5]
    color: "#ffffff"
    intensity: 1.0
  }"##.to_string());
    }

    if lower.contains("camera") {
        objects.push(r#"  perspective_camera "MainCamera" {
    position: [0, 3, -10]
    fov: 60
  }"#.to_string());
    }

    if objects.is_empty() {
        objects.push(r##"  object "MainObject" @grabbable {
    geometry: "cube"
    position: [0, 1, 0]
    color: "#3399ff"
  }"##.to_string());
    }

    objects.join("\n\n")
}

// Export the component
export!(HoloscriptComponent);
