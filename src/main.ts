// Entry point. Runs standalone, and also exports the hub-compatible
// interface: { id, title, description, mount(container), unmount() }.

import { Game } from './game/Game';
import './style.css';

let game: Game | null = null;

export const id = 'stunt-double';
export const title = 'Stunt Double';
export const description =
  'A one-button-family auto-scroller: survive five action-movie sequences in as few takes as possible.';

export async function mount(container: HTMLElement): Promise<void> {
  unmount();
  // Wait (briefly) for the display fonts so the canvas never draws fallback text.
  try {
    await Promise.race([
      Promise.all([document.fonts.load('40px "Bebas Neue"'), document.fonts.load('14px "Space Mono"')]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch {
    /* fonts are optional: fallbacks are defined */
  }
  game = new Game(container);
  game.start();
}

export function unmount(): void {
  game?.destroy();
  game = null;
}

export default { id, title, description, mount, unmount };

const root = document.getElementById('app');
if (root && !root.dataset.hub) void mount(root);
