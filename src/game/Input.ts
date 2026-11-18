// Keyboard (and touch) input. Presses are latched until the next fixed step
// consumes them, so a tap shorter than one frame is never lost. Buffering and
// coyote time live in the simulation (World.ts) so they are deterministic.

import { InputFrame } from './World';

export type MenuKey = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'retake' | 'pause' | 'any';

const JUMP = new Set(['Space', 'ArrowUp', 'KeyW']);
const DUCK = new Set(['ArrowDown', 'KeyS']);
const GRAB = new Set(['KeyE', 'ShiftLeft', 'ShiftRight']);

export class Input {
  private jumpKeys = new Set<string>();
  private duckKeys = new Set<string>();
  private jumpLatch = false;
  private grabLatch = false;
  private touchJump = false;
  private touchDuck = false;
  private menuQueue: MenuKey[] = [];
  /** Raw key codes pressed since last poll (debug shortcuts). */
  readonly codes: string[] = [];
  private listeners: [EventTarget, string, EventListener][] = [];
  onFirstInput: (() => void) | null = null;

  attach(target: Window, canvas: HTMLCanvasElement): void {
    this.on(target, 'keydown', (e) => this.keyDown(e as KeyboardEvent));
    this.on(target, 'keyup', (e) => this.keyUp(e as KeyboardEvent));
    this.on(target, 'blur', () => this.releaseAll());
    void canvas;
  }

  private on(t: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions): void {
    t.addEventListener(type, fn, opts);
    this.listeners.push([t, type, fn]);
  }

  detach(): void {
    for (const [t, type, fn] of this.listeners) t.removeEventListener(type, fn);
    this.listeners = [];
  }

  private first(): void {
    if (this.onFirstInput) {
      const f = this.onFirstInput;
      this.onFirstInput = null;
      f();
    }
  }

  private keyDown(e: KeyboardEvent): void {
    const c = e.code;
    if (JUMP.has(c) || DUCK.has(c) || c === 'Tab') e.preventDefault();
    this.first();
    if (e.repeat) return;
    this.codes.push(c);
    if (JUMP.has(c)) {
      this.jumpKeys.add(c);
      this.jumpLatch = true;
    }
    if (DUCK.has(c)) this.duckKeys.add(c);
    if (GRAB.has(c)) this.grabLatch = true;

    let m: MenuKey | null = null;
    if (c === 'ArrowUp' || c === 'KeyW') m = 'up';
    else if (c === 'ArrowDown' || c === 'KeyS') m = 'down';
    else if (c === 'ArrowLeft' || c === 'KeyA') m = 'left';
    else if (c === 'ArrowRight' || c === 'KeyD') m = 'right';
    else if (c === 'Enter' || c === 'Space') m = 'confirm';
    else if (c === 'Escape' || c === 'KeyP') m = 'pause';
    else if (c === 'KeyR') m = 'retake';
    else if (c === 'Backspace') m = 'back';
    if (m) this.menuQueue.push(m);
    this.menuQueue.push('any');
  }

  private keyUp(e: KeyboardEvent): void {
    this.jumpKeys.delete(e.code);
    this.duckKeys.delete(e.code);
  }

  releaseAll(): void {
    this.jumpKeys.clear();
    this.duckKeys.clear();
    this.touchJump = false;
    this.touchDuck = false;
  }

  // ----- touch (stretch goal): right half jumps, left half ducks, button grabs
  touch(kind: 'jumpDown' | 'jumpUp' | 'duckDown' | 'duckUp' | 'grab' | 'menu'): void {
    this.first();
    switch (kind) {
      case 'jumpDown':
        this.touchJump = true;
        this.jumpLatch = true;
        break;
      case 'jumpUp':
        this.touchJump = false;
        break;
      case 'duckDown':
        this.touchDuck = true;
        break;
      case 'duckUp':
        this.touchDuck = false;
        break;
      case 'grab':
        this.grabLatch = true;
        break;
      case 'menu':
        this.menuQueue.push('confirm', 'any');
        break;
    }
  }

  /** Builds the input for one fixed step and clears the latches. */
  frame(): InputFrame {
    const f: InputFrame = {
      jumpHeld: this.jumpKeys.size > 0 || this.touchJump,
      duckHeld: this.duckKeys.size > 0 || this.touchDuck,
      jumpPressed: this.jumpLatch,
      grabPressed: this.grabLatch,
    };
    this.jumpLatch = false;
    this.grabLatch = false;
    return f;
  }

  clearLatches(): void {
    this.jumpLatch = false;
    this.grabLatch = false;
  }

  menu(): MenuKey[] {
    const q = this.menuQueue;
    this.menuQueue = [];
    return q;
  }

  pollCodes(): string[] {
    return this.codes.splice(0);
  }
}
