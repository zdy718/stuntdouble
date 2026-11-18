# Stunt Double

A one-button-family 2D auto-scroller. You play a stunt performer surviving five
action-movie sequences, and every run is framed as a film shoot: you don't lose
lives, you do another **take**. Survive the sequence, clean up your timing, and
earn a star rating.

## Design pillars

- **Readable at a glance.** Each hazard has one silhouette, one colour family and one
  answer: wide blocky shapes = jump, horizontal bars = duck, thin cyan lines with a
  pulsing handle = grab.
- **Fair and learnable.** Every level is a fixed, hand-authored pattern, checked by a
  spacing validator and by an automated "perfect player" in the tests. No randomness
  in gameplay.
- **The film frame is the fun.** Takes, clapperboards, "CUT!", star ratings and the
  wrap party are the identity of the game.
- **Small scope, high polish.** Five levels, three actions, one character.

## Controls

| Action | Keys |
| --- | --- |
| Jump (hold for full height) | Space, Up, W |
| Duck / slide (hold; in the air it pulls you down faster) | Down, S |
| Grab (from level 3) | E, Shift |
| Retake (restart the scene as the next take) | R |
| Pause | Esc, P |

Touch: tap the right half to jump, hold the left half to duck, and use the round
GRAB button. Tap the timecode at the top to pause.

## Running it

Requires Node.js (LTS).

```sh
npm install
npm run dev       # play at http://localhost:5173
npm test          # scoring, saving, physics and level tests
npm run build     # typecheck + production build into dist/
```

Debug mode: open `http://localhost:5173/?debug=1` to see hitboxes, the beat grid, FPS
and the current beat. Keys: `1`-`5` jump to a level, `B` jump to scene B, `N` finish the
scene, `T` toggle 0.25x slow motion, `I` toggle invincibility.

## How it is built

TypeScript (strict), Vite, and the plain Canvas 2D API, with no game framework.

```
src/
  main.ts              entry point and hub-compatible export {id, title, description, mount, unmount}
  game/
    Game.ts            fixed 60 Hz loop and the state machine
    World.ts           one running scene: scrolling, physics, collisions, scoring events (headless)
    Player.ts          player state and hitboxes
    Obstacles.ts       obstacle types and timed behaviours (cranes, tiles, darts)
    Collision.ts       box overlap, trimming, floor support
    Input.ts           keyboard and touch; buffering and coyote time live in World.ts
    Score.ts           points, combo, stars, titles (pure functions)
    Save.ts            versioned localStorage save (key "stuntDouble.v1")
    Audio.ts           Web Audio synthesis: five music loops, stingers, every SFX
    Renderer.ts        world drawing, particles, film grain, vignette, letterbox
    Themes.ts          the palette and the per-level parallax backdrops
    ui/                HUD, clapperboards, menus, level clear, wrap party
  levels/
    schema.ts          level types and the spacing validator
    level1.json ... level5.json
tests/
  score.test.ts        includes the 3,400-point worked example from the design doc
  levels.test.ts       validator + a brute-force solver proving every scene can be finished
  physics.test.ts      jump arc, variable height, coyote time, buffering, grab
  save.test.ts
```

### Level data

Levels are JSON with positions in **beats**, so `x = beat * pixelsPerBeat` and
`pixelsPerBeat = speed * 60 / bpm`. Scene B runs 5% faster (music tempo included) as
the in-level speed ramp. The validator in `schema.ts` rejects ground hazards closer than
two beats, jump-to-duck pairs closer than 2.5 beats, gaps wider than a full jump can
clear, rope gaps narrow enough to jump, and anything placed after a carry before the
player lands. `levels.test.ts` additionally runs a depth-first search over held-key
states with the real physics to prove each scene is beatable, and that doing nothing
fails.

### Deploying to GitHub Pages

`vite.config.ts` uses a relative `base: './'`, which works on GitHub Pages and any static
host. Run `npm run build` and publish the `dist/` folder.

## Tuning notes

All starting values from the design document live in `src/game/constants.ts`. A few were
adjusted to stay fair with the real physics:

- Gap widths are capped at `speed * 0.5 + 60` px (the validator enforces it), so the
  widest gaps are 210 px in level 2 and 240-260 px in levels 4-5. Rope gaps are 340-380 px,
  wide enough that the grab is required.
- Overhead hazards reach up out of jump range so ducking is the only answer.
- Falling tiles drop 0.5 s after you step on them, so they only punish stopping, which an
  auto-scroller never does. They are mostly a set piece, as the design intended.
- After a slow-motion close call the simulation briefly runs a little fast to catch up,
  so the world stays in sync with the music.
