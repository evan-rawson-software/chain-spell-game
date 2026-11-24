/** Small seeded PRNG (mulberry32). */
export interface Rng {
  /** float in [0, 1) */
  next(): number;
  /** integer in [0, n) */
  int(n: number): number;
  pick<T>(arr: readonly T[]): T;
  /** index chosen proportionally to weights */
  weightedIndex(weights: readonly number[]): number;
  weighted<T>(items: readonly T[], weight: (item: T) => number): T;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number): number => Math.floor(next() * n);
  const weightedIndex = (weights: readonly number[]): number => {
    const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
    if (total <= 0) return int(weights.length);
    let r = next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= Math.max(0, weights[i]);
      if (r < 0) return i;
    }
    return weights.length - 1;
  };
  return {
    next,
    int,
    pick: (arr) => arr[int(arr.length)],
    weightedIndex,
    weighted: (items, weight) => items[weightedIndex(items.map(weight))],
  };
}
