// Axis-aligned box tests. Boxes are in world x / screen y.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function inflate(b: Box, by: number): Box {
  return { x: b.x - by, y: b.y - by, w: b.w + by * 2, h: b.h + by * 2 };
}

/** Shrinks a visual box to a fair hitbox. Ground-standing boxes keep their bottom edge. */
export function trim(b: Box, factor: number, keepBottom: boolean): Box {
  const w = b.w * factor;
  const h = b.h * factor;
  const x = b.x + (b.w - w) / 2;
  const y = keepBottom ? b.y + (b.h - h) : b.y + (b.h - h) / 2;
  return { x, y, w, h };
}

/** True if any part of [x0, x1] is outside every hole. */
export function hasSolid(x0: number, x1: number, holes: ReadonlyArray<readonly [number, number]>): boolean {
  for (let x = x0; x <= x1 + 0.001; x += Math.max(1, (x1 - x0) / 12)) {
    let inHole = false;
    for (const [h0, h1] of holes) {
      if (x > h0 && x < h1) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}
