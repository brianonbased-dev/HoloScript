/**
 * Robotics & Industrial Traits (213 total)
 *
 * Comprehensive trait taxonomy for robotics domain, extending HoloScript's VR traits
 * with joint, actuator, sensor, end-effector, mobility, control, safety, power, and
 * communication traits. Enables declarative robot authoring for USD, URDF, SDF, MJCF.
 *
 * @category Robotics
 * @version 1.0.0
 * @reference uAA2++ Phase 5 (GROW) - Robotics Trait System Design
 */

// ============================================================================
// 1. JOINT SYSTEM TRAITS (42 total)
// ============================================================================

// Joint Types (7)
const JOINT_TYPE_TRAITS = [
  'joint_revolute', // Rotational joint (1-DOF rotation)
  'joint_prismatic', // Linear sliding joint (1-DOF translation)
  'joint_continuous', // Unlimited rotation (no limits)
  'joint_fixed', // No movement (welded)
  'joint_planar', // 2D planar movement
  'joint_floating', // 6-DOF free movement
  'joint_ball', // 3-DOF spherical joint
] as const;

// Joint Properties (12)
const JOINT_PROPERTY_TRAITS = [
  'joint_mimic', // Mimics another joint (coupled motion)
  'joint_calibration', // Has calibration routine
  'joint_homing', // Has home position
  'joint_soft_limits', // Software limits
  'joint_safety_controller', // Safety torque/force limits
  'joint_spring_loaded', // Passive spring return
  'joint_damped', // Has damping
  'joint_friction_compensated', // Active friction compensation
  'joint_backlash_compensated', // Backlash compensation
  'joint_coupled', // Coupled to another joint
  'joint_differential', // Differential mechanism
  'joint_redundant', // Redundant DOF
] as const;

// Joint Control Modes (8)
const JOINT_CONTROL_TRAITS = [
  'position_controlled', // Position control
  'velocity_controlled', // Velocity control
  'effort_controlled', // Torque/force control
  'impedance_controlled', // Impedance (compliant)
  'admittance_controlled', // Admittance control
  'hybrid_force_position', // Hybrid F/P control
  'gravity_compensated', // Gravity compensation
  'joint_trajectory', // Trajectory following
] as const;

// Transmission Mechanisms (15)
const TRANSMISSION_TRAITS = [
  'direct_drive', // No gearing
  'gear_train', // Gear reduction
  'belt_drive', // Belt/pulley
  'chain_drive', // Chain transmission
  'cable_drive', // Cable/tendon
  'harmonic_drive', // Harmonic drive (high reduction)
  'planetary_gear', // Planetary gearbox
  'cycloidal_drive', // Cycloidal gearbox
  'worm_gear', // Worm gear
  'rack_pinion', // Rack and pinion
  'screw_drive', // Lead/ball screw
  'differential_gear', // Differential
  'four_bar_linkage', // Four-bar linkage
  'scissor_lift', // Scissor mechanism
  'parallel_linkage', // Parallel linkage
] as const;

// ============================================================================
// 2. ACTUATOR & MOTOR TRAITS (28 total)
// ============================================================================

// Motor Types (12)
const MOTOR_TYPE_TRAITS = [
  'motor', // Generic motor
  'servo_motor', // Servo (closed-loop)
  'stepper_motor', // Stepper (open-loop)
  'dc_motor', // DC brushed
  'bldc_motor', // Brushless DC
  'ac_motor', // AC induction
  'linear_motor', // Direct linear
  'voice_coil_motor', // Voice coil
  'ultrasonic_motor', // Piezoelectric
  'hydraulic_actuator', // Hydraulic cylinder
  'pneumatic_actuator', // Pneumatic cylinder
  'shape_memory_actuator', // SMA actuator
] as const;

// Motor Feedback & Protection (16)
const MOTOR_FEEDBACK_TRAITS = [
  'encoder', // Rotary encoder
  'absolute_encoder', // Absolute position
  'incremental_encoder', // Incremental
  'hall_sensor', // Hall effect (commutation)
  'resolver', // Analog encoder
  'current_sensor', // Current sensing
  'temperature_sensor', // Temperature monitoring
  'brake', // Motor brake
  'holding_brake', // Passive brake
  'dynamic_brake', // Active braking
  'regenerative_brake', // Regen braking
  'thermal_protection', // Thermal overload
  'overcurrent_protection', // Current limit
  'encoder_index', // Index pulse
  'multi_turn_encoder', // Multi-turn absolute
  'commutation_sensor', // Commutation feedback
] as const;

// ============================================================================
// 3. SENSOR TRAITS (45 total)
// ============================================================================

// Force/Torque (8)
const FORCE_TORQUE_TRAITS = [
  'force_sensor', // Generic force
  'torque_sensor', // Torque (moment)
  'six_axis_force_torque', // 6-DOF F/T
  'load_cell', // 1-axis force
  'strain_gauge', // Strain measurement
  'tactile_sensor', // Touch/tactile
  'pressure_sensor', // Pressure
  'contact_sensor', // Binary contact
] as const;

// Vision (12)
const VISION_TRAITS = [
  'camera_rgb', // RGB camera
  'camera_depth', // Depth camera
  'camera_stereo', // Stereo pair
  'camera_thermal', // Thermal/IR
  'camera_event', // Event camera (DVS)
  'camera_hyperspectral', // Hyperspectral
  'camera_360', // 360-degree
  'camera_fisheye', // Fisheye lens
  'camera_tracking', // Visual tracking
  'structured_light', // Structured light projector
  'tof_sensor', // Time-of-Flight
  'photometric_stereo', // Photometric stereo
] as const;

// Range Sensing (10)
const RANGE_SENSING_TRAITS = [
  'lidar_2d', // 2D planar scan
  'lidar_3d', // 3D point cloud
  'radar', // RADAR
  'ultrasonic', // Ultrasonic rangefinder
  'laser_rangefinder', // Laser distance
  'proximity_sensor', // IR proximity
  'time_of_flight', // ToF range
  'sonar', // SONAR (underwater)
  'lidar_solid_state', // Solid-state LIDAR
  'lidar_spinning', // Mechanical LIDAR
] as const;

// Inertial & Position (10)
const INERTIAL_POSITION_TRAITS = [
  'imu', // IMU (6-9 DOF)
  'gyroscope', // Angular velocity
  'accelerometer', // Linear acceleration
  'magnetometer', // Compass
  'gps', // GPS receiver
  'rtk_gps', // RTK GPS (cm accuracy)
  'odometry', // Wheel odometry
  'visual_odometry', // Camera odometry
  'optical_flow', // Optical flow
  'barometer', // Barometric altitude
] as const;

// Environmental (5)
const ENVIRONMENTAL_SENSOR_TRAITS = [
  'temperature_ambient', // Ambient temp
  'humidity_sensor', // Humidity
  'air_quality_sensor', // Air quality
  'microphone', // Audio mic
  'microphone_array', // Mic array
] as const;

// ============================================================================
// 4. END EFFECTOR TRAITS (32 total)
// ============================================================================

// Grippers (15)
const GRIPPER_TRAITS = [
  'gripper', // Generic gripper
  'parallel_gripper', // Parallel jaw
  'angular_gripper', // Angular/claw
  'suction_gripper', // Vacuum suction
  'magnetic_gripper', // Electromagnetic
  'soft_gripper', // Soft/compliant
  'adaptive_gripper', // Underactuated
  'multi_finger_gripper', // 3+ fingers
  'two_finger_gripper', // 2 fingers
  'anthropomorphic_hand', // Human-like
  'pneumatic_gripper', // Pneumatic
  'servo_gripper', // Electric servo
  'needle_gripper', // Needle array
  'jamming_gripper', // Granular jamming
  'gecko_gripper', // Adhesive
] as const;

// Tool Interfaces (8)
const TOOL_INTERFACE_TRAITS = [
  'tool_changer', // Auto tool changer
  'quick_connect', // Quick disconnect
  'iso_flange', // ISO flange
  'electrical_connector', // Electrical pass-through
  'pneumatic_connector', // Pneumatic coupling
  'coolant_connector', // Coolant connection
  'data_connector', // Data bus
  'power_connector', // High-power
] as const;

// Manipulation Tools (9)
const TOOL_TRAITS = [
  'welding_torch', // Welding
  'spray_gun', // Paint/coating
  'drill', // Drilling
  'sander', // Sanding/grinding
  'saw', // Cutting
  'deburring_tool', // Deburring
  'screwdriver', // Powered screwdriver
  'riveting_tool', // Riveting
  'polishing_tool', // Polishing
] as const;

// ============================================================================
// 5. MOBILITY & LOCOMOTION TRAITS (28 total)
// ============================================================================

// Mobile Bases (10)
const MOBILE_BASE_TRAITS = [
  'mobile_base', // Generic base
  'differential_drive', // Two-wheel diff
  'omnidirectional', // Holonomic
  'mecanum_wheels', // Mecanum drive
  'ackermann_steering', // Car-like
  'skid_steer', // Tank tracks
  'synchro_drive', // Synchro drive
  'tricycle_drive', // Tricycle
  'bicycle_drive', // Bicycle model
  'omni_wheels', // Omni-wheel
] as const;

// Legged (10)
const LEGGED_TRAITS = [
  'legged', // Generic legged
  'biped', // Two legs
  'quadruped', // Four legs
  'hexapod', // Six legs
  'octoped', // Eight legs
  'bipedal_walker', // Walking biped
  'bipedal_runner', // Running biped
  'hopper', // Single-leg
  'sprawling_gait', // Sprawling posture
  'parasagittal_gait', // Upright posture
] as const;

// Aerial & Aquatic (8)
const AERIAL_AQUATIC_TRAITS = [
  'aerial', // Aerial robot
  'quadcopter', // Quadcopter drone
  'fixed_wing', // Fixed-wing
  'vtol', // VTOL
  'underwater', // ROV/AUV
  'amphibious', // Land + water
  'surface_vessel', // Water surface
  'submarine', // Submersible
] as const;

// ============================================================================
// 6. CONTROL & PLANNING TRAITS (20 total)
// ============================================================================

// Controllers (10)
const CONTROLLER_TRAITS = [
  'pid_controller', // PID
  'mpc_controller', // Model Predictive Control
  'adaptive_controller', // Adaptive
  'robust_controller', // H-infinity
  'lqr_controller', // LQR
  'sliding_mode', // Sliding mode
  'fuzzy_controller', // Fuzzy logic
  'neural_controller', // Neural network
  'iterative_learning', // ILC
  'passivity_based', // Passivity-based
] as const;

// Planning & Navigation (10)
const PLANNING_TRAITS = [
  'path_planner', // Path planning
  'trajectory_planner', // Trajectory optimization
  'motion_planner', // Motion planning (RRT, PRM)
  'inverse_kinematics', // IK solver
  'forward_kinematics', // FK computation
  'collision_checker', // Collision detection
  'obstacle_avoidance', // Obstacle avoidance
  'slam', // SLAM
  'localization', // Localization
  'navigation_stack', // Full nav stack
] as const;

// ============================================================================
// 7. SAFETY & COMPLIANCE TRAITS (18 total)
// ============================================================================

// Safety Features (10)
const SAFETY_TRAITS = [
  'safety_rated', // Safety-rated (SIL/PLd)
  'emergency_stop', // E-stop
  'safety_controller', // Safety PLC
  'light_curtain', // Safety light curtain
  'safety_scanner', // Safety laser scanner
  'collaborative', // Cobot
  'force_limiting', // Force limiting
  'speed_limiting', // Speed monitoring
  'workspace_monitoring', // Workspace intrusion
  'dual_channel_safety', // Redundant safety
] as const;

// Standards (8)
const STANDARDS_TRAITS = [
  'iso_ts_15066', // ISO/TS 15066 (cobots)
  'iso_10218', // ISO 10218 (industrial)
  'ce_marked', // CE marking
  'ul_certified', // UL certification
  'rohs_compliant', // RoHS
  'ip_rated', // IP rating
  'atex_certified', // ATEX (explosive)
  'cleanroom_rated', // Cleanroom (ISO 14644)
] as const;

// ============================================================================
// 8. POWER & ENERGY TRAITS (12 total)
// ============================================================================

const POWER_TRAITS = [
  'battery_powered', // Battery operated
  'lithium_battery', // Li-ion/LiPo
  'hot_swappable_battery', // Hot-swap battery
  'regenerative_power', // Energy regen
  'solar_powered', // Solar panels
  'wireless_charging', // Inductive charging
  'super_capacitor', // Super-cap storage
  'fuel_cell', // Hydrogen fuel cell
  'power_management', // Power management
  'low_power_mode', // Sleep mode
  'power_monitoring', // V/I monitoring
  'ups_backed', // UPS backup
] as const;

// ============================================================================
// 9. COMMUNICATION & NETWORKING TRAITS (18 total)
// ============================================================================

// Robot Interfaces (10)
const PROTOCOL_TRAITS = [
  'ros_compatible', // ROS/ROS2
  'ros2_dds', // ROS2 DDS
  'opc_ua', // OPC UA
  'modbus', // Modbus
  'profinet', // PROFINET
  'ethercat', // EtherCAT
  'canopen', // CANopen
  'mqtt', // MQTT
  'rest_api', // REST API
  'grpc', // gRPC
] as const;

// Connectivity (8)
const CONNECTIVITY_TRAITS = [
  'wifi', // WiFi
  'ethernet', // Wired Ethernet
  'five_g', // 5G
  'bluetooth', // Bluetooth/BLE
  'zigbee', // Zigbee mesh
  'lora', // LoRa
  'nfc', // NFC
  'mesh_network', // Mesh networking
] as const;

// ============================================================================
// COMBINED ARRAY
// ============================================================================

export const ROBOTICS_INDUSTRIAL_TRAITS = [
  // Joint System (42)
  ...JOINT_TYPE_TRAITS,
  ...JOINT_PROPERTY_TRAITS,
  ...JOINT_CONTROL_TRAITS,
  ...TRANSMISSION_TRAITS,

  // Actuators & Motors (28)
  ...MOTOR_TYPE_TRAITS,
  ...MOTOR_FEEDBACK_TRAITS,

  // Sensors (45)
  ...FORCE_TORQUE_TRAITS,
  ...VISION_TRAITS,
  ...RANGE_SENSING_TRAITS,
  ...INERTIAL_POSITION_TRAITS,
  ...ENVIRONMENTAL_SENSOR_TRAITS,

  // End Effectors (32)
  ...GRIPPER_TRAITS,
  ...TOOL_INTERFACE_TRAITS,
  ...TOOL_TRAITS,

  // Mobility (28)
  ...MOBILE_BASE_TRAITS,
  ...LEGGED_TRAITS,
  ...AERIAL_AQUATIC_TRAITS,

  // Control & Planning (20)
  ...CONTROLLER_TRAITS,
  ...PLANNING_TRAITS,

  // Safety & Compliance (18)
  ...SAFETY_TRAITS,
  ...STANDARDS_TRAITS,

  // Power & Energy (12)
  ...POWER_TRAITS,

  // Communication (18)
  ...PROTOCOL_TRAITS,
  ...CONNECTIVITY_TRAITS,
] as const;

// Re-export individual categories for granular access
export {
  JOINT_TYPE_TRAITS,
  JOINT_PROPERTY_TRAITS,
  JOINT_CONTROL_TRAITS,
  TRANSMISSION_TRAITS,
  MOTOR_TYPE_TRAITS,
  MOTOR_FEEDBACK_TRAITS,
  FORCE_TORQUE_TRAITS,
  VISION_TRAITS,
  RANGE_SENSING_TRAITS,
  INERTIAL_POSITION_TRAITS,
  ENVIRONMENTAL_SENSOR_TRAITS,
  GRIPPER_TRAITS,
  TOOL_INTERFACE_TRAITS,
  TOOL_TRAITS,
  MOBILE_BASE_TRAITS,
  LEGGED_TRAITS,
  AERIAL_AQUATIC_TRAITS,
  CONTROLLER_TRAITS,
  PLANNING_TRAITS,
  SAFETY_TRAITS,
  STANDARDS_TRAITS,
  POWER_TRAITS,
  PROTOCOL_TRAITS,
  CONNECTIVITY_TRAITS,
};
