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
            (HoloType::Vec3, HoloType::Array(inner)) | (HoloType::Array(inner), HoloType::Vec3) => {
                **inner == HoloType::Number
            }

            // Color can be string (hex) or Vec4
            (HoloType::String, HoloType::Color) | (HoloType::Vec4, HoloType::Color) => true,

            _ => false,
        }
    }
}

impl std::fmt::Display for HoloType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            HoloType::String => write!(f, "string"),
            HoloType::Number => write!(f, "number"),
            HoloType::Boolean => write!(f, "boolean"),
            HoloType::Null => write!(f, "null"),
            HoloType::Array(inner) => write!(f, "{}[]", inner),
            HoloType::Object(props) => {
                let props_str: Vec<String> =
                    props.iter().map(|(k, v)| format!("{}: {}", k, v)).collect();
                write!(f, "{{ {} }}", props_str.join(", "))
            }
            HoloType::Function(params, ret) => {
                let params_str: Vec<String> = params.iter().map(|p| p.to_string()).collect();
                write!(f, "({}) => {}", params_str.join(", "), ret)
            }
            HoloType::Vec3 => write!(f, "Vec3"),
            HoloType::Vec4 => write!(f, "Vec4"),
            HoloType::Color => write!(f, "Color"),
            HoloType::Quaternion => write!(f, "Quaternion"),
            HoloType::Orb => write!(f, "Orb"),
            HoloType::Entity => write!(f, "Entity"),
            HoloType::Composition => write!(f, "Composition"),
            HoloType::World => write!(f, "World"),
            HoloType::Template => write!(f, "Template"),
            HoloType::Group => write!(f, "Group"),
            HoloType::Any => write!(f, "any"),
            HoloType::Void => write!(f, "void"),
            HoloType::Unknown => write!(f, "unknown"),
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
            properties: &[("intensity", HoloType::Number), ("color", HoloType::Color)],
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
