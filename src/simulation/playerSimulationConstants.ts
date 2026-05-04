export const PLAYER_RADIUS = 2.2;
export const WALK_SPEED = 18.5;
export const ROLL_SPEED = 31;
export const ROLL_BOOST_DELAY = 1.15;
export const ROLL_BOOST_MULTIPLIER = 1.28;
export const ROLL_MODE_INDICATOR_DELAY = 3;
export const ROLL_ACCELERATION_MULTIPLIER = 1.08;
export const ROLL_TURN_ACCELERATION = 76;
export const ROLL_START_IMPULSE = 6.4;
export const ROLL_COAST_DECELERATION = 10;
export const ROLL_DRIFT_STEERING = 0.34;
export const ROLL_REVERSE_DRIFT_STEERING = 0.18;
export const ROLL_DRIFT_SPEED_RETENTION = 0.78;
export const ROLL_DRIFT_MAX_SPEED_LOSS = 8.5;
export const ROLL_REVERSE_DRIFT_MAX_SPEED_LOSS = 18;
export const ROLL_GRAVITY_MIN_SLOPE = 0.035;
export const ROLL_GRAVITY_FULL_SLOPE = 0.32;
export const ROLL_SLOPE_ACCELERATION = 118;
export const ROLL_SLOPE_SPEED_BONUS = 14;
export const ROLL_DOWNHILL_INPUT_SPEED_BONUS = 7.2;
export const ROLL_UPHILL_INPUT_SPEED_PENALTY = 4.4;
export const ROLL_DOWNHILL_ACCELERATION_MULTIPLIER = 1.14;
export const ROLL_UPHILL_ACCELERATION_MULTIPLIER = 0.84;
export const ROLL_JUMP_FORWARD_BONUS = 5.8;
export const ROLL_AIR_SPEED_BONUS = 11;
export const AIR_SPEED = 17;
export const GROUND_ACCELERATION = 72;
export const GROUND_DECELERATION = 92;
export const GROUND_TURN_ACCELERATION = 98;
export const AIR_ACCELERATION = 28;
export const AIR_DECELERATION = 10;
export const AIR_MOMENTUM_GRACE_TIME = 0.55;
export const ROLL_AIR_MOMENTUM_GRACE_TIME = 1.1;
export const AIR_MOMENTUM_DECELERATION_MULTIPLIER = 0.32;
export const AIR_MOMENTUM_SPEED_LIMIT_BONUS = 4;
export const JUMP_VELOCITY = 24.5;
export const COYOTE_TIME = 0.17;
export const JUMP_BUFFER_TIME = 0.2;
export const LANDING_MOMENTUM_GRACE_TIME = 0.18;
export const LANDING_MOMENTUM_DECELERATION_MULTIPLIER = 0.38;
export const LANDING_SPEED_CARRY_BONUS = 6.4;
export const ROLL_LANDING_SPEED_CARRY_BONUS = 8.5;
/** Extra frames after Q release to still start float (input forgiveness). */
export const BREEZE_FLOAT_BUFFER_TIME = 0.3;
/**
 * Float only while vertical speed is below this (m/s). Higher = Breeze can engage
 * earlier in the jump (more responsive) without staying locked out until late apex.
 */
export const BREEZE_FLOAT_MAX_UPWARD_VELOCITY = 10.5;
export const STAMINA_MAX = 100;
export const STAMINA_REGEN_DELAY = 0.55;
export const STAMINA_REGEN_GROUND = 26;
export const STAMINA_REGEN_AIR = 18;
export const STAMINA_REGEN_SWIM = 20;
export const STAMINA_VISIBLE_EPSILON = 0.35;
export const STAMINA_ACTION_THRESHOLD = 1.5;
export const GRAVITY = 38;
export const FLOAT_GRAVITY_SCALE = 0.28;
export const FLOAT_FORWARD_BONUS = 6;
export const FLOAT_STAMINA_DRAIN = 18;
export const VOID_FALL_DURATION = 10;
export const VOID_HORIZONTAL_DRAG = 0.985;
export const SWIM_SPEED = 12.8;
export const SWIM_UNDERWATER_SPEED = 8.6;
export const SWIM_ACCELERATION = 40;
export const SWIM_DECELERATION = 24;
export const SWIM_GRAVITY = 10;
export const SWIM_BUOYANCY = 34;
export const SWIM_ENTRY_SURFACE_LIFT = 0.72;
export const SWIM_STROKE_ACCELERATION = 26;
export const SWIM_DIVE_ACCELERATION = 18;
export const SWIM_DIVE_BUOYANCY = 12;
export const SWIM_FLOAT_HEIGHT = -0.18;
export const SWIM_ENTRY_MARGIN = 1.45;
export const SWIM_EXIT_MARGIN = 2.05;
export const SWIM_CURRENT_SCALE = 8;
export const SWIM_MIN_DEPTH = 1.35;
export const SWIM_UNDERWATER_MIN_DEPTH = 2.1;
export const SWIM_UNDERWATER_STAMINA_DRAIN = 7;

/**
 * How strongly the early-release jump-cut damps remaining upward velocity.
 * 1.0 = no cut, 0 = full clamp. 0.45 keeps a small upward arc so taps still feel like hops.
 */
export const JUMP_RELEASE_CUT_MULTIPLIER = 0.45;
/**
 * Don't cut if upward velocity has already fallen below this — the jump is past its useful arc
 * and an extra clamp would feel like a yank.
 */
export const JUMP_MIN_RELEASE_VELOCITY = 9;
/**
 * Gravity scale applied near the apex of a jump (|vy| under HANG_VELOCITY_THRESHOLD).
 * Reserved for future apex-hang work; not yet wired.
 */
export const APEX_HANG_GRAVITY_SCALE = 0.62;
export const APEX_HANG_VELOCITY_THRESHOLD = 5.5;
/**
 * Hold-to-charge upward thrust applied each second while Space is held during ascent.
 * Slightly stronger than gravity so vy actually grows during the charge window — the longer
 * you hold, the higher Mossu climbs (until the window expires or input releases). 40 m/s²
 * with 38 m/s² gravity = +2 m/s² net rise during the window.
 */
export const JUMP_HOLD_THRUST = 40;
/**
 * Maximum charge window in seconds. Past this, thrust releases naturally and the jump
 * coasts ballistically even if Space is still held. Keeps "hold to charge" bounded.
 */
export const JUMP_HOLD_MAX_DURATION = 0.35;

export interface SurfaceTraction {
  /** Multiplier on acceleration when input pushes movement (grip on push). */
  accelMultiplier: number;
  /** Multiplier on deceleration when input releases (brake firmness). */
  decelMultiplier: number;
  /** Multiplier on turn-acceleration when reversing direction (turn bite). */
  turnMultiplier: number;
  /** Multiplier on roll coast deceleration (how fast a coasting roll bleeds speed). */
  rollCoastMultiplier: number;
}

/**
 * Per-surface traction. Multipliers around 1.0 = baseline meadow.
 * - High grip surfaces (forest_floor, rock) accelerate/brake quickly and turn tightly.
 * - Loose surfaces (sand, highland_grass) feel slippier; rolls coast further.
 * - shrine_moss intentionally slides for a sacred-glide feel near the summit.
 * Water is unused here because wading already has its own multipliers in movementPhysics.
 */
export const SURFACE_TRACTION = {
  meadow_grass: { accelMultiplier: 1.0, decelMultiplier: 1.0, turnMultiplier: 1.0, rollCoastMultiplier: 1.0 },
  sand: { accelMultiplier: 0.86, decelMultiplier: 0.78, turnMultiplier: 0.84, rollCoastMultiplier: 0.78 },
  water: { accelMultiplier: 1.0, decelMultiplier: 1.0, turnMultiplier: 1.0, rollCoastMultiplier: 1.0 },
  forest_floor: { accelMultiplier: 1.06, decelMultiplier: 1.06, turnMultiplier: 1.08, rollCoastMultiplier: 1.12 },
  highland_grass: { accelMultiplier: 0.92, decelMultiplier: 0.9, turnMultiplier: 0.9, rollCoastMultiplier: 0.88 },
  rock: { accelMultiplier: 1.1, decelMultiplier: 1.12, turnMultiplier: 1.12, rollCoastMultiplier: 1.08 },
  shrine_moss: { accelMultiplier: 1.04, decelMultiplier: 0.9, turnMultiplier: 1.0, rollCoastMultiplier: 0.82 },
} as const satisfies Record<string, SurfaceTraction>;

export const NEUTRAL_SURFACE_TRACTION: SurfaceTraction = SURFACE_TRACTION.meadow_grass;
