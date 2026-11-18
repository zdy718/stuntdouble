// Shared tuning values. Everything here is a starting value from the design
// document, meant to be tuned by feel.

export const VIEW_W = 960;
export const VIEW_H = 540;

/** The floor line of the gameplay lane (feet rest here). */
export const GROUND_Y = 440;
/** Top of the protected lane band (nothing but hazards / player here). */
export const LANE_TOP = 360;
/** Player's fixed horizontal screen position (centre of the hitbox). */
export const PLAYER_X = 200;

export const STEP = 1 / 60; // fixed physics timestep (60 Hz)

// Jump
export const JUMP_SPEED = 820; // px/s
export const GRAVITY = 2400; // px/s^2
export const FAST_FALL_MULT = 2.2; // holding duck in the air pulls you down faster
export const COYOTE_TIME = 0.08; // s
export const INPUT_BUFFER = 0.1; // s

// Hitboxes (already ~80% of the 64 x 80 sprite)
export const PLAYER_W = 48;
export const PLAYER_H = 64;
export const PLAYER_DUCK_H = 32;
/** Width of the "feet" used to decide whether the player stands on ground. */
export const SUPPORT_W = 60;

// Grab
export const GRAB_WINDOW = 90; // px, centred on the handle
export const PERFECT_WINDOW = 30; // px, centre of the grab window
export const CARRY_TIME = 0.8; // s
export const ROPE_ANCHOR_Y = -200; // ropes hang from above the screen
export const HANDLE_Y = 350; // handle height for ropes and vines
export const HELI_HANDLE_Y = 336;

// Scoring geometry
export const CLOSE_CALL_PX = 12;
export const HAZARD_TRIM = 0.8; // hazard hitboxes are 80% of their visual size

// Timings of the film frame
export const CUT_TIME = 0.6;
export const CUT_FADE = 0.3;
export const SCENE_CARD_TIME = 1.5;
