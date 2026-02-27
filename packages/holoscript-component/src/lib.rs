//! HoloScript WASM Component
//!
//! This crate implements the HoloScript parser, validator, and compiler
//! as a WASM Component following the WASI Preview 3 Component Model.
//!
//! The component can be instantiated from any language with Component Model
//! support: JavaScript (jco), Python (wasmtime), Rust (wasmtime), Go (wazero).

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
};

use holoscript::core::types::{
    CompileResult, CompileTarget, CompositionNode, ParseResult,
    TraitDef, ValidationResult,
};

// =============================================================================
// PARSER IMPLEMENTATION
// =============================================================================

struct HoloscriptComponent;

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
}

// =============================================================================
// VALIDATOR IMPLEMENTATION
// =============================================================================

impl ValidatorGuest for HoloscriptComponent {
    fn validate(source: String) -> ValidationResult {
        let (valid, diagnostics) = parser::validate_holoscript(&source);
        ValidationResult { valid, diagnostics }
    }

    fn trait_exists(name: String) -> bool {
        traits::trait_exists(&name)
    }

    fn get_trait(name: String) -> Option<TraitDef> {
        traits::get_trait(&name)
    }

    fn list_traits() -> Vec<TraitDef> {
        traits::list_all_traits()
    }

    fn list_traits_by_category(category: String) -> Vec<TraitDef> {
        traits::list_traits_by_category(&category)
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
            CompileTarget::UnityCsharp => match compiler::compile_unity(&ast) {
                Ok(code) => CompileResult::Text(code),
                Err(e) => CompileResult::Error(vec![e]),
            },
            CompileTarget::GodotGdscript => match compiler::compile_godot(&ast) {
                Ok(code) => CompileResult::Text(code),
                Err(e) => CompileResult::Error(vec![e]),
            },
            CompileTarget::AframeHtml => match compiler::compile_aframe(&ast) {
                Ok(code) => CompileResult::Text(code),
                Err(e) => CompileResult::Error(vec![e]),
            },
            CompileTarget::Threejs => match compiler::compile_threejs(&ast) {
                Ok(code) => CompileResult::Text(code),
                Err(e) => CompileResult::Error(vec![e]),
            },
            CompileTarget::Babylonjs => match compiler::compile_babylonjs(&ast) {
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
        }
    }

    fn list_targets() -> Vec<CompileTarget> {
        vec![
            CompileTarget::UnityCsharp,
            CompileTarget::GodotGdscript,
            CompileTarget::AframeHtml,
            CompileTarget::Threejs,
            CompileTarget::Babylonjs,
            CompileTarget::GltfJson,
            CompileTarget::GlbBinary,
        ]
    }
}

// =============================================================================
// GENERATOR IMPLEMENTATION
// =============================================================================

impl GeneratorGuest for HoloscriptComponent {
    fn generate_object(description: String) -> Result<String, String> {
        // Simple template-based generation
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
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

fn extract_object_name(description: &str) -> String {
    // Simple extraction: find first noun-like word
    let words: Vec<&str> = description.split_whitespace().collect();
    for word in &words {
        let lower = word.to_lowercase();
        if ![
            "a", "an", "the", "create", "make", "add", "with", "that", "can",
        ]
        .contains(&lower.as_str())
        {
            return word.to_string();
        }
    }
    "Object".to_string()
}

fn extract_scene_name(description: &str) -> String {
    // Simple extraction
    if description.to_lowercase().contains("space") {
        "SpaceScene".to_string()
    } else if description.to_lowercase().contains("forest") {
        "ForestScene".to_string()
    } else if description.to_lowercase().contains("city") {
        "CityScene".to_string()
    } else if description.to_lowercase().contains("ocean") {
        "OceanScene".to_string()
    } else {
        "MyScene".to_string()
    }
}

fn infer_geometry(description: &str) -> &'static str {
    let lower = description.to_lowercase();
    if lower.contains("ball") || lower.contains("sphere") || lower.contains("orb") {
        "sphere"
    } else if lower.contains("box") || lower.contains("cube") || lower.contains("crate") {
        "cube"
    } else if lower.contains("cylinder") || lower.contains("pillar") || lower.contains("column") {
        "cylinder"
    } else if lower.contains("cone") || lower.contains("pyramid") {
        "cone"
    } else if lower.contains("ring") || lower.contains("torus") || lower.contains("donut") {
        "torus"
    } else if lower.contains("floor") || lower.contains("ground") || lower.contains("plane") {
        "plane"
    } else if lower.contains("capsule") || lower.contains("pill") {
        "capsule"
    } else {
        "cube"
    }
}

fn generate_objects_from_description(description: &str) -> String {
    let lower = description.to_lowercase();
    let mut objects = Vec::new();

    // Check for common scene elements
    if lower.contains("floor") || lower.contains("ground") {
        objects.push(
            r##"  object "Ground" @collidable {
    geometry: "plane"
    scale: [10, 1, 10]
    position: [0, 0, 0]
    color: "#444444"
  }"##
            .to_string(),
        );
    }

    if lower.contains("player") {
        objects.push(
            r##"  object "Player" @physics @collidable {
    geometry: "capsule"
    position: [0, 1, 0]
    color: "#00ff00"
  }"##
            .to_string(),
        );
    }

    if lower.contains("light") || lower.contains("sun") {
        objects.push(
            r##"  directional_light "Sun" {
    position: [5, 10, 5]
    color: "#ffffff"
    intensity: 1.0
  }"##
            .to_string(),
        );
    }

    if lower.contains("camera") {
        objects.push(
            r#"  perspective_camera "MainCamera" {
    position: [0, 3, -10]
    fov: 60
  }"#
            .to_string(),
        );
    }

    // Default object if nothing specific found
    if objects.is_empty() {
        objects.push(
            r##"  object "MainObject" @grabbable {
    geometry: "cube"
    position: [0, 1, 0]
    color: "#3399ff"
  }"##
            .to_string(),
        );
    }

    objects.join("\n\n")
}

// Export the component
export!(HoloscriptComponent);
