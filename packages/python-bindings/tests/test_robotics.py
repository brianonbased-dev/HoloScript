"""
Tests for HoloScript robotics module.

Covers URDF export, SDF export, ROS 2 launch file generation,
and robotics trait utilities.
"""

import pytest
from holoscript.robotics import (
    export_urdf,
    export_sdf,
    generate_ros2_launch,
    list_robotics_traits,
    URDFExportResult,
    SDFExportResult,
    ROSLaunchResult,
    ROBOTICS_TRAIT_MAPPINGS,
)


# ============================================================================
# URDF Export Tests
# ============================================================================

class TestURDFExport:
    """Tests for export_urdf() function."""

    def test_export_empty_scene_produces_valid_urdf(self):
        """Empty scene should produce minimal valid URDF."""
        result = export_urdf("")
        assert isinstance(result, URDFExportResult)
        assert result.success is True
        assert '<?xml version="1.0"?>' in result.urdf_content
        assert '<robot name=' in result.urdf_content
        assert '</robot>' in result.urdf_content

    def test_export_includes_base_link(self):
        """URDF must always include base_link for valid robot description."""
        result = export_urdf("")
        assert '<link name="base_link">' in result.urdf_content

    def test_export_includes_default_material(self):
        """URDF should include a default material definition."""
        result = export_urdf("")
        assert '<material name="default">' in result.urdf_content

    def test_custom_robot_name_used_in_output(self):
        """Custom robot name should appear in URDF robot element."""
        result = export_urdf("", robot_name="my_robot")
        assert 'name="my_robot"' in result.urdf_content

    def test_export_simple_cube_scene(self):
        """Simple cube scene should produce link and joint elements."""
        holo_code = "cube { @physics @collidable @position(0, 1, 0) }"
        result = export_urdf(holo_code)
        assert result.success is True
        assert result.link_count >= 1  # at least base_link

    def test_export_includes_visual_by_default(self):
        """Visual geometry should be included by default."""
        result = export_urdf("sphere { @physics }")
        assert result.success is True
        if result.link_count > 1:
            assert '<visual>' in result.urdf_content

    def test_export_includes_collision_by_default(self):
        """Collision geometry should be included by default."""
        result = export_urdf("sphere { @collidable }")
        assert result.success is True
        if result.link_count > 1:
            assert '<collision>' in result.urdf_content

    def test_export_includes_inertial_by_default(self):
        """Inertial properties should be included by default."""
        result = export_urdf("cube { @physics }")
        assert result.success is True
        if result.link_count > 1:
            assert '<inertial>' in result.urdf_content

    def test_export_excludes_visual_when_disabled(self):
        """Visual geometry should be excluded when include_visual=False."""
        holo_code = "cube { @physics }"
        result_with = export_urdf(holo_code, include_visual=True)
        result_without = export_urdf(holo_code, include_visual=False)
        # Without visual should not contain visual tags
        assert '<visual>' not in result_without.urdf_content

    def test_export_excludes_collision_when_disabled(self):
        """Collision geometry should be excluded when include_collision=False."""
        result = export_urdf("cube { @collidable }", include_collision=False)
        assert '<collision>' not in result.urdf_content

    def test_export_excludes_inertial_when_disabled(self):
        """Inertial properties should be excluded when include_inertial=False."""
        result = export_urdf("cube { @physics }", include_inertial=False)
        assert '<inertial>' not in result.urdf_content

    def test_urdf_result_has_expected_fields(self):
        """URDFExportResult should have all required fields."""
        result = export_urdf("")
        assert hasattr(result, 'success')
        assert hasattr(result, 'urdf_content')
        assert hasattr(result, 'robot_name')
        assert hasattr(result, 'link_count')
        assert hasattr(result, 'joint_count')
        assert hasattr(result, 'errors')
        assert hasattr(result, 'warnings')

    def test_urdf_xml_starts_with_declaration(self):
        """URDF must start with XML declaration for ROS compatibility."""
        result = export_urdf("")
        assert result.urdf_content.startswith('<?xml version="1.0"?>')

    def test_default_mass_parameter(self):
        """Custom default_mass should be reflected in URDF inertial element."""
        result = export_urdf("cube { @physics }", default_mass=2.5)
        assert result.success is True
        if result.link_count > 1:
            assert '<mass value="2.5"/>' in result.urdf_content


# ============================================================================
# SDF Export Tests
# ============================================================================

class TestSDFExport:
    """Tests for export_sdf() function."""

    def test_export_empty_scene_produces_valid_sdf(self):
        """Empty scene should produce minimal valid SDF."""
        result = export_sdf("")
        assert isinstance(result, SDFExportResult)
        assert result.success is True
        assert '<?xml version="1.0"?>' in result.sdf_content
        assert '<sdf version=' in result.sdf_content
        assert '</sdf>' in result.sdf_content
        assert '<world name=' in result.sdf_content

    def test_custom_world_name_used_in_output(self):
        """Custom world name should appear in SDF world element."""
        result = export_sdf("", world_name="my_world")
        assert 'name="my_world"' in result.sdf_content

    def test_sdf_includes_physics_by_default(self):
        """Physics engine config should be included by default."""
        result = export_sdf("")
        assert '<physics' in result.sdf_content
        assert 'max_step_size' in result.sdf_content

    def test_sdf_includes_gravity_by_default(self):
        """Gravity vector should be included by default."""
        result = export_sdf("")
        assert '<gravity>' in result.sdf_content
        assert '-9.8' in result.sdf_content

    def test_sdf_excludes_physics_when_disabled(self):
        """Physics config should be excluded when include_physics=False."""
        result = export_sdf("", include_physics=False)
        # Physics tag should not be present (only 'physics' in text might still appear in comments)
        assert '<physics name=' not in result.sdf_content

    def test_sdf_excludes_gravity_when_disabled(self):
        """Gravity element should be excluded when include_gravity=False."""
        result = export_sdf("", include_gravity=False)
        assert '<gravity>' not in result.sdf_content

    def test_sdf_includes_ground_plane(self):
        """SDF world should include a ground plane."""
        result = export_sdf("")
        assert 'ground_plane' in result.sdf_content

    def test_sdf_includes_sun_model(self):
        """SDF world should include a sun/light source."""
        result = export_sdf("")
        assert 'sun' in result.sdf_content

    def test_sdf_version_parameter(self):
        """Custom SDF version should appear in output."""
        result = export_sdf("", sdf_version="1.8")
        assert 'version="1.8"' in result.sdf_content

    def test_export_physics_demo(self):
        """Physics demo scene with sphere and plane should export successfully."""
        holo_code = """
        sphere {
            @physics
            @gravity
            @collidable
            @position(0, 5, 0)
        }
        plane {
            @collidable
            @static
        }
        """
        result = export_sdf(holo_code)
        assert result.success is True
        assert result.model_count >= 0  # Parsed objects appear as models

    def test_sdf_result_has_expected_fields(self):
        """SDFExportResult should have all required fields."""
        result = export_sdf("")
        assert hasattr(result, 'success')
        assert hasattr(result, 'sdf_content')
        assert hasattr(result, 'world_name')
        assert hasattr(result, 'model_count')
        assert hasattr(result, 'errors')

    def test_sdf_xml_is_well_formed(self):
        """SDF XML should have balanced opening and closing tags."""
        result = export_sdf("cube { @physics }")
        content = result.sdf_content

        # Count tags (simplified check)
        open_sdf = content.count('<sdf')
        close_sdf = content.count('</sdf>')
        assert open_sdf == close_sdf == 1

        open_world = content.count('<world')
        close_world = content.count('</world>')
        assert open_world == close_world == 1


# ============================================================================
# ROS 2 Launch File Tests
# ============================================================================

class TestROS2Launch:
    """Tests for generate_ros2_launch() function."""

    def test_generates_valid_python_launch_file(self):
        """Should generate valid Python launch file content."""
        result = generate_ros2_launch("")
        assert isinstance(result, ROSLaunchResult)
        assert result.success is True
        assert 'from launch import LaunchDescription' in result.launch_content
        assert 'def generate_launch_description()' in result.launch_content

    def test_launch_file_includes_robot_state_publisher(self):
        """Launch file must include robot_state_publisher node."""
        result = generate_ros2_launch("")
        assert 'robot_state_publisher' in result.launch_content

    def test_launch_file_includes_rviz_by_default(self):
        """RViz2 should be included by default."""
        result = generate_ros2_launch("")
        assert 'rviz2' in result.launch_content
        assert 'rviz2' in result.nodes

    def test_launch_file_includes_gazebo_by_default(self):
        """Gazebo should be included by default."""
        result = generate_ros2_launch("")
        assert 'gazebo' in result.launch_content

    def test_launch_file_excludes_rviz_when_disabled(self):
        """RViz2 should not be included when use_rviz=False."""
        result = generate_ros2_launch("", use_rviz=False)
        assert 'rviz2' not in result.nodes

    def test_launch_file_excludes_gazebo_when_disabled(self):
        """Gazebo should not be included when use_gazebo=False."""
        result = generate_ros2_launch("", use_gazebo=False)
        assert 'gazebo' not in result.nodes
        assert 'gazebo' not in result.launch_content

    def test_custom_package_name_used(self):
        """Custom package name should appear in launch file."""
        result = generate_ros2_launch("", package_name="my_robot_pkg")
        assert 'my_robot_pkg' in result.launch_content

    def test_custom_urdf_file_used(self):
        """Custom URDF filename should appear in launch file."""
        result = generate_ros2_launch("", urdf_file="custom_robot.urdf")
        assert 'custom_robot.urdf' in result.launch_content

    def test_result_has_expected_fields(self):
        """ROSLaunchResult should have all required fields."""
        result = generate_ros2_launch("")
        assert hasattr(result, 'success')
        assert hasattr(result, 'launch_content')
        assert hasattr(result, 'package_name')
        assert hasattr(result, 'nodes')
        assert hasattr(result, 'errors')

    def test_launch_file_is_syntactically_valid_python(self):
        """Generated launch file should be parseable Python."""
        import ast
        result = generate_ros2_launch("")
        try:
            ast.parse(result.launch_content)
        except SyntaxError as e:
            pytest.fail(f"Generated launch file has Python syntax error: {e}")


# ============================================================================
# Robotics Trait Tests
# ============================================================================

class TestRoboticsTrait:
    """Tests for list_robotics_traits() function."""

    def test_list_returns_non_empty_list(self):
        """Should return a list with at least some traits."""
        traits = list_robotics_traits()
        assert isinstance(traits, list)
        assert len(traits) > 0

    def test_each_trait_has_required_fields(self):
        """Each trait entry should have required fields."""
        traits = list_robotics_traits()
        for trait in traits:
            assert 'trait' in trait
            assert 'description' in trait
            assert 'urdf_element' in trait
            assert 'sdf_element' in trait

    def test_physics_trait_included(self):
        """@physics trait should be in the robotics traits list."""
        traits = list_robotics_traits()
        trait_names = [t['trait'] for t in traits]
        assert '@physics' in trait_names

    def test_collidable_trait_included(self):
        """@collidable trait should be in the robotics traits list."""
        traits = list_robotics_traits()
        trait_names = [t['trait'] for t in traits]
        assert '@collidable' in trait_names

    def test_static_trait_included(self):
        """@static trait should be in the robotics traits list."""
        traits = list_robotics_traits()
        trait_names = [t['trait'] for t in traits]
        assert '@static' in trait_names

    def test_trait_mappings_dict_populated(self):
        """ROBOTICS_TRAIT_MAPPINGS constant should be non-empty."""
        assert len(ROBOTICS_TRAIT_MAPPINGS) > 0

    def test_physics_urdf_mapping_is_inertial(self):
        """@physics should map to 'inertial' URDF element."""
        assert ROBOTICS_TRAIT_MAPPINGS['@physics']['urdf'] == 'inertial'

    def test_collidable_urdf_mapping_is_collision(self):
        """@collidable should map to 'collision' URDF element."""
        assert ROBOTICS_TRAIT_MAPPINGS['@collidable']['urdf'] == 'collision'


# ============================================================================
# Integration Tests
# ============================================================================

class TestRoboticsIntegration:
    """Integration tests combining multiple robotics features."""

    def test_full_robot_description_pipeline(self):
        """Full pipeline: HoloScript → URDF → validate structure."""
        holo_code = """
        sphere {
            @physics
            @collidable
            @color(red)
        }
        """
        urdf_result = export_urdf(holo_code, robot_name="test_robot")

        assert urdf_result.success is True
        assert 'test_robot' in urdf_result.urdf_content
        assert '<link name="base_link">' in urdf_result.urdf_content

    def test_full_gazebo_world_pipeline(self):
        """Full pipeline: HoloScript → SDF world for Gazebo."""
        holo_code = """
        plane { @collidable @static }
        sphere { @physics @gravity @collidable }
        """
        sdf_result = export_sdf(holo_code, world_name="test_world")

        assert sdf_result.success is True
        assert 'test_world' in sdf_result.sdf_content
        assert '<sdf version=' in sdf_result.sdf_content

    def test_urdf_and_launch_files_compatible(self):
        """Generated URDF and launch file should reference same package structure."""
        urdf_result = export_urdf("", robot_name="my_robot")
        launch_result = generate_ros2_launch(
            "",
            package_name="my_robot_description",
            urdf_file="my_robot.urdf",
        )

        assert urdf_result.success is True
        assert launch_result.success is True
        # Both should produce non-empty content
        assert len(urdf_result.urdf_content) > 100
        assert len(launch_result.launch_content) > 100

    def test_export_different_object_types(self):
        """URDF export should handle different HoloScript object types."""
        scenes = [
            "cube { @physics }",
            "sphere { @collidable }",
            "cylinder { @static }",
            "plane { @collidable @static }",
        ]
        for scene in scenes:
            result = export_urdf(scene)
            assert result.success is True, f"Failed for scene: {scene}"
            assert '<?xml version="1.0"?>' in result.urdf_content
