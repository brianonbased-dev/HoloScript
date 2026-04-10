//! Type system for HoloScript.
//!
//! This module provides type checking and inference for HoloScript programs.

use serde::{Deserialize, Serialize};

/// HoloScript types
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum HoloType {
    // Primitive types
    String,
    Number,
    Boolean,
    Null,

    // Composite types
    Array(Box<HoloType>),
    Object(Vec<(String, HoloType)>),
    Function(Vec<HoloType>, Box<HoloType>),

    // HoloScript-specific types
    Vec3,
    Vec4,
    Color,
    Quaternion,

    // Object types
    Orb,
    Entity,
    Composition,
    World,
    Template,
    Group,

    // Special types
    Any,
    Void,
    Unknown,
}

impl HoloType {
    /// Check if this type is assignable to another type
    pub fn is_assignable_to(&self, other: &HoloType) -> bool {
        if self == other {
            return true;
        }

        match (self, other) {
            // Any is assignable to anything
            (HoloType::Any, _) | (_, HoloType::Any) => true,

            // Null is assignable to any reference type
            (HoloType::Null, HoloType::Object(_))
            | (HoloType::Null, HoloType::Array(_))
            | (HoloType::Null, HoloType::Orb)
            | (HoloType::Null, HoloType::Entity) => true,

            // Array covariance
            (HoloType::Array(a), HoloType::Array(b)) => a.is_assignable_to(b),

            // Vec3 is assignable to/from arrays of 3 numbers
            (HoloType::Vec3, HoloType::Array(inner))
            | (HoloType::Array(inner), HoloType::Vec3) => **inner == HoloType::Number,

            // Color can be string (hex) or Vec4
            (HoloType::String, HoloType::Color) | (HoloType::Vec4, HoloType::Color) => true,

            _ => false,
        }
    }

    /// Get the string representation of this type
    pub fn to_string(&self) -> String {
        match self {
            HoloType::String => "string".to_string(),
            HoloType::Number => "number".to_string(),
            HoloType::Boolean => "boolean".to_string(),
            HoloType::Null => "null".to_string(),
            HoloType::Array(inner) => format!("{}[]", inner.to_string()),
            HoloType::Object(props) => {
                let props_str: Vec<String> = props
                    .iter()
                    .map(|(k, v)| format!("{}: {}", k, v.to_string()))
                    .collect();
                format!("{{ {} }}", props_str.join(", "))
            }
            HoloType::Function(params, ret) => {
                let params_str: Vec<String> = params.iter().map(|p| p.to_string()).collect();
                format!("({}) => {}", params_str.join(", "), ret.to_string())
            }
            HoloType::Vec3 => "Vec3".to_string(),
            HoloType::Vec4 => "Vec4".to_string(),
            HoloType::Color => "Color".to_string(),
            HoloType::Quaternion => "Quaternion".to_string(),
            HoloType::Orb => "Orb".to_string(),
            HoloType::Entity => "Entity".to_string(),
            HoloType::Composition => "Composition".to_string(),
            HoloType::World => "World".to_string(),
            HoloType::Template => "Template".to_string(),
            HoloType::Group => "Group".to_string(),
            HoloType::Any => "any".to_string(),
            HoloType::Void => "void".to_string(),
            HoloType::Unknown => "unknown".to_string(),
        }
    }
}

/// Known trait definitions with their expected property types
pub struct TraitDefinition {
    pub name: &'static str,
    pub properties: &'static [(&'static str, HoloType)],
}

/// Get the built-in trait definitions
pub fn get_builtin_traits() -> Vec<TraitDefinition> {
    vec![
        TraitDefinition {
            name: "grabbable",
            properties: &[],
        },
        TraitDefinition {
            name: "physics",
            properties: &[
                ("mass", HoloType::Number),
                ("friction", HoloType::Number),
                ("restitution", HoloType::Number),
            ],
        },
        TraitDefinition {
            name: "collidable",
            properties: &[],
        },
        TraitDefinition {
            name: "networked",
            properties: &[],
        },
        TraitDefinition {
            name: "synced",
            properties: &[("interpolate", HoloType::Boolean)],
        },
        TraitDefinition {
            name: "animated",
            properties: &[],
        },
        TraitDefinition {
            name: "glowing",
            properties: &[
                ("intensity", HoloType::Number),
                ("color", HoloType::Color),
            ],
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_type_assignability() {
        assert!(HoloType::String.is_assignable_to(&HoloType::String));
        assert!(HoloType::Any.is_assignable_to(&HoloType::String));
        assert!(HoloType::Null.is_assignable_to(&HoloType::Orb));
    }

    #[test]
    fn test_type_to_string() {
        assert_eq!(HoloType::String.to_string(), "string");
        assert_eq!(HoloType::Vec3.to_string(), "Vec3");
        assert_eq!(
            HoloType::Array(Box::new(HoloType::Number)).to_string(),
            "number[]"
        );
    }
}
