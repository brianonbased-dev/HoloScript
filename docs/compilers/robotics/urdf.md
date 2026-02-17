# URDF Compiler (ROS 2)
**Target**: `--target urdf` | **Output**: URDF XML | **Platform**: ROS 2 / Robot Description
Compiles HoloScript compositions to URDF (Unified Robot Description Format) for use with ROS 2.
## Usage
```bash
holoscript compile robot.holo --target urdf --output ./robot_description/
```
## Output Files
- `robot.urdf` - Complete robot description
- `robot.xacro` - Xacro macro version (when enabled)
## See Also
- [SDF Compiler](/compilers/robotics/sdf)
- [IoT Traits](/traits/iot)
- [Platform Overview](/compilers/)
