use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use holoscript_wasm::ast::{Ast, AstNode, ImportNode};
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::NativeCompileError;

#[derive(Debug)]
struct LoadedModule {
    relative_path: PathBuf,
    ast: Ast,
    imports: Vec<ResolvedImport>,
}

#[derive(Debug, Clone)]
struct ResolvedImport {
    declaration: ImportNode,
    target: PathBuf,
}

pub(crate) fn uses_module_syntax(ast: &Ast) -> bool {
    ast.body
        .iter()
        .any(|node| matches!(node, AstNode::Import(_) | AstNode::Export(_)))
}

pub(crate) fn load_project_ast(entry: &Path) -> Result<Ast, NativeCompileError> {
    let entry = canonical_source_path(entry, "entry module")?;
    require_holoscript_extension(&entry, "entry module")?;
    let project_root = entry
        .parent()
        .ok_or_else(|| NativeCompileError::new("entry module has no parent directory"))?
        .to_path_buf();

    let mut modules = HashMap::new();
    let mut order = Vec::new();
    let mut visiting = Vec::new();
    load_module(
        &entry,
        &project_root,
        &mut modules,
        &mut order,
        &mut visiting,
    )?;

    merge_modules(&entry, &order, &modules)
}

fn canonical_source_path(path: &Path, label: &str) -> Result<PathBuf, NativeCompileError> {
    fs::canonicalize(path).map_err(|error| {
        NativeCompileError::new(format!(
            "failed to resolve {label} {}: {error}",
            path.display()
        ))
    })
}

fn require_holoscript_extension(path: &Path, label: &str) -> Result<(), NativeCompileError> {
    if path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("hs"))
    {
        return Ok(());
    }
    Err(NativeCompileError::new(format!(
        "{label} {} must use the canonical `.hs` extension",
        path.display()
    )))
}

fn load_module(
    path: &Path,
    project_root: &Path,
    modules: &mut HashMap<PathBuf, LoadedModule>,
    order: &mut Vec<PathBuf>,
    visiting: &mut Vec<PathBuf>,
) -> Result<(), NativeCompileError> {
    if modules.contains_key(path) {
        return Ok(());
    }
    if let Some(index) = visiting.iter().position(|candidate| candidate == path) {
        let cycle = visiting[index..]
            .iter()
            .map(PathBuf::as_path)
            .chain(std::iter::once(path))
            .map(|candidate| display_relative(project_root, candidate))
            .collect::<Vec<_>>()
            .join(" -> ");
        return Err(NativeCompileError::new(format!(
            "hs-machine-v33 module cycle detected: {cycle}"
        )));
    }

    let relative_path = path.strip_prefix(project_root).map_err(|_| {
        NativeCompileError::new(format!(
            "module {} escapes project root {}",
            path.display(),
            project_root.display()
        ))
    })?;
    let source = fs::read_to_string(path).map_err(|error| {
        NativeCompileError::new(format!("failed to read module {}: {error}", path.display()))
    })?;
    let ast = holoscript_wasm::parse_ast(&source).map_err(|diagnostics| {
        let rendered = diagnostics
            .into_iter()
            .map(|diagnostic| {
                format!(
                    "{}:{}: {}",
                    diagnostic.line, diagnostic.column, diagnostic.message
                )
            })
            .collect::<Vec<_>>()
            .join("; ");
        NativeCompileError::new(format!(
            "HoloScript parse failed in {}: {rendered}",
            display_relative(project_root, path)
        ))
    })?;

    let mut imports = Vec::new();
    for node in &ast.body {
        let AstNode::Import(import) = node else {
            continue;
        };
        let target = resolve_import(path, project_root, import)?;
        imports.push(ResolvedImport {
            declaration: import.clone(),
            target,
        });
    }

    visiting.push(path.to_path_buf());
    for import in &imports {
        load_module(&import.target, project_root, modules, order, visiting)?;
    }
    visiting.pop();

    modules.insert(
        path.to_path_buf(),
        LoadedModule {
            relative_path: relative_path.to_path_buf(),
            ast,
            imports,
        },
    );
    order.push(path.to_path_buf());
    Ok(())
}

fn resolve_import(
    importer: &Path,
    project_root: &Path,
    import: &ImportNode,
) -> Result<PathBuf, NativeCompileError> {
    let source = import.source.trim();
    let relative = source.starts_with("./")
        || source.starts_with("../")
        || source.starts_with(".\\")
        || source.starts_with("..\\");
    if !relative || Path::new(source).is_absolute() {
        return Err(NativeCompileError::new(format!(
            "hs-machine-v33 import `{source}` in {} must be an explicit relative `.hs` path",
            display_relative(project_root, importer)
        )));
    }

    let unresolved = importer
        .parent()
        .ok_or_else(|| NativeCompileError::new("importer has no parent directory"))?
        .join(source);
    require_holoscript_extension(&unresolved, "import target")?;
    let target = canonical_source_path(&unresolved, "import target")?;
    if !target.starts_with(project_root) {
        return Err(NativeCompileError::new(format!(
            "hs-machine-v33 import `{source}` in {} escapes project root {}",
            display_relative(project_root, importer),
            project_root.display()
        )));
    }
    Ok(target)
}

fn merge_modules(
    entry: &Path,
    order: &[PathBuf],
    modules: &HashMap<PathBuf, LoadedModule>,
) -> Result<Ast, NativeCompileError> {
    let mut declarations_by_module = HashMap::<PathBuf, HashMap<String, String>>::new();
    let mut exports_by_module = HashMap::<PathBuf, HashMap<String, String>>::new();

    for path in order {
        let module = modules
            .get(path)
            .ok_or_else(|| NativeCompileError::new("internal module graph inconsistency"))?;
        let prefix = module_prefix(&module.relative_path);
        let mut declarations = HashMap::new();
        let mut exports = HashMap::new();

        for node in &module.ast.body {
            let (declaration, exported) = match node {
                AstNode::Export(export) => (export.declaration.as_ref(), true),
                other => (other, false),
            };
            let Some(name) = declaration_name(declaration) else {
                if exported {
                    return Err(NativeCompileError::new(format!(
                        "hs-machine-v33 export in {} must wrap a named function, struct, or enum",
                        module.relative_path.display()
                    )));
                }
                continue;
            };
            let qualified = if path == entry {
                name.to_string()
            } else {
                format!("{prefix}_{name}")
            };
            if declarations
                .insert(name.to_string(), qualified.clone())
                .is_some()
            {
                return Err(NativeCompileError::new(format!(
                    "hs-machine-v33 module {} declares `{name}` more than once",
                    module.relative_path.display()
                )));
            }
            if exported && exports.insert(name.to_string(), qualified).is_some() {
                return Err(NativeCompileError::new(format!(
                    "hs-machine-v33 module {} exports `{name}` more than once",
                    module.relative_path.display()
                )));
            }
        }

        declarations_by_module.insert(path.clone(), declarations);
        exports_by_module.insert(path.clone(), exports);
    }

    let mut merged = Ast::default();
    for path in order {
        let module = modules
            .get(path)
            .ok_or_else(|| NativeCompileError::new("internal module graph inconsistency"))?;
        let mut renames = declarations_by_module
            .get(path)
            .cloned()
            .unwrap_or_default();
        let mut imported_locals = HashSet::new();

        for import in &module.imports {
            if import.declaration.specifiers.is_empty() {
                return Err(NativeCompileError::new(format!(
                    "hs-machine-v33 import `{}` in {} must name at least one export",
                    import.declaration.source,
                    module.relative_path.display()
                )));
            }
            let target_exports = exports_by_module
                .get(&import.target)
                .ok_or_else(|| NativeCompileError::new("internal export graph inconsistency"))?;
            for specifier in &import.declaration.specifiers {
                let qualified = target_exports.get(&specifier.imported).ok_or_else(|| {
                    NativeCompileError::new(format!(
                        "hs-machine-v33 module {} does not export `{}` imported by {}",
                        display_relative(
                            entry.parent().unwrap_or_else(|| Path::new("")),
                            &import.target
                        ),
                        specifier.imported,
                        module.relative_path.display()
                    ))
                })?;
                if renames.contains_key(&specifier.local)
                    || !imported_locals.insert(specifier.local.clone())
                {
                    return Err(NativeCompileError::new(format!(
                        "hs-machine-v33 import binding `{}` collides in {}",
                        specifier.local,
                        module.relative_path.display()
                    )));
                }
                renames.insert(specifier.local.clone(), qualified.clone());
            }
        }

        merged.directives.extend(module.ast.directives.clone());
        for node in &module.ast.body {
            let declaration = match node {
                AstNode::Import(_) => continue,
                AstNode::Export(export) => export.declaration.as_ref().clone(),
                other => other.clone(),
            };
            merged.body.push(rewrite_node(declaration, &renames)?);
        }
    }
    Ok(merged)
}

fn declaration_name(node: &AstNode) -> Option<&str> {
    match node {
        AstNode::Function(function) => Some(&function.name),
        AstNode::StructDeclaration(structure) => Some(&structure.name),
        AstNode::EnumDeclaration(enumeration) => Some(&enumeration.name),
        _ => None,
    }
}

fn module_prefix(relative_path: &Path) -> String {
    let stable_path = relative_path.to_string_lossy().replace('\\', "/");
    let digest = Sha256::digest(stable_path.as_bytes());
    format!("__hsmod_{}", &format!("{digest:x}")[..12])
}

fn display_relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn rewrite_node(
    node: AstNode,
    renames: &HashMap<String, String>,
) -> Result<AstNode, NativeCompileError> {
    let mut value = serde_json::to_value(node).map_err(|error| {
        NativeCompileError::new(format!("failed to serialize module AST: {error}"))
    })?;
    rewrite_value(&mut value, renames);
    serde_json::from_value(value).map_err(|error| {
        NativeCompileError::new(format!(
            "failed to deserialize rewritten module AST: {error}"
        ))
    })
}

fn rewrite_value(value: &mut Value, renames: &HashMap<String, String>) {
    let Value::Object(object) = value else {
        if let Value::Array(values) = value {
            for value in values {
                rewrite_value(value, renames);
            }
        }
        return;
    };

    let node_type = object
        .get("type")
        .and_then(Value::as_str)
        .map(str::to_string);
    if matches!(
        node_type.as_deref(),
        Some("Function" | "StructDeclaration" | "EnumDeclaration")
    ) {
        rewrite_named_field(object.get_mut("name"), renames);
    }
    if node_type.as_deref() == Some("CallExpression") {
        if let Some(Value::Object(callee)) = object.get_mut("callee") {
            if callee.get("type").and_then(Value::as_str) == Some("Identifier") {
                rewrite_named_field(callee.get_mut("name"), renames);
            }
        }
    }

    for field in [
        "param_types",
        "return_type",
        "field_types",
        "type_annotation",
    ] {
        if let Some(value) = object.get_mut(field) {
            rewrite_type_value(value, renames);
        }
    }
    for child in object.values_mut() {
        rewrite_value(child, renames);
    }
}

fn rewrite_named_field(value: Option<&mut Value>, renames: &HashMap<String, String>) {
    let Some(Value::String(name)) = value else {
        return;
    };
    if let Some(replacement) = renames.get(name) {
        *name = replacement.clone();
    }
}

fn rewrite_type_value(value: &mut Value, renames: &HashMap<String, String>) {
    match value {
        Value::String(annotation) => *annotation = rewrite_type_annotation(annotation, renames),
        Value::Array(values) => {
            for value in values {
                rewrite_type_value(value, renames);
            }
        }
        _ => {}
    }
}

fn rewrite_type_annotation(annotation: &str, renames: &HashMap<String, String>) -> String {
    let mut rewritten = String::with_capacity(annotation.len());
    let mut token = String::new();
    let flush = |token: &mut String, rewritten: &mut String| {
        if token.is_empty() {
            return;
        }
        if let Some(replacement) = renames.get(token) {
            rewritten.push_str(replacement);
        } else {
            rewritten.push_str(token);
        }
        token.clear();
    };

    for character in annotation.chars() {
        if character.is_ascii_alphanumeric() || character == '_' {
            token.push(character);
        } else {
            flush(&mut token, &mut rewritten);
            rewritten.push(character);
        }
    }
    flush(&mut token, &mut rewritten);
    rewritten
}
