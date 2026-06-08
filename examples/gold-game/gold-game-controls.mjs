// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — shared control scheme (one source → 3D + 2D builds).
//
// A PURE, deterministic input→state machine so the game is playable OUTSIDE VR
// (keyboard/pointer), with the SAME mapping in both the 3D Drive build and the
// retro 2D build. Imported by both builds and exercised by gate-15.
//
// Tiers: 0 = Bronze Valley, 1 = Gold Terrace, 2 = Diamond Peak.
// Keys: W/↑ ascend a tier · S/↓ descend · A/← left · D/→ right · E/Space graduate
//       the entry at the current tier (the curation verb; HoloGate-gated in 3D).
// ═══════════════════════════════════════════════════════════════════════════

export const TIERS = ['BronzeValley', 'GoldTerrace', 'DiamondPeak'];

export function initState() {
  return { tierIndex: 0, x: 0, graduated: [], actions: 0 };
}

// Normalize a key (KeyboardEvent.key) to a control verb. Returns null if unmapped.
export function keyToVerb(key) {
  switch (key) {
    case 'w':
    case 'W':
    case 'ArrowUp':
      return 'ascend';
    case 's':
    case 'S':
    case 'ArrowDown':
      return 'descend';
    case 'a':
    case 'A':
    case 'ArrowLeft':
      return 'left';
    case 'd':
    case 'D':
    case 'ArrowRight':
      return 'right';
    case 'e':
    case 'E':
    case ' ':
    case 'Enter':
      return 'graduate';
    default:
      return null;
  }
}

// Apply one input. Pure: returns { state, action } (action is what the renderer animates).
export function applyInput(state, key) {
  const verb = keyToVerb(key);
  if (!verb) return { state, action: null };
  const s = { ...state, graduated: [...state.graduated], actions: state.actions + 1 };
  let action = verb;
  if (verb === 'ascend') s.tierIndex = Math.min(TIERS.length - 1, s.tierIndex + 1);
  else if (verb === 'descend') s.tierIndex = Math.max(0, s.tierIndex - 1);
  else if (verb === 'left') s.x -= 1;
  else if (verb === 'right') s.x += 1;
  else if (verb === 'graduate') {
    const tier = TIERS[s.tierIndex];
    if (!s.graduated.includes(tier)) {
      s.graduated.push(tier);
      action = 'graduate:' + tier;
    } else action = 'graduate:noop';
  }
  return { state: s, action };
}

// Run a whole input trace (deterministic). Returns the final state + action log.
export function runTrace(keys) {
  let state = initState();
  const log = [];
  for (const k of keys) {
    const r = applyInput(state, k);
    state = r.state;
    if (r.action) log.push(r.action);
  }
  return { state, log };
}
