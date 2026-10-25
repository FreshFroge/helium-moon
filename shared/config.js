// HELIUM MOON - central tunables. Shared by the browser client and the Node server.
// Distances are metres, times are seconds, speeds are m/s.

export const CONFIG = {
  // ---------------------------------------------------------------- world
  // Metres per pixel of the user's top-down reference image. The real image is
  // ~8.2 m/px; 3.7 keeps the real shape of the trail but compresses it so a full
  // run fits a 15-25 minute session. Raise toward 8.2 for a 1:1 scale map.
  MAP_SCALE: 3.7,
  WORLD_SEED: 19740522,          // fixed: the map itself is the same every game
  HEIGHT_RES: 1.0,               // metres per heightfield sample
  GRID_RES: 2.0,                 // metres per cell for masks / density / nav
  TRAIL_HALF_WIDTH: 1.75,        // old 'River Road' two-track, half width at the south trailhead
  TRAIL_HALF_WIDTH_NORTH: 1.1,   // ...narrowing and overgrown toward the north end
  CORRIDOR_WIDTH: 165,           // playable forest depth on the refuge side of the trail
  FENCE_OFFSET: 13,              // farm fence distance on the field side of the trail
  RIVER_HALF_WIDTH: 9.5,
  RIVER_BANK: 7,
  WATER_LEVEL: -2.1,             // river surface relative to the floodplain
  SWAMP_WATER_LEVEL: -0.55,
  DEEP_WATER: 0.75,              // water deeper than this blocks players

  // ---------------------------------------------------------------- time / sky
  START_CLOCK: 22 * 60,          // 10:00 PM in minutes
  CLOCK_RATE: 1.0,               // in-game minutes per real minute
  MOON_PHASE: 0.78,              // waxing gibbous illuminated fraction
  MOON_AZIMUTH_DEG: 162,         // SSE, near transit at 10 PM for a ~10-day waxing gibbous
  MOON_ELEVATION_DEG: 36,
  MOON_ANGULAR_SIZE: 2.3,        // degrees (exaggerated ~4x for presence, still believable)

  // ---------------------------------------------------------------- player
  PLAYER: {
    WALK: 1.75, SPRINT: 5.4, CROUCH: 0.95, ACCEL: 11, AIR_ACCEL: 2,
    JUMP: 4.1, GRAVITY: 18, HEIGHT: 1.72, CROUCH_HEIGHT: 1.05, RADIUS: 0.3,
    STAMINA_MAX: 9, STAMINA_REGEN: 1.15, STAMINA_REGEN_DELAY: 1.2,
    STEP_HEIGHT: 0.42, MUD_SLOW: 0.72, WATER_SLOW: 0.55, BRUSH_SLOW: 0.78,
    MAX_HEALTH: 2,
  },
  FLASHLIGHT: {
    BATTERY_SECONDS: 540, BATTERY_PICKUP: 0.55, LOW: 0.18,
    ANGLE_DEG: 30, RANGE: 52, INTENSITY: 260,
  },

  // ---------------------------------------------------------------- Helium Voice terror radius
  TERROR: {
    OUTER: 80, MIDDLE: 50, INNER: 25, CRITICAL: 10,
    SMOOTH_IN: 0.35,               // how fast the felt terror rises (per second, exponential)
    SMOOTH_OUT: 0.2,               // recover after moving away rather than carrying every cue far out
    BASE_TEMP_C: 14,               // late October night
    MIN_TEMP_C: -4,                // temperature felt at the critical ring
    STRONG_CUE_START: 0.68,        // distant proximity should suggest cold, not broadcast a location
    FLICKER_START: 0.78,
    ANOMALY_START: 0.84,
    SIGHT_STINGER_DISTANCE: 25, SIGHT_STINGER_COOLDOWN: 50,
  },

  // ---------------------------------------------------------------- monsters
  HV: {
    WALK: 1.35, STALK: 2.3, CHASE: 5.15, BURST: 6.6, RELOCATE: 4.2,
    NAV_BLOCK_TIME: 60,            // s a spot where he got physically stuck is avoided by the planner
    STEP_OVER: 0.75,               // obstacle height he steps over: every fallen log (max 0.67 m) - 0.6 left 17% of logs as walls nav couldn't see
    CREEP_DISTANCE: 2.4, CREEP_SPEED: 0.38, CREEP_STOP: 1.8,
    RETREAT: 10.5,                 // fast, physical reverse bear crawl to cover
    SIGHT_FLASHLIGHT: 95, SIGHT_DARK: 24, SIGHT_FOV_DEG: 150,
    HEAR_SPRINT: 42, HEAR_WALK: 16, HEAR_CROUCH: 5, HEAR_INTERACT: 55, HEAR_VOICE: 38,
    ATTACK_RANGE: 1.7, ATTACK_COOLDOWN: 2.4, LOSE_TIME: 6.5, SEARCH_TIME: 24,
    OBSERVE_MIN: 35, OBSERVE_MAX: 70, // preferred observation distance band
    SIGNATURE_PROB: 0.4, SIGNATURE_FIRST_PROB: 0.75, SIGNATURE_COOLDOWN: 95, // uploaded .ogg on first sighting
    FOOTSTEP_FADE_START: 1.8, FOOTSTEP_MAX_DISTANCE: 2.4, // roughly 6-8 feet
    FOOTSTEP_STALK_GAIN: 0.45, FOOTSTEP_CHASE_GAIN: 0.8,
    // Hunts (owner, Oct 25 2026, docs/HUNT_PLAYTESTS.md). A hunt starts only within
    // HUNT_START_RANGE; farther out he first closes in unseen (HUNT_CLOSE_TIMEOUT s max).
    // Once a hunt starts, the ONLY way to call it off is a flashlight on him while he is
    // within HUNT_BREAK_LIT_DIST (7 ft) of whoever shines it. Being seen at range, losing
    // sight of the player and time do not end it: when he loses sight he re-acquires the
    // player's position every HUNT_TRACK_EVERY s. A hunt still ends when he lands a hit,
    // the target is downed/dead, or the target reaches the spawn area (he can't enter).
    // The client's hunt hum plays only within HUNT_HUM_RANGE of him.
    HUNT_START_RANGE: 35, HUNT_CLOSE_TIMEOUT: 45,
    HUNT_BREAK_LIT_DIST: 2.13, HUNT_TRACK_EVERY: 2.5,
    HUNT_LUNGE_DIST: 4,   // within this (clear line), the final lunge uses real collision, not the 2 m nav grid
    HUNT_STALL_TIME: 8,   // fail-safe: stuck (moved <1.5 m in 8 s, not in attack range) ends a hunt
    HUNT_HUM_RANGE: 50,
  },
  SF: {
    MODEL_SCALE: 0.6,               // keep the creature low and partially concealed in undergrowth
    SNEAK: 1.1, SCURRY: 4.6, DART: 7.0,
    SENSE_RADIUS: 26, AMBUSH_RADIUS: 7.5, GAS_RADIUS: 9, GAS_LIFE: 24, GAS_COOLDOWN: 28,
    BITE_RANGE: 1.4,
    FOOTSTEP_FADE_START: 1.8, FOOTSTEP_MAX_DISTANCE: 2.4, FOOTSTEP_GAIN: 0.6,
    VOCAL_FADE_START: 6, VOCAL_MAX_DISTANCE: 18, VOCAL_GAIN: 0.6,
    DANGER_FADE_START: 12, DANGER_MAX_DISTANCE: 26,
  },

  // ---------------------------------------------------------------- voice chat + mimicry
  VOICE: {
    CLEAR: 5, FADE_END: 20, MUFFLE: 32, MAX: 46,   // proximity falloff (metres)
    NOISE_THRESHOLD: 0.02,                         // mic RMS that counts as audible speech to monsters
  },
  MIMIC: {
    MIN_COOLDOWN: 80, PER_PLAYER_COOLDOWN: 140,    // seconds between mimicry events
    CHECK_INTERVAL: 6, BASE_CHANCE: 0.08,          // per check, scaled by conditions
    MIN_DELAY: 2, MAX_DELAY: 55,                   // phrase age when replayed
    BEHIND_MIN: 15, BEHIND_MAX: 35,
    PHRASE_MIN: 0.9, PHRASE_MAX: 4.0, MAX_PHRASES: 6, PHRASE_TTL: 120,
    PITCH: 1.5,
  },

  // ---------------------------------------------------------------- session
  // Creature no-go zones (owner, Oct 25 2026): never in the spawn area (see shared/sim/zones.js)
  ZONES: { SPAWN_RADIUS: 40, SPAWN_MARGIN: 12, SPAWN_PLAYERS: 6 },
  // Session pacing (owner, Oct 25 2026): dread builds longer before he shows himself, then
  // he grows steadily more aggressive as the night goes on.
  DIRECTOR: {
    DREAD_TIME: 210,          // s after the intro: cold/sounds only - no chases, reveals or skunk ambush; he keeps his distance
    DREAD_MIN_DIST: 55,       // m he is asked to stay beyond during the dread period (inside the outer cold ring)
    ESCALATE_TIME: 840,       // s after the dread period to reach full escalation (~18 min into the session)
    ESCALATE_AGGRESSION: 0.35,// added to base aggression at full escalation
    CHASE_COOLDOWN: [50, 22], // s between chases: start -> full escalation
    ATTACK_COOLDOWN: [40, 18],
    RELAX_LEN: [[30, 55], [15, 25]],   // relax phase length range: start -> full escalation
    BUILD_LEN: [[90, 160], [45, 80]],
    REVEAL_GAP: [[75, 130], [45, 80]],
    PRESENCE_SAFE: [25, 8],  // s of safety before he deliberately comes closer
    VOCAL_MUL: [1, 1.8],
  },
  SESSION: {
    INTRO_TIME: 9,
    REVIVE_TIME: 4.5, DOWNED_BLEEDOUT: 50,
    STATION_WORK_TIME: 9,
    EXTRACT_RADIUS: 9,
  },
  NET: { SNAPSHOT_HZ: 15, INPUT_HZ: 20, INTERP_DELAY: 0.15, MAX_PLAYERS: 6 },
};

export const QUALITY_PRESETS = {
  low:    { label: 'Low',    renderScale: 0.7,  shadowMap: 1024, shadowDist: 40, treeLod0: 18, treeLod1: 45, treeFar: 220, grassDist: 22, bushDist: 40, msaa: 0, spotShadow: false, fogSteps: 6,  volumetric: false, maxTrees: 1600 },
  medium: { label: 'Medium', renderScale: 0.85, shadowMap: 2048, shadowDist: 55, treeLod0: 26, treeLod1: 80, treeFar: 300, grassDist: 32, bushDist: 55, msaa: 2, spotShadow: true,  fogSteps: 8,  volumetric: true,  maxTrees: 2600 },
  high:   { label: 'High',   renderScale: 1.0,  shadowMap: 2048, shadowDist: 70, treeLod0: 34, treeLod1: 100, treeFar: 380, grassDist: 42, bushDist: 70, msaa: 4, spotShadow: true,  fogSteps: 10, volumetric: true,  maxTrees: 3800 },
  ultra:  { label: 'Ultra',  renderScale: 1.0,  shadowMap: 4096, shadowDist: 90, treeLod0: 45, treeLod1: 130, treeFar: 480, grassDist: 55, bushDist: 90, msaa: 4, spotShadow: true,  fogSteps: 14, volumetric: true,  maxTrees: 5200 },
};
