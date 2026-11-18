# Credits

| Asset | Author | License |
| --- | --- | --- |
| All game code | Stunt Double project | Project license |
| All graphics (vector shapes drawn in code: performer, hazards, backdrops, UI) | Stunt Double project | Project license |
| All music (five procedural loops, synthesised with the Web Audio API in `src/game/Audio.ts`) | Stunt Double project | Project license |
| All sound effects (synthesised at runtime in `src/game/Audio.ts`) | Stunt Double project | Project license |
| Bebas Neue font (loaded from Google Fonts) | Dharma Type | SIL Open Font License 1.1 |
| Space Mono font (loaded from Google Fonts) | Colophon Foundry | SIL Open Font License 1.1 |

No sample files, sprite sheets or third-party art are bundled. The fonts are loaded
from Google Fonts at runtime; if they are unavailable the game falls back to system
fonts (Impact / Menlo). To ship fully offline, download the two OFL fonts into
`src/assets/fonts/` and replace the `<link>` in `index.html` with `@font-face` rules.

Film references use generic action-movie tropes only: no real film titles,
characters, logos or brand names.
