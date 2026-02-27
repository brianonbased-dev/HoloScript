// Scene templates — full HoloScript world starters
// Used by SimpleAssetLibrary "Templates" tab and QuickStartWizard

export interface SceneTemplate {
  id: string;
  name: string;
  emoji: string;
  category: 'game' | 'social' | 'art' | 'tabletop';
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
];

export const TEMPLATE_CATEGORIES = [
  { id: 'game', label: 'Games', emoji: '🎮' },
  { id: 'social', label: 'Social', emoji: '🎉' },
  { id: 'art', label: 'Art', emoji: '🎨' },
  { id: 'tabletop', label: 'Tabletop', emoji: '🎲' },
] as const;
