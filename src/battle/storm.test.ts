import { describe, expect, it } from 'vitest';
import { STORM_EPOCH, boltPoints, stormStrike } from './storm';

describe('storm schedule', () => {
  it('is deterministic and never exceeds a soft brightness', () => {
    let strikes = 0;
    for (let t = 0; t < 200; t += 0.05) {
      const a = stormStrike(t);
      expect(stormStrike(t)).toEqual(a);
      if (a) { strikes++; expect(a.level).toBeLessThanOrEqual(0.5); }
    }
    expect(strikes).toBeGreaterThan(0);
  });
  it('is quiet most of the time and at most one strike per epoch', () => {
    let lit = 0, total = 0;
    for (let t = 0; t < 400; t += 0.1) { total++; if (stormStrike(t)) lit++; }
    expect(lit / total).toBeLessThan(0.2);
    for (let e = 0; e < 40; e++) {
      const inEpoch = new Set<number>();
      for (let t = e * STORM_EPOCH; t < (e + 1) * STORM_EPOCH; t += 0.05) {
        const s = stormStrike(t);
        if (s) inEpoch.add(s.epoch);
      }
      expect(inEpoch.size).toBeLessThanOrEqual(1);
    }
  });
  it('bolt starts at the top and descends', () => {
    const b = boltPoints(3);
    expect(b[0].y).toBeLessThan(0);
    expect(b[b.length - 1].y).toBeGreaterThan(b[0].y + 100);
  });
});
