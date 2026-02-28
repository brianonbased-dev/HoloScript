// Scene templates — full HoloScript world starters
// Used by SimpleAssetLibrary "Templates" tab and QuickStartWizard

export interface SceneTemplate {
  id: string;
  name: string;
  emoji: string;
  category: 'game' | 'social' | 'art' | 'tabletop' | 'education' | 'healthcare' | 'ecommerce' | 'industrial' | 'sports';
  desc: string;
  tags: string[];
  code: string;
}

export const SCENE_TEMPLATES: SceneTemplate[] = [
  // ── GAMES ───────────────────────────────────────────────────────────────
  {
    id: 'battle-royale',
    name: 'Battle Royale Island',
    emoji: '⚔️',
    category: 'game',
    desc: '100-player island with shrinking zone, loot, and spawn points',
    tags: ['Game', 'Multiplayer', 'Action'],
    code: `world "Battle Royale Island" {
  @setting("island")
  @skybox("overcast")
  @lighting("dramatic")
  @max_players(100)

  object "SafeZone" { @zone @shrink_interval(120) @initial_radius(500) }
  object "SpawnPoints" { @spawn_grid(10, 10) @random_offset(20) }
  object "LootCrate" { @loot_table("common") @count(50) @random_scatter }
  object "LootCrate_Rare" { @loot_table("rare") @count(10) @random_scatter }
  object "HighGround_Hill" { @position(0, 30, 0) @cover }
  object "Bunker" { @position(80, 0, -40) @interior @loot_table("epic") }

  game_logic {
    @win_condition("last_player_standing")
    @shrinking_zone
    @kill_feed
    @leaderboard
  }
}`,
  },
  {
    id: 'obby-tower',
    name: 'Parkour Tower (Obby)',
    emoji: '🧗',
    category: 'game',
    desc: '50-level obstacle tower with checkpoints and a timer',
    tags: ['Game', 'Parkour', 'Challenge'],
    code: `world "Parkour Tower" {
  @setting("sky")
  @skybox("sunset")
  @lighting("warm")
  @max_players(20)

  object "StartPlatform" { @position(0, 0, 0) @size(5, 1, 5) }
  object "Checkpoint_1" { @checkpoint(1) @position(0, 20, 0) }
  object "Checkpoint_2" { @checkpoint(2) @position(0, 60, 0) }
  object "Checkpoint_3" { @checkpoint(3) @position(0, 120, 0) }
  object "FinishPlatform" { @position(0, 200, 0) @size(10, 1, 10) @finish }
  object "MovingPlatforms" { @moving @count(30) @auto_place }
  object "BouncePads" { @bounce @count(5) @random_scatter }

  game_logic {
    @win_condition("reach_finish")
    @timer
    @leaderboard("fastest_time")
    @respawn_at_checkpoint
  }
}`,
  },
  {
    id: 'murder-mystery',
    name: 'Murder Mystery Mansion',
    emoji: '🕵️',
    category: 'game',
    desc: '6–10 player social deduction in a haunted mansion',
    tags: ['Game', 'Social', 'Mystery'],
    code: `world "Murder Mystery Mansion" {
  @setting("gothic_interior")
  @skybox("night")
  @lighting("dim_candles")
  @player_range(6, 10)

  object "Library" { @room @position(-15, 0, 0) @interior }
  object "Kitchen" { @room @position(15, 0, 0) @interior }
  object "Ballroom" { @room @position(0, 0, 15) @interior @large }
  object "Study" { @room @position(0, 0, -15) @interior @secret_passage("Library") }
  object "Attic" { @room @position(0, 10, 0) @interior @dark }
  object "Clue_Knife" { @clue @random_room }
  object "Clue_Letter" { @clue @random_room }
  object "Clue_Key" { @clue @random_room }

  game_logic {
    @roles(["murderer:1", "detective:1", "innocent:rest"])
    @win_condition_murderer("eliminate_all_before_caught")
    @win_condition_detective("identify_murderer")
    @discussion_phase(60)
    @voting_phase(30)
  }
}`,
  },
  {
    id: 'zombie-survival',
    name: 'Zombie Survival',
    emoji: '🧟',
    category: 'game',
    desc: 'Survive endless zombie waves with friends',
    tags: ['Game', 'Horror', 'Survival'],
    code: `world "Zombie Survival" {
  @setting("abandoned_city")
  @skybox("red_dusk")
  @lighting("eerie")
  @max_players(8)

  object "SafeHouse" { @position(0, 0, 0) @interior @fortifiable }
  object "Barricade_North" { @position(0, 0, 20) @destructible }
  object "Barricade_South" { @position(0, 0, -20) @destructible }
  object "WeaponStash" { @position(5, 0, 0) @loot_table("weapons") }
  object "AmmoBox" { @count(6) @random_scatter }
  object "Generator" { @position(-10, 0, 5) @interactive @powers("Lights") }

  game_logic {
    @wave_spawner(zombies: "ZombieHorde")
    @wave_count(infinite)
    @difficulty_scaling
    @win_condition("survive_waves")
    @leaderboard("most_waves")
  }
}`,
  },
  {
    id: 'team-deathmatch',
    name: 'Team Deathmatch Arena',
    emoji: '🏆',
    category: 'game',
    desc: '5v5 combat arena with respawns and scoreboard',
    tags: ['Game', 'PvP', 'Team'],
    code: `world "Team Deathmatch Arena" {
  @setting("futuristic_arena")
  @skybox("neon_city")
  @lighting("dramatic")
  @player_range(4, 10)

  object "TeamA_Spawn" { @spawn @team("A") @position(-30, 0, 0) }
  object "TeamB_Spawn" { @spawn @team("B") @position(30, 0, 0) }
  object "Cover_Block1" { @cover @position(0, 0, 10) }
  object "Cover_Block2" { @cover @position(0, 0, -10) }
  object "Cover_Block3" { @cover @position(-10, 0, 0) }
  object "Cover_Block4" { @cover @position(10, 0, 0) }
  object "HighGround" { @position(0, 5, 0) @platform }
  object "WeaponPickup" { @count(8) @random_scatter @loot_table("arena_weapons") }

  game_logic {
    @win_condition("score_limit:50")
    @respawn_time(5)
    @team_scoreboard
    @friendly_fire(false)
    @time_limit(600)
  }
}`,
  },

  // ── SOCIAL ───────────────────────────────────────────────────────────────
  {
    id: 'coffee-shop',
    name: 'Coffee Shop Hangout',
    emoji: '☕',
    category: 'social',
    desc: 'Cozy café with seating, music, and ambient atmosphere',
    tags: ['Social', 'Chill', 'Hangout'],
    code: `world "The Pixel Café" {
  @setting("cozy_interior")
  @skybox("golden_hour")
  @lighting("warm_ambient")
  @max_players(20)

  object "Counter" { @position(0, 0, -8) @interactive @purchase_menu }
  object "Table_Window1" { @position(-4, 0, 2) @seating(2) }
  object "Table_Window2" { @position(4, 0, 2) @seating(2) }
  object "CouchArea" { @position(0, 0, 6) @seating(4) @lounge }
  object "Fireplace" { @position(-10, 0, 0) @warm_glow @ambient }
  object "Chalkboard" { @position(0, 2, -10) @writable }
  object "JukeBox" { @position(8, 0, -6) @interactive @music_player }

  npc "Barista" { @position(0, 0, -7) @dialogue("welcome") @role("Friendly") }
}`,
  },
  {
    id: 'concert-venue',
    name: 'Concert Venue',
    emoji: '🎤',
    category: 'social',
    desc: 'Live performance space with stage, lighting, and audience area',
    tags: ['Social', 'Music', 'Events'],
    code: `world "Holo Concert Hall" {
  @setting("concert_hall")
  @skybox("night_lights")
  @lighting("stage_lights")
  @max_players(200)

  object "Stage" { @position(0, 2, -20) @large @platform }
  object "StageLights" { @dynamic_lighting @sync_to_music }
  object "MainFloor" { @position(0, 0, 0) @size(30, 0, 20) @standing_area }
  object "Balcony_Left" { @position(-20, 5, 0) @seating(20) }
  object "Balcony_Right" { @position(20, 5, 0) @seating(20) }
  object "Bar" { @position(0, 0, 15) @interactive @purchase_menu }
  object "DJ_Booth" { @position(0, 2, -18) @interactive @music_player }
}`,
  },

  // ── ART ────────────────────────────────────────────────────────────────
  {
    id: 'art-gallery',
    name: 'Art Gallery / Museum',
    emoji: '🖼️',
    category: 'art',
    desc: 'White-cube gallery with display walls and lighting',
    tags: ['Art', 'Gallery', 'Museum'],
    code: `world "Holo Gallery" {
  @setting("white_cube")
  @skybox("neutral")
  @lighting("gallery_spot")
  @max_players(50)

  object "WestWall" { @position(-12, 0, 0) @display_wall @size(1, 4, 20) }
  object "EastWall" { @position(12, 0, 0) @display_wall @size(1, 4, 20) }
  object "NorthWall" { @position(0, 0, -12) @display_wall @size(20, 4, 1) }
  object "Pedestal_1" { @position(-5, 0, 0) @pedestal }
  object "Pedestal_2" { @position(0, 0, 0) @pedestal }
  object "Pedestal_3" { @position(5, 0, 0) @pedestal }
  object "SpotLight_Row" { @count(8) @auto_place @gallery_light }
  object "InfoPanel" { @position(0, 1.5, -11) @readable @text("Welcome to the gallery") }
}`,
  },

  // ── TABLETOP ────────────────────────────────────────────────────────────
  {
    id: 'dnd-dungeon',
    name: 'D&D Dungeon Crawl',
    emoji: '🏰',
    category: 'tabletop',
    desc: 'Classic dungeon: entrance, boss room, treasure, traps — for 2–6 players',
    tags: ['D&D', 'Tabletop', 'Fantasy'],
    code: `world "Classic Dungeon" {
  @setting("medieval")
  @skybox("underground")
  @lighting("torchlight")
  @player_range(2, 6)

  object "Entrance Hall" { @room @position(0, 0, 0) @size(10, 4, 10) }
  object "Treasure Room" { @room @position(20, 0, 0) @size(8, 4, 8) @locked }
  object "Boss Arena" { @room @position(0, 0, -25) @size(15, 6, 15) @large }
  object "Puzzle Chamber" { @room @position(-15, 0, 0) @size(8, 4, 8) @puzzle }
  object "Trap Hallway" { @corridor @position(0, 0, -12) @size(4, 4, 14) @traps }
  object "DiceTray" { @position(0, 1, 0) @interactive @dice_roller }
  object "InitiativeTracker" { @position(5, 1.5, 5) @ui_element }

  npc "Dungeon Boss" { @position(0, 0, -25) @role("Hostile") @hp(200) @combat }
  npc "Merchant Ghost" { @position(10, 0, 0) @role("Friendly") @shop }
}`,
  },
  {
    id: 'escape-room',
    name: 'Escape Room',
    emoji: '🎭',
    category: 'tabletop',
    desc: '4–8 players, 60 minutes to solve puzzles and escape',
    tags: ['Puzzle', 'Escape', 'Co-op'],
    code: `world "The Lost Lab" {
  @setting("laboratory")
  @skybox("industrial")
  @lighting("flickering")
  @player_range(2, 8)

  object "MainRoom" { @room @position(0, 0, 0) @size(12, 3, 12) @start }
  object "ServerRoom" { @room @position(15, 0, 0) @size(8, 3, 8) @locked("code:1234") }
  object "VaultDoor" { @position(0, 0, -12) @size(2, 3, 0.5) @locked("key:vault_key") }
  object "Puzzle_Terminal" { @position(3, 1, 3) @interactive @puzzle("code_entry") }
  object "Hidden_Key" { @position(-5, 0.5, 4) @hidden @clue }
  object "SafeCracker" { @position(-3, 1, -3) @interactive @puzzle("combination") }
  object "Timer" { @position(0, 3, 0) @countdown(3600) @visible }

  game_logic {
    @win_condition("reach_exit")
    @time_limit(3600)
    @hint_system
  }
}`,
  },

  // ── EDUCATION ─────────────────────────────────────────────────────────────
  {
    id: 'vr-classroom',
    name: 'VR Classroom',
    emoji: '🎓',
    category: 'education',
    desc: 'Virtual classroom with whiteboard, seats, and student interactions',
    tags: ['Education', 'VR', 'School'],
    code: `world "VR Classroom" {
  @setting("modern_interior")
  @skybox("clear_day")
  @lighting("bright_natural")
  @max_players(30)

  object "Whiteboard" { @position(0, 2, -8) @writable @size(6, 3, 0.1) @interactive }
  object "TeacherDesk" { @position(0, 0, -6) @interactive }
  object "StudentDesks" { @count(25) @grid(5, 5) @spacing(2.5) @seating(1) }
  object "ProjectionScreen" { @position(0, 3, -8.5) @media_player @size(5, 3, 0.05) }
  object "GlobeModel" { @position(-5, 1, -6) @interactive @rotate_drag }
  object "BookShelf" { @position(6, 0, -7) @loot_table("textbooks") }

  npc "Teacher" { @position(0, 0, -5) @dialogue("lesson_01") @role("Instructor") }
}`,
  },
  {
    id: 'science-lab',
    name: 'Science Lab Simulator',
    emoji: '🔬',
    category: 'education',
    desc: 'Interactive chemistry and physics lab with experiments',
    tags: ['Education', 'Science', 'Simulation'],
    code: `world "Science Lab" {
  @setting("laboratory")
  @skybox("neutral")
  @lighting("fluorescent")
  @max_players(12)

  object "LabBench_Center" { @position(0, 0, 0) @interactive @size(4, 1, 2) }
  object "BunsenBurner" { @position(-1, 1, 0) @interactive @fire_sim @temperature_control }
  object "Beakers" { @count(6) @position(0, 1, 0) @interactive @fluid_sim }
  object "Microscope" { @position(2, 1, 0) @interactive @zoom_view }
  object "PeriodicTable" { @position(0, 2, -5) @readable @interactive }
  object "SafetyShower" { @position(5, 0, -4) @interactive @emergency }
  object "FumeHood" { @position(-5, 0, -4) @interior @ventilation }

  game_logic {
    @experiment_system
    @safety_score
    @lab_report_generator
  }
}`,
  },

  // ── HEALTHCARE ────────────────────────────────────────────────────────────
  {
    id: 'medical-training',
    name: 'Medical Training Suite',
    emoji: '🏥',
    category: 'healthcare',
    desc: 'VR medical training room with patient simulator and vital monitors',
    tags: ['Healthcare', 'Medical', 'Training'],
    code: `world "Medical Training Suite" {
  @setting("hospital")
  @skybox("neutral")
  @lighting("clinical")
  @max_players(6)

  object "PatientBed" { @position(0, 0, 0) @interactive }
  object "PatientMannequin" { @position(0, 1, 0) @interactive @vital_signs @anatomy_overlay }
  object "VitalMonitor" { @position(2, 1.5, 0) @ui_element @real_time_data }
  object "MedicalCart" { @position(-2, 0, 0) @loot_table("medical_tools") @interactive }
  object "Defibrillator" { @position(-2, 1, 0.5) @interactive @emergency_tool }
  object "XRayViewer" { @position(0, 2, -4) @media_player @interactive }
  object "HandSanitizer" { @position(3, 1, -3) @interactive }

  npc "Instructor" { @position(3, 0, 2) @dialogue("procedure_guide") @role("Supervisor") }
}`,
  },
  {
    id: 'anatomy-explorer',
    name: 'Anatomy Explorer',
    emoji: '🫀',
    category: 'healthcare',
    desc: 'Interactive 3D human anatomy with layered systems',
    tags: ['Healthcare', 'Anatomy', 'VR'],
    code: `world "Anatomy Explorer" {
  @setting("void")
  @skybox("dark_studio")
  @lighting("soft_directional")
  @max_players(10)

  object "SkeletalSystem" { @position(0, 0, 0) @layer("skeleton") @transparent @interactive }
  object "MuscularSystem" { @position(0, 0, 0) @layer("muscles") @transparent @interactive }
  object "CirculatorySystem" { @position(0, 0, 0) @layer("circulatory") @animated @interactive }
  object "NervousSystem" { @position(0, 0, 0) @layer("nervous") @transparent @interactive }
  object "OrganSystem" { @position(0, 0, 0) @layer("organs") @interactive }
  object "InfoPanel" { @position(3, 2, 0) @ui_element @context_sensitive }
  object "LayerControl" { @position(-3, 2, 0) @ui_element @toggle_layers }

  game_logic {
    @quiz_mode
    @layer_isolation
    @label_system
  }
}`,
  },

  // ── E-COMMERCE ────────────────────────────────────────────────────────────
  {
    id: 'virtual-store',
    name: 'Virtual Storefront',
    emoji: '🛍️',
    category: 'ecommerce',
    desc: '3D product showroom with interactive shelves and checkout',
    tags: ['E-commerce', 'Shopping', 'VR'],
    code: `world "Virtual Store" {
  @setting("modern_retail")
  @skybox("bright_studio")
  @lighting("retail_lighting")
  @max_players(50)

  object "Entrance" { @position(0, 0, 15) @door @automatic }
  object "ShelfRow_A" { @position(-6, 0, 0) @display_shelf @count(4) @spacing(3) }
  object "ShelfRow_B" { @position(6, 0, 0) @display_shelf @count(4) @spacing(3) }
  object "FeaturedDisplay" { @position(0, 1.5, -5) @pedestal @spotlight @rotating }
  object "PriceTag" { @count(20) @auto_place @ui_element @purchase }
  object "ShoppingCart" { @position(0, 0, 12) @interactive @inventory_ui }
  object "Checkout" { @position(0, 0, -12) @interactive @payment_flow }

  npc "StoreAssistant" { @position(4, 0, 8) @dialogue("help") @role("Friendly") }
}`,
  },
  {
    id: 'product-configurator',
    name: 'Product Configurator',
    emoji: '🚗',
    category: 'ecommerce',
    desc: 'Interactive 3D product customizer with color/material options',
    tags: ['E-commerce', 'Configurator', '3D'],
    code: `world "Product Configurator" {
  @setting("minimal_studio")
  @skybox("bright_studio")
  @lighting("three_point")
  @max_players(1)

  object "ProductModel" { @position(0, 0.5, 0) @interactive @rotate_drag @configurable }
  object "ColorPicker" { @position(-3, 1.5, 0) @ui_element @color_palette }
  object "MaterialPicker" { @position(-3, 0.5, 0) @ui_element @material_options }
  object "TurntableBase" { @position(0, 0, 0) @rotating @speed(10) }
  object "CameraPresets" { @ui_element @camera_positions(["front", "side", "top", "detail"]) }
  object "SpecSheet" { @position(3, 1.5, 0) @ui_element @product_details }
  object "AddToCartBtn" { @position(3, 0.5, 0) @ui_element @purchase }
}`,
  },

  // ── INDUSTRIAL ────────────────────────────────────────────────────────────
  {
    id: 'factory-floor',
    name: 'Smart Factory Floor',
    emoji: '🏭',
    category: 'industrial',
    desc: 'Industrial IoT digital twin with conveyor belts and robot arms',
    tags: ['Industrial', 'IoT', 'Digital Twin'],
    code: `world "Smart Factory" {
  @setting("industrial")
  @skybox("overcast")
  @lighting("industrial_harsh")
  @max_players(10)

  object "ConveyorBelt_Main" { @position(0, 0.5, 0) @conveyor_belt(speed: 2, direction: "x") @size(20, 0.5, 2) }
  object "ConveyorBelt_Branch" { @position(8, 0.5, -4) @conveyor_belt(speed: 1.5, direction: "z") @size(8, 0.5, 2) }
  object "RobotArm_A" { @position(-5, 0, 2) @robot_arm(dof: 6, reach: 1.2) @sensor(type: "proximity") }
  object "RobotArm_B" { @position(5, 0, 2) @robot_arm(dof: 4, reach: 0.8) @sensor(type: "camera") }
  object "QualityCamera" { @position(0, 3, 2) @sensor(type: "camera") @ai_inspection }
  object "ControlPanel" { @position(-8, 0, -3) @ui_element @real_time_data @interactive }
  object "StorageRack" { @position(10, 0, -5) @inventory @count(4) }
  object "SafetyFence_Perimeter" { @position(0, 0, 6) @safety_fence(height: 2, color: "#ff6600") }
  object "SafetyFence_RobotZone" { @position(-5, 0, 4) @safety_fence(height: 1.5, color: "#ffcc00") }

  game_logic {
    @telemetry_dashboard
    @alert_system
    @production_counter
    @emergency_stop(radius: 5)
  }
}`,
  },
  {
    id: 'warehouse-layout',
    name: 'Warehouse Layout',
    emoji: '📦',
    category: 'industrial',
    desc: 'Logistics training with forklift controls and inventory management',
    tags: ['Industrial', 'Logistics', 'Training'],
    code: `world "Warehouse Layout" {
  @setting("warehouse")
  @skybox("overcast")
  @lighting("industrial")
  @max_players(4)

  object "ShelvingUnit" { @count(12) @grid(4, 3) @spacing(5) @size(3, 6, 1) }
  object "Forklift" { @position(0, 0, 10) @drivable @physics_vehicle @interactive }
  object "LoadingDock" { @position(0, 0, -15) @zone @truck_bay }
  object "PalletStack" { @count(20) @random_scatter @physics_object }
  object "InventoryTerminal" { @position(-10, 1.5, 0) @interactive @ui_element @inventory }
  object "SafetyVest_Pickup" { @position(-12, 1, 5) @pickup @required }
  object "WarehouseFence" { @position(0, 0, -18) @safety_fence(height: 2.5, color: "#cccccc") }

  game_logic {
    @order_system
    @timer
    @accuracy_score
    @safety_violations
  }
}`,
  },
  {
    id: 'clean-room-lab',
    name: 'Clean Room Lab',
    emoji: '🔬',
    category: 'industrial',
    desc: 'ISO Class 5 cleanroom for semiconductor or pharma simulation',
    tags: ['Industrial', 'Cleanroom', 'Semiconductor'],
    code: `world "Clean Room Lab" {
  @setting("cleanroom")
  @skybox("white")
  @lighting("clinical_white")
  @max_players(6)

  object "AirShower" { @position(0, 0, -8) @interactive @decontamination }
  object "LaminarFlowHood" { @position(-4, 0, 0) @sensor(type: "airflow") @clean_zone }
  object "Microscope" { @position(2, 1, -2) @interactive @zoom(100) }
  object "WaferStage" { @position(0, 0.5, 0) @conveyor_belt(speed: 0.1, direction: "x") }
  object "GloveBox" { @position(4, 0, 0) @interactive @sealed_environment }
  object "ParticleSensor" { @position(0, 3, 0) @sensor(type: "particle") @real_time_data }
  object "Airlock" { @position(0, 0, -10) @safety_fence(height: 3, color: "#0066ff") }

  game_logic {
    @contamination_tracking
    @gowning_protocol
    @particle_count_monitor
  }
}`,
  },
  {
    id: 'oil-refinery-sim',
    name: 'Oil Refinery Simulation',
    emoji: '⛽',
    category: 'industrial',
    desc: 'Process plant with pipelines, reactors, and safety systems',
    tags: ['Industrial', 'Oil & Gas', 'Process'],
    code: `world "Oil Refinery" {
  @setting("industrial_outdoor")
  @skybox("overcast")
  @lighting("dramatic")
  @max_players(8)

  object "DistillationColumn" { @position(0, 0, 0) @size(4, 20, 4) @sensor(type: "temp") @sensor(type: "pressure") }
  object "Pipeline_Main" { @position(-10, 2, 0) @conveyor_belt(speed: 3, direction: "x") @size(30, 0.5, 0.5) }
  object "ReactorVessel" { @position(10, 0, 0) @size(3, 8, 3) @sensor(type: "temp") }
  object "StorageTank" { @position(-15, 0, 10) @count(3) @spacing(8) @size(6, 10, 6) }
  object "FlareTower" { @position(20, 0, -10) @size(1, 30, 1) @particle_emitter }
  object "ControlRoom" { @position(-20, 0, 0) @interior @interactive @ui_element }
  object "PerimeterFence" { @position(0, 0, 25) @safety_fence(height: 3, color: "#ff0000") }
  object "GasDetector" { @count(6) @random_scatter @sensor(type: "gas") @alarm }

  game_logic {
    @process_monitoring
    @emergency_shutdown
    @environmental_compliance
    @shift_handover
  }
}`,
  },

  // ── SPORTS ────────────────────────────────────────────────────────────────
  {
    id: 'sports-arena',
    name: 'Sports Arena',
    emoji: '🏟️',
    category: 'sports',
    desc: 'Multiplayer sports arena with scoreboard and spectator stands',
    tags: ['Sports', 'Multiplayer', 'Arena'],
    code: `world "Sports Arena" {
  @setting("stadium")
  @skybox("clear_day")
  @lighting("stadium_lights")
  @max_players(22)

  object "Field" { @position(0, 0, 0) @size(50, 0.1, 30) @ground @markings }
  object "GoalA" { @position(-25, 0, 0) @goal @team("A") }
  object "GoalB" { @position(25, 0, 0) @goal @team("B") }
  object "Ball" { @position(0, 0.5, 0) @physics_object @kickable }
  object "Scoreboard" { @position(0, 12, -16) @ui_element @auto_score }
  object "SpectatorStands" { @position(0, 3, -18) @seating(500) @crowd_audio }
  object "JumboScreen" { @position(0, 10, -17) @media_player @sync_to_game }

  game_logic {
    @match_timer(5400)
    @team_scoreboard
    @offside_detection
    @replay_system
  }
}`,
  },
  {
    id: 'racing-track',
    name: 'Racing Circuit',
    emoji: '🏎️',
    category: 'sports',
    desc: 'Vehicle racing with checkpoints, power-ups, and lap timer',
    tags: ['Sports', 'Racing', 'Vehicles'],
    code: `world "Racing Circuit" {
  @setting("outdoor_track")
  @skybox("sunset")
  @lighting("golden_hour")
  @max_players(8)

  object "TrackSurface" { @position(0, 0, 0) @spline_path @width(12) @length(2000) }
  object "StartGrid" { @position(0, 0, 0) @spawn @grid(2, 4) @spacing(3) }
  object "Checkpoint_1" { @checkpoint(1) @position(200, 0, 100) }
  object "Checkpoint_2" { @checkpoint(2) @position(400, 0, -50) }
  object "Checkpoint_3" { @checkpoint(3) @position(600, 0, 100) }
  object "FinishLine" { @position(0, 0, 0) @finish @lap_counter }
  object "SpeedBoost" { @count(4) @random_scatter @power_up @boost }
  object "Barrier" { @count(20) @along_path @destructible }

  game_logic {
    @lap_count(3)
    @timer
    @leaderboard("fastest_lap")
    @collision_physics
  }
}`,
  },
  {
    id: 'fitness-gym',
    name: 'VR Fitness Gym',
    emoji: '💪',
    category: 'sports',
    desc: 'Virtual gym with exercise stations and rep tracking',
    tags: ['Sports', 'Fitness', 'Health'],
    code: `world "VR Fitness Gym" {
  @setting("modern_gym")
  @skybox("bright_studio")
  @lighting("bright_natural")
  @max_players(10)

  object "TreadmillRow" { @position(-6, 0, 0) @count(4) @spacing(2) @interactive @cardio }
  object "WeightRack" { @position(6, 0, -5) @interactive @weight_selection }
  object "YogaMat" { @position(0, 0, 5) @count(6) @grid(3, 2) @spacing(2) }
  object "PunchingBag" { @position(-8, 1.5, 5) @physics_object @interactive }
  object "Mirror" { @position(8, 1.5, -8) @reflective @size(4, 3, 0.1) }
  object "Scoreboard" { @position(0, 3, -8) @ui_element @rep_counter @calorie_tracker }
  object "WaterStation" { @position(-10, 0, 0) @interactive @heal }

  game_logic {
    @workout_plan
    @rep_tracking
    @achievement_system
    @heart_rate_sync
  }
}`,
  },
  {
    id: 'swim-center',
    name: 'Olympic Swimming Pool',
    emoji: '🏊',
    category: 'sports',
    desc: 'Competitive pool with lanes, diving board, and timing system',
    tags: ['Sports', 'Swimming', 'Competition'],
    code: `world "Olympic Swimming Pool" {
  @setting("aquatic_center")
  @skybox("clear_day")
  @lighting("bright_natural")
  @max_players(16)

  object "Pool" { @position(0, -1, 0) @size(50, 2, 25) @fluid_sim @lanes(8) }
  object "StartBlocks" { @count(8) @grid(8, 1) @spacing(3.125) @interactive }
  object "DivingBoard_Low" { @position(-20, 3, 0) @interactive @physics_object }
  object "DivingBoard_High" { @position(-20, 10, 0) @interactive @physics_object }
  object "TimingBoard" { @position(25, 4, -13) @ui_element @race_timer }
  object "SpectatorBleachers" { @position(0, 2, -15) @seating(200) }
  object "WaterFountain" { @position(28, 0, 0) @interactive }

  game_logic {
    @race_system
    @lane_tracking
    @split_times
    @photo_finish
  }
}`,
  },
  {
    id: 'climbing-wall',
    name: 'Indoor Climbing Wall',
    emoji: '🧗',
    category: 'sports',
    desc: 'Bouldering and lead climbing with route grading',
    tags: ['Sports', 'Climbing', 'Fitness'],
    code: `world "Climbing Center" {
  @setting("indoor_sports")
  @skybox("neutral")
  @lighting("bright_natural")
  @max_players(12)

  object "BoulderWall_A" { @position(-8, 0, -5) @size(10, 5, 0.5) @climbable @route(grade: "V3") }
  object "BoulderWall_B" { @position(0, 0, -5) @size(10, 5, 0.5) @climbable @route(grade: "V5") }
  object "LeadWall" { @position(8, 0, -5) @size(6, 15, 0.5) @climbable @route(grade: "5.11a") @rope }
  object "CrashPad" { @position(0, 0, -3) @size(28, 0.5, 8) @physics(restitution: 0.8) }
  object "ChalkBag" { @position(-12, 1, 0) @interactive @pickup }
  object "TimerDisplay" { @position(0, 8, -5.5) @ui_element @speed_timer }

  game_logic {
    @route_tracker
    @send_counter
    @achievement_system
    @leaderboard("fastest_ascent")
  }
}`,
  },

  // ── ART (Additional) ────────────────────────────────────────────────────
  {
    id: 'sculpture-garden',
    name: 'Immersive Sculpture Garden',
    emoji: '🗿',
    category: 'art',
    desc: 'Outdoor sculpture park with interactive installations and ambient audio',
    tags: ['Art', 'Sculpture', 'Immersive'],
    code: `world "Sculpture Garden" {
  @setting("garden")
  @skybox("golden_hour")
  @lighting("warm_natural")
  @max_players(30)

  object "SculptureA" { @position(-8, 0, 0) @pedestal @interactive @rotate_drag @glow }
  object "SculptureB" { @position(0, 0, -6) @pedestal @interactive @clickable @audio_reactive }
  object "SculptureC" { @position(8, 0, 0) @pedestal @interactive @particle_emitter(type: "sparkle") }
  object "WaterFeature" { @position(0, 0, 6) @fluid_sim @ambient(sound: "water_flow.mp3") }
  object "PathLights" { @count(20) @along_path @emissive @timed(on_at: "dusk") }
  object "BenchRow" { @position(0, 0, 10) @count(4) @spacing(4) @seating(1) }
  object "InfoKiosk" { @position(-12, 0, 0) @interactive @readable @context_sensitive }
  object "AmbientSoundscape" { @ambient(sound: "birds_garden.mp3", blend_radius: 40) }
}`,
  },
  {
    id: 'music-visualizer',
    name: 'Music Visualizer World',
    emoji: '🎵',
    category: 'art',
    desc: 'Audio-reactive 3D environment with beat-driven geometry',
    tags: ['Art', 'Music', 'Generative'],
    code: `world "Music Visualizer" {
  @setting("void")
  @skybox("nebula")
  @lighting("dynamic_neon")
  @max_players(100)

  object "WaveformRing" { @position(0, 2, 0) @audio_reactive(source: "mic", property: "scale") @count(64) @circular }
  object "BeatSphere" { @position(0, 5, 0) @audio_reactive(source: "mic", property: "emissive") @glowing(color: "#ff00ff") }
  object "FrequencyBars" { @count(32) @grid(32, 1) @spacing(0.5) @audio_reactive(source: "mic", property: "scale_y") }
  object "ParticleField" { @particle_emitter(type: "sparkle", rate: 200) @audio_reactive(source: "mic", property: "rate") }
  object "FloorGrid" { @position(0, 0, 0) @size(50, 0.01, 50) @reflective(roughness: 0.1) @emissive(color: "#001133") }
  object "CameraOrbit" { @orbital @auto_rotate }

  game_logic {
    @audio_analysis
    @beat_detection
    @color_cycle
  }
}`,
  },

  // ── SOCIAL (Additional) ──────────────────────────────────────────────────
  {
    id: 'coworking-space',
    name: 'Virtual Co-Working Space',
    emoji: '💼',
    category: 'social',
    desc: 'Collaborative workspace with meeting rooms, whiteboards, and video screens',
    tags: ['Social', 'Work', 'Collaboration'],
    code: `world "Co-Working Space" {
  @setting("modern_office")
  @skybox("city_skyline")
  @lighting("bright_natural")
  @max_players(30)

  object "OpenDesk" { @count(12) @grid(4, 3) @spacing(3) @seating(1) @interactive }
  object "MeetingRoom_A" { @position(-10, 0, -8) @room @size(6, 3, 6) @door @whiteboard }
  object "MeetingRoom_B" { @position(10, 0, -8) @room @size(6, 3, 6) @door @media_player }
  object "Whiteboard" { @position(-10, 1.5, -10.5) @writable @interactive @synced }
  object "ScreenShare" { @position(10, 2, -10.5) @media_player @synced @size(3, 2, 0.05) }
  object "CoffeeStation" { @position(0, 0, 8) @interactive @emote("sip") }
  object "Lounge" { @position(12, 0, 5) @seating(4) @ambient(sound: "lofi_music.mp3") }
  object "Clock" { @position(0, 3, -12) @ui_element @real_time }

  game_logic {
    @proximity_voice
    @screen_sharing
    @do_not_disturb_toggle
  }
}`,
  },

  // ── EDUCATION (Additional) ────────────────────────────────────────────────
  {
    id: 'planetarium',
    name: 'VR Planetarium',
    emoji: '🌌',
    category: 'education',
    desc: 'Interactive solar system with orbital mechanics and constellation overlays',
    tags: ['Education', 'Space', 'Astronomy'],
    code: `world "VR Planetarium" {
  @setting("space")
  @skybox("starfield")
  @lighting("space_ambient")
  @max_players(20)

  object "Sun" { @position(0, 0, 0) @emissive(color: "#ffcc00", power: 500) @size(10, 10, 10) }
  object "Mercury" { @orbital(radius: 15, speed: 4.15) @size(0.38, 0.38, 0.38) @interactive }
  object "Venus" { @orbital(radius: 20, speed: 1.62) @size(0.95, 0.95, 0.95) @interactive }
  object "Earth" { @orbital(radius: 30, speed: 1) @size(1, 1, 1) @interactive }
  object "Mars" { @orbital(radius: 40, speed: 0.53) @size(0.53, 0.53, 0.53) @interactive }
  object "Jupiter" { @orbital(radius: 60, speed: 0.084) @size(11, 11, 11) @interactive }
  object "ConstellationOverlay" { @transparent(opacity: 0.3) @toggle @layer("constellations") }
  object "InfoPanel" { @position(0, 5, -20) @ui_element @context_sensitive }

  game_logic {
    @time_warp(speed_range: [1, 1000000])
    @planet_facts
    @quiz_mode
    @scale_toggle
  }
}`,
  },

  // ── HEALTHCARE (Additional) ───────────────────────────────────────────────
  {
    id: 'rehab-center',
    name: 'Physical Rehab Center',
    emoji: '🦽',
    category: 'healthcare',
    desc: 'VR rehabilitation with guided exercises and progress tracking',
    tags: ['Healthcare', 'Rehab', 'Physiotherapy'],
    code: `world "Rehab Center" {
  @setting("therapy_room")
  @skybox("peaceful")
  @lighting("soft_warm")
  @max_players(4)

  object "ExerciseMat" { @position(0, 0, 0) @count(4) @spacing(3) @interactive }
  object "BalanceBoard" { @position(-4, 0.1, 0) @interactive @physics @sensor(type: "balance") }
  object "ResistanceBand" { @position(0, 1, 2) @interactive @physics @stretch_sim }
  object "Mirror" { @position(0, 1.5, -5) @reflective @size(6, 3, 0.1) }
  object "ProgressBoard" { @position(4, 2, -5) @ui_element @patient_metrics }
  object "GuidedExercise" { @position(0, 2, 0) @ui_element @video_overlay @step_through }

  npc "Therapist" { @position(3, 0, 2) @dialogue("rehab_protocol") @role("Instructor") }

  game_logic {
    @rep_tracking
    @range_of_motion
    @pain_scale_input
    @progress_chart
  }
}`,
  },

  // ── E-COMMERCE (Additional) ───────────────────────────────────────────────
  {
    id: 'real-estate-tour',
    name: 'Virtual Property Tour',
    emoji: '🏠',
    category: 'ecommerce',
    desc: 'Walkable real estate showroom with room annotations and mortgage calculator',
    tags: ['E-commerce', 'Real Estate', 'Virtual Tour'],
    code: `world "Property Tour" {
  @setting("suburban_house")
  @skybox("clear_day")
  @lighting("natural_warm")
  @max_players(4)

  object "LivingRoom" { @room @position(0, 0, 0) @size(8, 3, 6) @walkable }
  object "Kitchen" { @room @position(10, 0, 0) @size(6, 3, 6) @walkable @interactive }
  object "Bedroom_Master" { @room @position(0, 0, -10) @size(6, 3, 5) @walkable }
  object "Bedroom_2" { @room @position(8, 0, -10) @size(5, 3, 4) @walkable }
  object "Bathroom" { @room @position(-6, 0, -10) @size(4, 3, 4) }
  object "Garden" { @position(0, 0, 10) @outdoor @size(12, 0, 8) }
  object "InfoAnnotation" { @count(15) @auto_place @readable @context_sensitive }
  object "FloorPlanToggle" { @ui_element @minimap @toggle }
  object "MortgageCalc" { @ui_element @interactive @calculator }

  game_logic {
    @guided_tour
    @measurement_tool
    @favorite_rooms
    @share_link
  }
}`,
  },
];

export const TEMPLATE_CATEGORIES = [
  { id: 'game', label: 'Games', emoji: '🎮' },
  { id: 'social', label: 'Social', emoji: '🎉' },
  { id: 'art', label: 'Art', emoji: '🎨' },
  { id: 'tabletop', label: 'Tabletop', emoji: '🎲' },
  { id: 'education', label: 'Education', emoji: '🎓' },
  { id: 'healthcare', label: 'Healthcare', emoji: '🏥' },
  { id: 'ecommerce', label: 'E-Commerce', emoji: '🛍️' },
  { id: 'industrial', label: 'Industrial', emoji: '🏭' },
  { id: 'sports', label: 'Sports', emoji: '🏟️' },
] as const;

