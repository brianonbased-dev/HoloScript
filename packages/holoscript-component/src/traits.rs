//! Trait definitions for HoloScript VR traits.

use crate::holoscript::core::types::{TraitDef, TraitFull};

/// Check if a trait exists
pub fn trait_exists(name: &str) -> bool {
    ALL_TRAITS.iter().any(|t| t.0 == name)
}

/// Get a trait by name
pub fn get_trait(name: &str) -> Option<TraitDef> {
    ALL_TRAITS.iter().find(|t| t.0 == name).map(|t| TraitDef {
        name: t.0.to_string(),
        category: t.1.to_string(),
        description: t.2.to_string(),
    })
}

/// List all available traits
pub fn list_all_traits() -> Vec<TraitDef> {
    ALL_TRAITS.iter().map(|t| TraitDef {
        name: t.0.to_string(),
        category: t.1.to_string(),
        description: t.2.to_string(),
    }).collect()
}

/// List traits by category
pub fn list_traits_by_category(category: &str) -> Vec<TraitDef> {
    ALL_TRAITS.iter()
        .filter(|t| t.1.eq_ignore_ascii_case(category))
        .map(|t| TraitDef {
            name: t.0.to_string(),
            category: t.1.to_string(),
            description: t.2.to_string(),
        })
        .collect()
}

/// Get full trait metadata including default properties
pub fn get_trait_full(name: &str) -> Option<TraitFull> {
    ALL_TRAITS.iter().find(|t| t.0 == name).map(|t| TraitFull {
        name: t.0.to_string(),
        category: t.1.to_string(),
        description: t.2.to_string(),
        default_properties: t.3.iter().map(|s| s.to_string()).collect(),
    })
}

/// List all unique trait categories
pub fn list_categories() -> Vec<String> {
    let mut categories: Vec<String> = ALL_TRAITS
        .iter()
        .map(|t| t.1.to_string())
        .collect();
    categories.sort();
    categories.dedup();
    categories
}

/// Suggest traits based on a description
pub fn suggest_traits_for_description(description: &str) -> Vec<TraitDef> {
    let lower = description.to_lowercase();
    let mut suggested = Vec::new();
    
    // Interaction traits
    if lower.contains("grab") || lower.contains("pick up") || lower.contains("hold") {
        suggested.push(get_trait("grabbable").unwrap());
    }
    if lower.contains("throw") || lower.contains("toss") {
        suggested.push(get_trait("throwable").unwrap());
    }
    if lower.contains("click") || lower.contains("press") || lower.contains("button") {
        suggested.push(get_trait("clickable").unwrap());
    }
    if lower.contains("drag") {
        suggested.push(get_trait("draggable").unwrap());
    }
    if lower.contains("point") || lower.contains("laser") {
        suggested.push(get_trait("pointable").unwrap());
    }
    if lower.contains("resize") || lower.contains("scale") {
        suggested.push(get_trait("scalable").unwrap());
    }
    
    // Physics traits
    if lower.contains("collide") || lower.contains("collision") || lower.contains("solid") {
        suggested.push(get_trait("collidable").unwrap());
    }
    if lower.contains("physic") || lower.contains("bounce") || lower.contains("fall") {
        suggested.push(get_trait("physics").unwrap());
    }
    if lower.contains("rigid") {
        suggested.push(get_trait("rigid").unwrap());
    }
    if lower.contains("gravity") {
        suggested.push(get_trait("gravity").unwrap());
    }
    if lower.contains("trigger") || lower.contains("detect") {
        suggested.push(get_trait("trigger").unwrap());
    }
    
    // Visual traits
    if lower.contains("glow") || lower.contains("light up") || lower.contains("shine") {
        suggested.push(get_trait("glowing").unwrap());
    }
    if lower.contains("transpar") || lower.contains("see through") || lower.contains("glass") {
        suggested.push(get_trait("transparent").unwrap());
    }
    if lower.contains("reflect") || lower.contains("mirror") {
        suggested.push(get_trait("reflective").unwrap());
    }
    if lower.contains("animat") {
        suggested.push(get_trait("animated").unwrap());
    }
    if lower.contains("billboard") || lower.contains("face camera") {
        suggested.push(get_trait("billboard").unwrap());
    }
    
    // Networking traits
    if lower.contains("network") || lower.contains("multiplay") || lower.contains("sync") {
        suggested.push(get_trait("networked").unwrap());
    }
    if lower.contains("persist") || lower.contains("save") {
        suggested.push(get_trait("persistent").unwrap());
    }
    if lower.contains("host") || lower.contains("server") {
        suggested.push(get_trait("host_only").unwrap());
    }
    
    // Behavior traits
    if lower.contains("stack") || lower.contains("pile") {
        suggested.push(get_trait("stackable").unwrap());
    }
    if lower.contains("attach") || lower.contains("connect") {
        suggested.push(get_trait("attachable").unwrap());
    }
    if lower.contains("equip") || lower.contains("wear") || lower.contains("tool") {
        suggested.push(get_trait("equippable").unwrap());
    }
    if lower.contains("consume") || lower.contains("eat") || lower.contains("drink") {
        suggested.push(get_trait("consumable").unwrap());
    }
    if lower.contains("destroy") || lower.contains("break") {
        suggested.push(get_trait("destructible").unwrap());
    }
    
    // Spatial traits
    if lower.contains("anchor") || lower.contains("fixed position") {
        suggested.push(get_trait("anchor").unwrap());
    }
    if lower.contains("track") || lower.contains("follow") {
        suggested.push(get_trait("tracked").unwrap());
    }
    if lower.contains("hand") && lower.contains("track") {
        suggested.push(get_trait("hand_tracked").unwrap());
    }
    if lower.contains("eye") && lower.contains("track") {
        suggested.push(get_trait("eye_tracked").unwrap());
    }
    
    // Audio traits
    if lower.contains("sound") || lower.contains("audio") || lower.contains("3d audio") {
        suggested.push(get_trait("spatial_audio").unwrap());
    }
    if lower.contains("ambient") && lower.contains("sound") {
        suggested.push(get_trait("ambient").unwrap());
    }
    if lower.contains("voice") || lower.contains("speech") {
        suggested.push(get_trait("voice_activated").unwrap());
    }
    
    // State traits
    if lower.contains("state") {
        suggested.push(get_trait("state").unwrap());
    }
    if lower.contains("reactive") || lower.contains("respond") {
        suggested.push(get_trait("reactive").unwrap());
    }
    
    // Default to grabbable if nothing specific matches and it's interactive
    if suggested.is_empty() && (lower.contains("interact") || lower.contains("object")) {
        suggested.push(get_trait("grabbable").unwrap());
    }
    
    suggested
}

/// All 49 VR traits: (name, category, description, default_properties)
const ALL_TRAITS: &[(&str, &str, &str, &[&str])] = &[
    // Interaction traits (8)
    ("grabbable", "interaction", "Object can be grabbed and held by the user", &["grab_points", "two_handed"]),
    ("throwable", "interaction", "Object can be thrown after being grabbed", &["throw_force", "spin"]),
    ("holdable", "interaction", "Object can be held indefinitely", &["hold_position", "hold_rotation"]),
    ("clickable", "interaction", "Object responds to click/select input", &["click_sound", "highlight_color"]),
    ("hoverable", "interaction", "Object responds to hover/point input", &["hover_color", "hover_scale"]),
    ("draggable", "interaction", "Object can be dragged along surfaces", &["drag_constraint", "snap_to_grid"]),
    ("pointable", "interaction", "Object can be pointed at with a laser/ray", &["point_distance", "highlight"]),
    ("scalable", "interaction", "Object can be resized by the user", &["min_scale", "max_scale", "uniform"]),
    
    // Physics traits (6)
    ("collidable", "physics", "Object participates in collision detection", &["collision_layer", "collision_mask"]),
    ("physics", "physics", "Object has full physics simulation", &["mass", "restitution", "friction"]),
    ("rigid", "physics", "Object is a rigid body", &["mass", "angular_damping", "linear_damping"]),
    ("kinematic", "physics", "Object moves via script, not physics", &["interpolation"]),
    ("trigger", "physics", "Object acts as trigger volume", &["trigger_shape", "trigger_size"]),
    ("gravity", "physics", "Object is affected by gravity", &["gravity_scale"]),
    
    // Visual traits (6)
    ("glowing", "visual", "Object emits light/glow effect", &["glow_color", "glow_intensity"]),
    ("emissive", "visual", "Object has emissive material", &["emission_color", "emission_intensity"]),
    ("transparent", "visual", "Object has transparency", &["opacity", "alpha_cutoff"]),
    ("reflective", "visual", "Object has reflective surface", &["reflectivity", "roughness"]),
    ("animated", "visual", "Object has animations", &["animation_clip", "autoplay", "loop"]),
    ("billboard", "visual", "Object always faces the camera", &["axis_lock"]),
    
    // Networking traits (5)
    ("networked", "networking", "Object state is synced across network", &["sync_rate", "interpolation"]),
    ("synced", "networking", "Object properties are automatically synced", &["sync_properties"]),
    ("persistent", "networking", "Object state persists across sessions", &["storage_key"]),
    ("owned", "networking", "Object has network ownership", &["owner_id", "transfer_allowed"]),
    ("host_only", "networking", "Object is only visible/active on host", &[]),
    
    // Behavior traits (5)
    ("stackable", "behavior", "Objects can be stacked on each other", &["stack_height", "stack_offset"]),
    ("attachable", "behavior", "Object can attach to other objects", &["attach_points", "snap_distance"]),
    ("equippable", "behavior", "Object can be equipped by player", &["equip_slot", "equip_position"]),
    ("consumable", "behavior", "Object can be consumed/used up", &["consume_effect", "uses"]),
    ("destructible", "behavior", "Object can be destroyed", &["health", "debris", "destroy_effect"]),
    
    // Spatial traits (5)
    ("anchor", "spatial", "Object is anchored to a world position", &["anchor_type", "precision"]),
    ("tracked", "spatial", "Object tracks a real-world entity", &["tracking_source"]),
    ("world_locked", "spatial", "Object stays fixed in world space", &["lock_position", "lock_rotation"]),
    ("hand_tracked", "spatial", "Object follows hand tracking", &["hand", "joint"]),
    ("eye_tracked", "spatial", "Object follows eye gaze", &["gaze_offset", "smooth_factor"]),
    
    // Audio traits (3)
    ("spatial_audio", "audio", "Object emits 3D spatial audio", &["audio_source", "rolloff", "max_distance"]),
    ("ambient", "audio", "Object emits ambient background audio", &["ambient_clip", "volume"]),
    ("voice_activated", "audio", "Object responds to voice commands", &["commands", "sensitivity"]),
    
    // State traits (4)
    ("state", "state", "Object has internal state management", &["initial_state"]),
    ("reactive", "state", "Object reacts to state changes", &["watch_properties"]),
    ("observable", "state", "Object state can be observed by others", &["observable_properties"]),
    ("computed", "state", "Object has computed/derived properties", &["computed_properties"]),
    
    // UI traits (4)
    ("ui_panel", "ui", "Object is a UI panel", &["width", "height", "curved"]),
    ("ui_button", "ui", "Object is a UI button", &["label", "click_action"]),
    ("ui_text", "ui", "Object displays text", &["text", "font_size", "color"]),
    ("ui_slider", "ui", "Object is a UI slider", &["min", "max", "value"]),
    
    // Legacy/Alias traits (3)
    ("interactive", "interaction", "Alias for grabbable + clickable", &[]),
    ("solid", "physics", "Alias for collidable + rigid", &[]),
    ("lit", "visual", "Alias for glowing + emissive", &[]),
];

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_trait_exists() {
        assert!(trait_exists("grabbable"));
        assert!(trait_exists("physics"));
        assert!(trait_exists("networked"));
        assert!(!trait_exists("nonexistent"));
    }
    
    #[test]
    fn test_get_trait() {
        let trait_def = get_trait("grabbable").unwrap();
        assert_eq!(trait_def.name, "grabbable");
        assert_eq!(trait_def.category, "interaction");
    }
    
    #[test]
    fn test_list_by_category() {
        let interaction_traits = list_traits_by_category("interaction");
        assert!(interaction_traits.len() >= 8);
        assert!(interaction_traits.iter().all(|t| t.category == "interaction"));
    }
    
    #[test]
    fn test_suggest_traits() {
        let suggestions = suggest_traits_for_description("a ball that can be grabbed and thrown");
        assert!(suggestions.iter().any(|t| t.name == "grabbable"));
        assert!(suggestions.iter().any(|t| t.name == "throwable"));
    }
    
    #[test]
    fn test_all_traits_count() {
        let all = list_all_traits();
        assert_eq!(all.len(), 49); // All 49 VR traits
    }
}
