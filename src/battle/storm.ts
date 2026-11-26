/**
 * Act III background lightning: a deterministic schedule so the arena needs no state. Pure.
 * One strike every few seconds at most, two soft pulses each (well under 3 flashes a second).
 */

export const STORM_EPOCH = 8;

function hash(n: number): number {
  let t = (n * 0x9e3779b1) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export interface Strike {
  /** 0..~0.5 brightness of the whole-arena flash */
  level: number;
  /** epoch number (seeds the bolt shape and x) */
  epoch: number;
  /** seconds since the strike began */
  age: number;
}

/** The strike active at time `t` (seconds), or null. */
export function stormStrike(t: number): Strike | null {
  if (t < 0) return null;
  const epoch = Math.floor(t / STORM_EPOCH);
  if (hash(epoch + 11) < 0.3) return null; // some epochs stay quiet
  const start = epoch * STORM_EPOCH + 1 + hash(epoch + 101) * (STORM_EPOCH - 3);
  const age = t - start;
  if (age < 0 || age > 1.6) return null;
  const pulse = (a: number, peak: number, rate: number): number => (a < 0 ? 0 : Math.min(a / 0.04, 1) * peak * Math.exp(-a * rate));
  const level = Math.min(0.5, pulse(age, 0.5, 7) + pulse(age - 0.32, 0.32, 8));
  return level < 0.01 ? null : { level, epoch, age };
}

/** Jagged bolt from the top edge: x/y points in world coordinates, seeded by the strike's epoch. */
export function boltPoints(epoch: number, width = 1000): { x: number; y: number }[] {
  let x = 380 + hash(epoch + 7) * (width - 460);
  let y = -10;
  const pts = [{ x, y }];
  const len = 5 + Math.floor(hash(epoch + 13) * 3);
  for (let i = 0; i < len; i++) {
    x += (hash(epoch * 31 + i) - 0.5) * 70;
    y += 38 + hash(epoch * 17 + i) * 34;
    pts.push({ x, y });
  }
  return pts;
}
