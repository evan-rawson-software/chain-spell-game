import { describe, expect, it } from 'vitest';
import { damageTextSize, isLargeCast, multiKillTitle } from './juice';

describe('juice helpers', () => {
  it('multi-kill titles', () => {
    expect(multiKillTitle(2)).toBeNull();
    expect(multiKillTitle(3)).toBe('TRIPLE');
    expect(multiKillTitle(5)).toContain('MULTI-KILL');
    expect(multiKillTitle(9)).toContain('MASSACRE');
  });
  it('damage text grows and clamps', () => {
    expect(damageTextSize(1)).toBe(12);
    expect(damageTextSize(100)).toBeCloseTo(22);
    expect(damageTextSize(1e9)).toBe(30);
  });
  it('large cast: 6+ projectiles or 300+ damage', () => {
    expect(isLargeCast([{ count: 1, damage: 40 }])).toBe(false);
    expect(isLargeCast([{ count: 3, damage: 10 }, { count: 3, damage: 10 }])).toBe(true);
    expect(isLargeCast([{ count: 1, damage: 300 }])).toBe(true);
  });
});
