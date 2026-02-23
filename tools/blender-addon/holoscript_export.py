# ============================================================================
# HoloScript Exporter for Blender
# Exports Blender scenes to HoloScript .holo composition format.
# ============================================================================

bl_info = {
    "name": "HoloScript Exporter",
    "author": "HoloScript Team",
    "version": (1, 0, 0),
    "blender": (3, 0, 0),
    "location": "File > Export > HoloScript (.holo)",
    "description": "Export Blender scenes to HoloScript .holo composition format",
    "warning": "",
    "doc_url": "https://holoscript.net/docs/blender-addon",
    "category": "Import-Export",
}

import bpy
import os
import math
from bpy.props import StringProperty, BoolProperty, FloatProperty, EnumProperty
from bpy_extras.io_utils import ExportHelper
from mathutils import Euler


# ============================================================================
# Utility helpers
# ============================================================================

def sanitize_name(name: str) -> str:
    """Convert a Blender object name to a valid HoloScript identifier."""
    sanitized = name.replace(" ", "_").replace(".", "_").replace("-", "_")
    sanitized = "".join(ch for ch in sanitized if ch.isalnum() or ch == "_")
    if sanitized and sanitized[0].isdigit():
        sanitized = "_" + sanitized
    return sanitized or "unnamed"


def format_float(value: float, precision: int = 4) -> str:
    """Format a float, stripping unnecessary trailing zeros."""
    formatted = f"{value:.{precision}f}".rstrip("0").rstrip(".")
    if formatted == "-0":
        formatted = "0"
    return formatted


def format_vector(vec, precision: int = 4) -> str:
    """Format a 3-component vector as a HoloScript array literal."""
    return "[{}, {}, {}]".format(
        format_float(vec[0], precision),
        format_float(vec[1], precision),
        format_float(vec[2], precision),
    )


def format_color(color) -> str:
    """Convert an RGB(A) color to a hex string."""
    r = max(0, min(255, int(color[0] * 255)))
    g = max(0, min(255, int(color[1] * 255)))
    b = max(0, min(255, int(color[2] * 255)))
    return f'"#{r:02x}{g:02x}{b:02x}"'


def degrees_vector(radians_vec) -> str:
    """Convert a rotation vector from radians to degrees and format it."""
    return "[{}, {}, {}]".format(
        format_float(math.degrees(radians_vec[0])),
        format_float(math.degrees(radians_vec[1])),
        format_float(math.degrees(radians_vec[2])),
    )


def is_default_position(loc) -> bool:
    return all(abs(v) < 1e-6 for v in loc)


def is_default_rotation(rot) -> bool:
    return all(abs(v) < 1e-6 for v in rot)


def is_default_scale(scl) -> bool:
    return all(abs(v - 1.0) < 1e-6 for v in scl)


# ============================================================================
# Physics / modifier / constraint mapping
# ============================================================================

def gather_physics_traits(obj) -> list:
    """Inspect physics settings and modifiers to produce trait lines."""
    traits = []

    # Rigid body
    if obj.rigid_body is not None:
        rb = obj.rigid_body
        if rb.type == "ACTIVE":
            params = []
            if abs(rb.mass - 1.0) > 1e-4:
                params.append(f"mass: {format_float(rb.mass)}")
            if abs(rb.friction - 0.5) > 1e-4:
                params.append(f"friction: {format_float(rb.friction)}")
            if abs(rb.restitution - 0.0) > 1e-4:
                params.append(f"restitution: {format_float(rb.restitution)}")
            param_str = f"({', '.join(params)})" if params else ""
            traits.append(f"@physics{param_str}")
            traits.append("@collidable")
        elif rb.type == "PASSIVE":
            traits.append("@collidable")
            traits.append("@kinematic")

    # Modifiers
    for mod in obj.modifiers:
        if mod.type == "CLOTH":
            params = []
            if hasattr(mod, "settings"):
                if abs(mod.settings.mass - 0.3) > 1e-4:
                    params.append(f"mass: {format_float(mod.settings.mass)}")
                if abs(mod.settings.air_damping - 1.0) > 1e-4:
                    params.append(f"damping: {format_float(mod.settings.air_damping)}")
            param_str = f"({', '.join(params)})" if params else ""
            traits.append(f"@cloth{param_str}")
        elif mod.type == "SOFT_BODY":
            params = []
            if hasattr(mod, "settings"):
                if abs(mod.settings.mass - 1.0) > 1e-4:
                    params.append(f"mass: {format_float(mod.settings.mass)}")
                if abs(mod.settings.friction - 0.5) > 1e-4:
                    params.append(f"friction: {format_float(mod.settings.friction)}")
            param_str = f"({', '.join(params)})" if params else ""
            traits.append(f"@soft_body{param_str}")
        elif mod.type == "PARTICLE_SYSTEM":
            params = []
            if hasattr(mod, "particle_system") and mod.particle_system:
                ps = mod.particle_system.settings
                if ps.count != 1000:
                    params.append(f"count: {ps.count}")
                if abs(ps.lifetime - 50.0) > 1e-2:
                    params.append(f"lifetime: {format_float(ps.lifetime)}")
                if abs(ps.normal_factor - 1.0) > 1e-4:
                    params.append(f"velocity: {format_float(ps.normal_factor)}")
            param_str = f"({', '.join(params)})" if params else ""
            traits.append(f"@particle_system{param_str}")

    return traits


def gather_constraint_traits(obj) -> list:
    """Inspect constraints to produce trait lines."""
    traits = []

    for con in obj.constraints:
        if con.type == "RIGID_BODY_JOINT":
            params = []
            if hasattr(con, "pivot_type"):
                params.append(f'type: "{con.pivot_type.lower()}"')
            if con.target:
                params.append(f'target: "{sanitize_name(con.target.name)}"')
            param_str = f"({', '.join(params)})" if params else ""
            traits.append(f"@joint{param_str}")
        elif con.type == "TRACK_TO":
            params = []
            if con.target:
                params.append(f'target: "{sanitize_name(con.target.name)}"')
            if con.track_axis != "TRACK_NEGATIVE_Z":
                params.append(f'axis: "{con.track_axis.lower()}"')
            param_str = f"({', '.join(params)})" if params else ""
            traits.append(f"@look_at{param_str}")
        elif con.type == "FOLLOW_PATH":
            params = []
            if con.target:
                params.append(f'path: "{sanitize_name(con.target.name)}"')
            if hasattr(con, "use_curve_follow") and con.use_curve_follow:
                params.append("follow_rotation: true")
            param_str = f"({', '.join(params)})" if params else ""
            traits.append(f"@patrol{param_str}")

    return traits


# ============================================================================
# Material extraction
# ============================================================================

def extract_material_info(obj) -> dict:
    """Extract colour and material properties from the first material slot."""
    info = {}

    if obj.active_material:
        mat = obj.active_material
        if mat.use_nodes and mat.node_tree:
            for node in mat.node_tree.nodes:
                if node.type == "BSDF_PRINCIPLED":
                    base_color_input = node.inputs.get("Base Color")
                    if base_color_input and not base_color_input.is_linked:
                        info["color"] = format_color(base_color_input.default_value)

                    metallic_input = node.inputs.get("Metallic")
                    if metallic_input and not metallic_input.is_linked:
                        val = metallic_input.default_value
                        if val > 0.1:
                            info["metalness"] = format_float(val)

                    roughness_input = node.inputs.get("Roughness")
                    if roughness_input and not roughness_input.is_linked:
                        val = roughness_input.default_value
                        if abs(val - 0.5) > 0.05:
                            info["roughness"] = format_float(val)

                    alpha_input = node.inputs.get("Alpha")
                    if alpha_input and not alpha_input.is_linked:
                        val = alpha_input.default_value
                        if val < 0.99:
                            info["opacity"] = format_float(val)

                    emission_input = node.inputs.get("Emission Color")
                    if emission_input is None:
                        emission_input = node.inputs.get("Emission")
                    if emission_input and not emission_input.is_linked:
                        ec = emission_input.default_value
                        if any(c > 0.01 for c in ec[:3]):
                            info["emissive_color"] = format_color(ec)

                    emission_strength = node.inputs.get("Emission Strength")
                    if emission_strength and not emission_strength.is_linked:
                        val = emission_strength.default_value
                        if val > 0.01:
                            info["emissive_intensity"] = format_float(val)

                    break
        else:
            info["color"] = format_color(mat.diffuse_color)

    return info


# ============================================================================
# Geometry type detection
# ============================================================================

def detect_geometry_type(obj) -> str:
    """Heuristically determine the primitive geometry type of a mesh."""
    if obj.type != "MESH" or obj.data is None:
        return "mesh"

    mesh = obj.data
    vert_count = len(mesh.vertices)
    face_count = len(mesh.polygons)

    if vert_count == 0:
        return "mesh"

    # Blender default primitives
    if vert_count == 8 and face_count == 6:
        return "cube"
    if vert_count == 4 and face_count == 1:
        return "plane"
    if vert_count >= 32 and face_count >= 30:
        # Likely a UV sphere or ico sphere
        all_distances = [v.co.length for v in mesh.vertices]
        if all_distances:
            avg = sum(all_distances) / len(all_distances)
            deviation = max(abs(d - avg) for d in all_distances)
            if deviation / max(avg, 0.001) < 0.05:
                return "sphere"
    if face_count >= 16:
        # Check for cylinder pattern: two circles and connecting quads
        has_ngon = any(len(p.vertices) > 4 for p in mesh.polygons)
        if has_ngon:
            return "cylinder"

    return "mesh"


# ============================================================================
# Light type mapping
# ============================================================================

def gather_light_traits(obj) -> tuple:
    """Map Blender light types to HoloScript glowing trait and properties."""
    light = obj.data
    traits = []
    properties = {}

    params = []
    color_str = format_color(light.color)
    params.append(f"color: {color_str}")

    if abs(light.energy - 10.0) > 0.1:
        params.append(f"intensity: {format_float(light.energy / 10.0)}")

    if light.type == "POINT":
        if hasattr(light, "shadow_soft_size") and light.shadow_soft_size > 0:
            params.append(f"radius: {format_float(light.shadow_soft_size)}")
    elif light.type == "SUN":
        params.append('type: "directional"')
    elif light.type == "SPOT":
        params.append('type: "spot"')
        params.append(f"angle: {format_float(math.degrees(light.spot_size))}")
        if abs(light.spot_blend - 0.15) > 0.01:
            params.append(f"blend: {format_float(light.spot_blend)}")
    elif light.type == "AREA":
        params.append('type: "area"')
        params.append(f"size: {format_float(light.size)}")

    param_str = f"({', '.join(params)})" if params else ""
    traits.append(f"@glowing{param_str}")

    if light.use_shadow:
        traits.append("@shadow_caster")

    properties["light_type"] = f'"{light.type.lower()}"'

    return traits, properties


# ============================================================================
# Object export logic
# ============================================================================

def export_object(obj, indent_level: int, exported_children: set, settings) -> str:
    """Export a single Blender object as a HoloScript object block."""
    indent = "  " * indent_level
    lines = []
    name = sanitize_name(obj.name)

    # Skip cameras
    if obj.type == "CAMERA":
        return ""

    # Determine object keyword and gather type-specific data
    object_keyword = "object"
    extra_traits = []
    extra_properties = {}
    geometry_line = None

    if obj.type == "MESH":
        geo_type = detect_geometry_type(obj)
        geometry_line = f'geometry: "{geo_type}"'
        if geo_type == "mesh" and obj.data:
            geometry_line = f'geometry: "{sanitize_name(obj.data.name)}"'
    elif obj.type == "LIGHT":
        light_traits, light_props = gather_light_traits(obj)
        extra_traits.extend(light_traits)
        extra_properties.update(light_props)
    elif obj.type == "EMPTY":
        object_keyword = "spatial_group"
    elif obj.type in ("CURVE", "SURFACE", "FONT"):
        geometry_line = f'geometry: "{sanitize_name(obj.data.name)}"'
    elif obj.type == "ARMATURE":
        extra_traits.append("@animated")
        geometry_line = f'armature: "{sanitize_name(obj.data.name)}"'
    else:
        # Fallback for other types (LATTICE, SPEAKER, etc.)
        pass

    # Physics traits
    physics_traits = gather_physics_traits(obj)
    extra_traits.extend(physics_traits)

    # Constraint traits
    constraint_traits = gather_constraint_traits(obj)
    extra_traits.extend(constraint_traits)

    # Material info
    mat_info = extract_material_info(obj)

    # Custom properties as HoloScript state
    custom_props = {}
    for key in obj.keys():
        if key.startswith("_") or key in ("cycles", "cycles_visibility"):
            continue
        val = obj[key]
        if isinstance(val, (int, float, bool, str)):
            custom_props[key] = val

    # Build the block
    lines.append(f'{indent}{object_keyword} "{name}" {{')

    inner = indent + "  "

    # Traits
    for trait in extra_traits:
        lines.append(f"{inner}{trait}")

    # Geometry
    if geometry_line:
        lines.append(f"{inner}{geometry_line}")

    # Transform
    loc = obj.location
    if obj.parent and settings.get("relative_transforms", True):
        loc = obj.matrix_local.to_translation()

    rot_euler = obj.rotation_euler
    if obj.rotation_mode == "QUATERNION":
        rot_euler = obj.rotation_quaternion.to_euler("XYZ")
    elif obj.rotation_mode == "AXIS_ANGLE":
        from mathutils import Quaternion as MQuaternion
        aa = obj.rotation_axis_angle
        q = MQuaternion(aa[1:], aa[0])
        rot_euler = q.to_euler("XYZ")

    scl = obj.scale

    if not is_default_position(loc):
        lines.append(f"{inner}position: {format_vector(loc)}")
    if not is_default_rotation(rot_euler):
        lines.append(f"{inner}rotation: {degrees_vector(rot_euler)}")
    if not is_default_scale(scl):
        # If all components are equal, output a scalar
        if abs(scl[0] - scl[1]) < 1e-6 and abs(scl[1] - scl[2]) < 1e-6:
            lines.append(f"{inner}scale: {format_float(scl[0])}")
        else:
            lines.append(f"{inner}scale: {format_vector(scl)}")

    # Material properties
    if "color" in mat_info:
        lines.append(f"{inner}color: {mat_info['color']}")
    if "metalness" in mat_info:
        lines.append(f"{inner}metalness: {mat_info['metalness']}")
    if "roughness" in mat_info:
        lines.append(f"{inner}roughness: {mat_info['roughness']}")
    if "opacity" in mat_info:
        lines.append(f"{inner}opacity: {mat_info['opacity']}")
    if "emissive_color" in mat_info:
        lines.append(f"{inner}emissive: {mat_info['emissive_color']}")
    if "emissive_intensity" in mat_info:
        lines.append(f"{inner}emissiveIntensity: {mat_info['emissive_intensity']}")

    # Extra properties from light mapping
    for key, val in extra_properties.items():
        lines.append(f"{inner}{key}: {val}")

    # Custom properties as state block
    if custom_props and settings.get("export_custom_props", True):
        lines.append(f"{inner}state {{")
        for key, val in custom_props.items():
            if isinstance(val, str):
                lines.append(f"{inner}  {sanitize_name(key)}: \"{val}\"")
            elif isinstance(val, bool):
                lines.append(f"{inner}  {sanitize_name(key)}: {'true' if val else 'false'}")
            elif isinstance(val, int):
                lines.append(f"{inner}  {sanitize_name(key)}: {val}")
            elif isinstance(val, float):
                lines.append(f"{inner}  {sanitize_name(key)}: {format_float(val)}")
        lines.append(f"{inner}}}")

    # Children (recursive)
    children = [child for child in obj.children if child.name not in exported_children]
    for child in sorted(children, key=lambda c: c.name):
        exported_children.add(child.name)
        child_block = export_object(child, indent_level + 1, exported_children, settings)
        if child_block:
            lines.append("")
            lines.append(child_block)

    lines.append(f"{indent}}}")
    return "\n".join(lines)


# ============================================================================
# Environment export
# ============================================================================

def export_environment(scene) -> str:
    """Export the Blender scene world settings as a HoloScript environment block."""
    lines = []
    lines.append("  environment {")

    world = scene.world
    if world and world.use_nodes and world.node_tree:
        for node in world.node_tree.nodes:
            if node.type == "BACKGROUND":
                color_input = node.inputs.get("Color")
                if color_input and not color_input.is_linked:
                    lines.append(f"    background_color: {format_color(color_input.default_value)}")
                strength_input = node.inputs.get("Strength")
                if strength_input and not strength_input.is_linked:
                    lines.append(f"    ambient_light: {format_float(strength_input.default_value)}")
                break
            elif node.type == "TEX_ENVIRONMENT":
                if node.image:
                    img_name = os.path.splitext(node.image.name)[0]
                    lines.append(f'    skybox: "{img_name}"')
                break

    # Fog / volumetrics
    if scene.eevee.use_volumetric_shadows if hasattr(scene, "eevee") else False:
        lines.append("    fog: true")
    else:
        lines.append("    fog: false")

    # Shadow settings
    lines.append(f"    shadows: true")

    # Gravity
    grav = scene.gravity
    if abs(grav[2] + 9.81) > 0.1:
        lines.append(f"    gravity: {format_vector(grav)}")

    lines.append("  }")
    return "\n".join(lines)


# ============================================================================
# Camera export (as comment)
# ============================================================================

def export_camera_comment(scene) -> str:
    """Export the active camera as a HoloScript comment for reference."""
    cam_obj = scene.camera
    if not cam_obj:
        return ""

    lines = []
    lines.append("  // Environment camera (exported as reference)")
    lines.append(f"  // Camera: {cam_obj.name}")
    lines.append(f"  //   position: {format_vector(cam_obj.location)}")
    lines.append(f"  //   rotation: {degrees_vector(cam_obj.rotation_euler)}")

    if cam_obj.data:
        cam_data = cam_obj.data
        lines.append(f"  //   fov: {format_float(math.degrees(cam_data.angle))}")
        lines.append(f"  //   clip_start: {format_float(cam_data.clip_start)}")
        lines.append(f"  //   clip_end: {format_float(cam_data.clip_end)}")

    return "\n".join(lines)


# ============================================================================
# Collection handling
# ============================================================================

def export_collection_as_group(collection, indent_level: int, exported_children: set, settings) -> str:
    """Export a Blender collection as a HoloScript spatial_group."""
    indent = "  " * indent_level
    lines = []
    name = sanitize_name(collection.name)

    # Skip default "Scene Collection"
    if collection.name == "Scene Collection":
        return ""

    lines.append(f'{indent}spatial_group "{name}" {{')

    # Objects directly in this collection (not already exported via parent)
    for obj in sorted(collection.objects, key=lambda o: o.name):
        if obj.name in exported_children:
            continue
        if obj.parent and obj.parent.name in {o.name for o in collection.objects}:
            continue  # will be exported as a child of its parent
        exported_children.add(obj.name)
        block = export_object(obj, indent_level + 1, exported_children, settings)
        if block:
            lines.append("")
            lines.append(block)

    # Child collections
    for child_coll in collection.children:
        child_block = export_collection_as_group(
            child_coll, indent_level + 1, exported_children, settings
        )
        if child_block:
            lines.append("")
            lines.append(child_block)

    lines.append(f"{indent}}}")
    return "\n".join(lines)


# ============================================================================
# Main export function
# ============================================================================

def export_holoscript(context, filepath, settings):
    """Main export routine: builds the .holo file from the active scene."""
    scene = context.scene
    scene_name = sanitize_name(scene.name)

    lines = []
    lines.append(f"// Exported from Blender {bpy.app.version_string}")
    lines.append(f"// HoloScript Exporter v{'.'.join(str(v) for v in bl_info['version'])}")
    lines.append("")
    lines.append(f'composition "{scene_name}" {{')

    # Environment
    env_block = export_environment(scene)
    lines.append("")
    lines.append(env_block)

    # Camera reference
    cam_comment = export_camera_comment(scene)
    if cam_comment:
        lines.append("")
        lines.append(cam_comment)

    exported_children = set()

    if settings.get("use_collections", True):
        # Export via collection hierarchy
        master_collection = scene.collection
        for child_coll in master_collection.children:
            coll_block = export_collection_as_group(
                child_coll, 1, exported_children, settings
            )
            if coll_block:
                lines.append("")
                lines.append(coll_block)

        # Export root-level objects not in any sub-collection
        root_objects = [
            obj
            for obj in master_collection.objects
            if obj.name not in exported_children and obj.parent is None
        ]
        for obj in sorted(root_objects, key=lambda o: o.name):
            if obj.type == "CAMERA":
                continue
            exported_children.add(obj.name)
            block = export_object(obj, 1, exported_children, settings)
            if block:
                lines.append("")
                lines.append(block)
    else:
        # Flat export: top-level objects only
        root_objects = [obj for obj in scene.objects if obj.parent is None]
        for obj in sorted(root_objects, key=lambda o: o.name):
            if obj.type == "CAMERA":
                continue
            exported_children.add(obj.name)
            block = export_object(obj, 1, exported_children, settings)
            if block:
                lines.append("")
                lines.append(block)

    lines.append("}")
    lines.append("")

    # Write to file
    content = "\n".join(lines)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

    return {"FINISHED"}


# ============================================================================
# Blender operator
# ============================================================================

class EXPORT_OT_holoscript(bpy.types.Operator, ExportHelper):
    """Export the current scene as a HoloScript .holo composition"""

    bl_idname = "export_scene.holoscript"
    bl_label = "Export HoloScript (.holo)"
    bl_options = {"REGISTER", "UNDO", "PRESET"}

    filename_ext = ".holo"

    filter_glob: StringProperty(
        default="*.holo",
        options={"HIDDEN"},
        maxlen=255,
    )

    use_collections: BoolProperty(
        name="Export Collections",
        description="Map Blender collections to HoloScript spatial_groups",
        default=True,
    )

    export_custom_props: BoolProperty(
        name="Export Custom Properties",
        description="Export custom object properties as HoloScript state blocks",
        default=True,
    )

    relative_transforms: BoolProperty(
        name="Relative Transforms",
        description="Export child transforms relative to parent",
        default=True,
    )

    apply_modifiers: BoolProperty(
        name="Apply Modifiers",
        description="Apply non-physics modifiers before export (affects geometry detection)",
        default=False,
    )

    selected_only: BoolProperty(
        name="Selected Only",
        description="Only export selected objects",
        default=False,
    )

    def execute(self, context):
        settings = {
            "use_collections": self.use_collections,
            "export_custom_props": self.export_custom_props,
            "relative_transforms": self.relative_transforms,
            "apply_modifiers": self.apply_modifiers,
            "selected_only": self.selected_only,
        }

        if self.selected_only:
            original_hide = {}
            for obj in context.scene.objects:
                if obj not in context.selected_objects:
                    original_hide[obj.name] = obj.hide_viewport
                    obj.hide_viewport = True

        result = export_holoscript(context, self.filepath, settings)

        if self.selected_only:
            for obj in context.scene.objects:
                if obj.name in original_hide:
                    obj.hide_viewport = original_hide[obj.name]

        if result == {"FINISHED"}:
            self.report({"INFO"}, f"HoloScript exported to {self.filepath}")
        else:
            self.report({"ERROR"}, "Failed to export HoloScript")

        return result

    def draw(self, context):
        layout = self.layout
        layout.use_property_split = True
        layout.use_property_decorate = False

        box = layout.box()
        box.label(text="Export Settings", icon="EXPORT")
        box.prop(self, "use_collections")
        box.prop(self, "export_custom_props")
        box.prop(self, "relative_transforms")
        box.prop(self, "apply_modifiers")
        box.prop(self, "selected_only")


# ============================================================================
# Menu integration
# ============================================================================

def menu_func_export(self, context):
    self.layout.operator(
        EXPORT_OT_holoscript.bl_idname, text="HoloScript (.holo)"
    )


# ============================================================================
# Registration
# ============================================================================

classes = (EXPORT_OT_holoscript,)


def register():
    for cls in classes:
        bpy.utils.register_class(cls)
    bpy.types.TOPBAR_MT_file_export.append(menu_func_export)


def unregister():
    bpy.types.TOPBAR_MT_file_export.remove(menu_func_export)
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)


if __name__ == "__main__":
    register()
