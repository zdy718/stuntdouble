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
