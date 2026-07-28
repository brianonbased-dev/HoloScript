'use client';

/**
 * Game-mode presets for /create?mode=game.
 *
 * Mirrors the SimSci presets contract (presets + per-preset headline params),
 * but the "solver" is the Canvas2DGame trait→game derivation: each preset is a
 * HoloScript composition source that POST /api/game/compile parses and exports
 * to a playable HTML game via the canvas2d-game ExportManager target.
 *
 * The trait→game mapping is GENERIC (Canvas2DGameCompiler.classifyRole):
 *   @controllable → player, @grabbable → collectible, @collidable → hazard,
 *   @dialogue → goal, @ai_agent → npc. Tiers come from spatialGroups.
 *
 * Headline params (timeLimit, hearts) override the compiled options — they are
 * passed as the `options` body field to /api/game/compile.
 *
 * No @holoscript/core or /engine import here — compilation is server-side.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface GamePreset {
  id: string;
  label: string;
  description: string;
  /** HoloScript composition source compiled via the canvas2d-game target. */
  source: string;
}

export interface GamePresetParam {
  name: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit: string;
  format: (v: number) => string;
}

// ── Preset sources ────────────────────────────────────────────────────────────
// Minimal, parse-clean HoloScript compositions. Each uses the generic gameplay
// traits so the compiler derives a player + collectibles + hazard + goal across
// ascending tiers without any hardcoded scene.

const PLATFORMER_SOURCE = `composition "Tier Climber" {
  metadata {
    name: 'Tier Climber'
    category: 'gaming'
  }
  environment {
    gravity: [0, -9.81, 0]
  }
  template "Hero" {
    @controllable(jumpHeight: 7.4, moveSpeed: 1.8)
    @physics
    geometry: "humanoid"
  }
  template "Gem" {
    @grabbable(points: 100)
    @interactive
    geometry: "octahedron"
  }
  template "Patroller" {
    @collidable(damage: 1, patrolSpeed: 0.6)
    geometry: "tetrahedron"
  }
  template "Keeper" {
    @dialogue(line: "Reach the summit.")
    @collidable
    geometry: "humanoid"
  }
  spatial_group "Bronze" {
    origin: [0, 0, 0]
    object "Player" using "Hero" {
      position: [-1.5, 1, 0]
      color: "#5ad1ff"
    }
    object "Gem1" using "Gem" {
      position: [1, 0.5, 0]
      color: "#cd7f32"
    }
    object "Foe1" using "Patroller" {
      position: [0.4, 0.5, 0]
      color: "#a55a3a"
    }
  }
  spatial_group "Gold" {
    origin: [0, 4, -8]
    object "Gem2" using "Gem" {
      position: [-0.6, 0.5, 0]
      color: "#d4af37"
    }
    object "Foe2" using "Patroller" {
      position: [0.8, 0.5, 0]
      color: "#a55a3a"
    }
  }
  spatial_group "Diamond" {
    origin: [0, 9, -16]
    object "Gem3" using "Gem" {
      position: [0.2, 0.5, 0]
      color: "#b9f2ff"
    }
    object "Goal" using "Keeper" {
      position: [1.2, 0.5, 0]
      color: "#7a5a8a"
    }
  }
}
`;

const COLLECTOR_SOURCE = `composition "Gem Run" {
  metadata {
    name: 'Gem Run'
    category: 'gaming'
  }
  environment {
    gravity: [0, -6.0, 0]
  }
  template "Hero" {
    @controllable(jumpHeight: 8.5, moveSpeed: 2.4)
    @physics
    geometry: "humanoid"
  }
  template "Gem" {
    @grabbable(points: 250)
    @interactive
    geometry: "octahedron"
  }
  template "Keeper" {
    @dialogue(line: "Collect them all.")
    @collidable
    geometry: "humanoid"
  }
  spatial_group "Bronze" {
    origin: [0, 0, 0]
    object "Player" using "Hero" {
      position: [-1.5, 1, 0]
      color: "#5ad1ff"
    }
    object "Gem1" using "Gem" {
      position: [0.6, 0.5, 0]
      color: "#cd7f32"
    }
    object "Gem2" using "Gem" {
      position: [1.3, 0.5, 0]
      color: "#cd7f32"
    }
  }
  spatial_group "Gold" {
    origin: [0, 5, -8]
    object "Gem3" using "Gem" {
      position: [-0.4, 0.5, 0]
      color: "#d4af37"
    }
    object "Gem4" using "Gem" {
      position: [0.8, 0.5, 0]
      color: "#d4af37"
    }
    object "Goal" using "Keeper" {
      position: [1.4, 0.5, 0]
      color: "#7a5a8a"
    }
  }
}
`;

const RUNNER_SOURCE = `composition "Hazard Dash" {
  metadata {
    name: 'Hazard Dash'
    category: 'gaming'
  }
  environment {
    gravity: [0, -12.0, 0]
  }
  template "Hero" {
    @controllable(jumpHeight: 9.0, moveSpeed: 3.0)
    @physics
    geometry: "humanoid"
  }
  template "Gem" {
    @grabbable(points: 150)
    @interactive
    geometry: "octahedron"
  }
  template "Patroller" {
    @collidable(damage: 1, patrolSpeed: 1.2)
    geometry: "tetrahedron"
  }
  template "Keeper" {
    @dialogue(line: "Survive the dash.")
    @collidable
    geometry: "humanoid"
  }
  spatial_group "Bronze" {
    origin: [0, 0, 0]
    object "Player" using "Hero" {
      position: [-1.6, 1, 0]
      color: "#5ad1ff"
    }
    object "Foe1" using "Patroller" {
      position: [0.2, 0.5, 0]
      color: "#a55a3a"
    }
    object "Foe2" using "Patroller" {
      position: [1.1, 0.5, 0]
      color: "#a55a3a"
    }
    object "Gem1" using "Gem" {
      position: [0.6, 0.5, 0]
      color: "#cd7f32"
    }
  }
  spatial_group "Gold" {
    origin: [0, 6, -10]
    object "Foe3" using "Patroller" {
      position: [-0.3, 0.5, 0]
      color: "#a55a3a"
    }
    object "Gem2" using "Gem" {
      position: [0.9, 0.5, 0]
      color: "#d4af37"
    }
    object "Goal" using "Keeper" {
      position: [1.5, 0.5, 0]
      color: "#7a5a8a"
    }
  }
}
`;

// ── Presets ─────────────────────────────────────────────────────────────────

export const GAME_PRESETS: GamePreset[] = [
  {
    id: 'tier-climber',
    label: 'Tier Climber',
    description:
      'Climb bronze → gold → diamond tiers. Player, gems, a patrolling hazard, and a goal keeper — the canonical trait→game derivation.',
    source: PLATFORMER_SOURCE,
  },
  {
    id: 'gem-run',
    label: 'Gem Run',
    description:
      'Fast collect-a-thon. Higher jump, more hearts, no hazards — pure @grabbable scoring.',
    source: COLLECTOR_SOURCE,
  },
  {
    id: 'hazard-dash',
    label: 'Hazard Dash',
    description:
      'Heavy gravity, fast patrollers, only 2 hearts. @collidable hazards drive the difficulty.',
    source: RUNNER_SOURCE,
  },
];

// ── Headline params (overrides passed as compile options) ─────────────────────

export const GAME_PRESET_PARAMS: Record<string, GamePresetParam[]> = {
  'tier-climber': [
    {
      name: 'timeLimit',
      label: 'Time limit',
      min: 20,
      max: 180,
      step: 5,
      value: 70,
      unit: 's',
      format: (v) => Math.round(v).toString(),
    },
    {
      name: 'hearts',
      label: 'Starting hearts',
      min: 1,
      max: 9,
      step: 1,
      value: 3,
      unit: '',
      format: (v) => Math.round(v).toString(),
    },
  ],
  'gem-run': [
    {
      name: 'timeLimit',
      label: 'Time limit',
      min: 15,
      max: 120,
      step: 5,
      value: 45,
      unit: 's',
      format: (v) => Math.round(v).toString(),
    },
    {
      name: 'hearts',
      label: 'Starting hearts',
      min: 1,
      max: 9,
      step: 1,
      value: 5,
      unit: '',
      format: (v) => Math.round(v).toString(),
    },
  ],
  'hazard-dash': [
    {
      name: 'timeLimit',
      label: 'Time limit',
      min: 20,
      max: 120,
      step: 5,
      value: 60,
      unit: 's',
      format: (v) => Math.round(v).toString(),
    },
    {
      name: 'hearts',
      label: 'Starting hearts',
      min: 1,
      max: 9,
      step: 1,
      value: 2,
      unit: '',
      format: (v) => Math.round(v).toString(),
    },
  ],
};

// ── Lookups ───────────────────────────────────────────────────────────────────

export function getGamePresetById(id: string): GamePreset | undefined {
  return GAME_PRESETS.find((p) => p.id === id);
}

export function getGamePresetParams(id: string): GamePresetParam[] {
  return GAME_PRESET_PARAMS[id] ?? [];
}
