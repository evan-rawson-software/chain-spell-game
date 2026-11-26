import { describe, expect, it } from 'vitest';
import type { ResolvedShot } from '../types';
import { newStatus } from './status';
import { consumedKeys, planReactions } from './reactions';
import {
  canReact, canSplit, echoDue, frostfireStatuses, keystoneFlags, momentumLabel, momentumMul,
  shardHeadings, shardShot,
} from './keystones';

const shot: ResolvedShot = {
  element: 'fire', damage: 40, speed: 300, size: 9, aoeRadius: 50, count: 3, spreadDeg: 20, pierce: 2, homing: 0, chain: 2,
  statuses: [{ kind: 'burn', potency: 5, duration: 2 }], runeName: 'F', sourceUid: 'u',
} as ResolvedShot;

describe('keystones', () => {
  it('flags default off and read the list', () => {
    expect(Object.values(keystoneFlags([])).some(Boolean)).toBe(false);
    expect(keystoneFlags(['echo', 'momentum'])).toMatchObject({ echo: true, momentum: true, everlasting: false });
  });
  it('echo fires on every 3rd cast', () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(echoDue)).toEqual([false, false, true, false, false, true, true]);
    expect(echoDue(0)).toBe(false);
  });
  it('momentum scales 10% per cast and caps at x2', () => {
    expect(momentumMul(0)).toBe(1);
    expect(momentumMul(4)).toBeCloseTo(1.4);
    expect(momentumMul(10)).toBe(2);
    expect(momentumMul(50)).toBe(2);
    expect(momentumLabel(0)).toBeNull();
    expect(momentumLabel(4)).toBe('Momentum +40%');
  });
  it('death split makes two shards at +-30 deg, half damage, never recursing', () => {
    const [a, b] = shardHeadings(1);
    expect(b - a).toBeCloseTo(Math.PI / 3);
    const sh = shardShot(shot);
    expect(sh.damage).toBe(20);
    expect(sh.element).toBe('fire');
    expect(sh.statuses).toEqual(shot.statuses);
    expect(sh.size).toBeLessThanOrEqual(4);
    expect(sh.aoeRadius + sh.pierce + sh.chain).toBe(0);
    expect(sh.homing).toBeGreaterThan(0);
    expect(canSplit(true, false)).toBe(true);
    expect(canSplit(true, true)).toBe(false);
    expect(canSplit(false, false)).toBe(false);
  });
  it('everlasting keeps statuses', () => {
    const st = newStatus();
    st.freeze = 2;
    const plans = planReactions(st, 'fire');
    expect(consumedKeys(plans, false)).toContain('freeze');
    expect(consumedKeys(plans, true)).toEqual([]);
  });
  it('chain reaction is depth-limited to 3', () => {
    expect(canReact(0, false)).toBe(true);
    expect(canReact(1, false)).toBe(false);
    expect([1, 2, 3].every(d => canReact(d, true))).toBe(true);
    expect(canReact(4, true)).toBe(false);
  });
  it('frostfire adds the opposite status', () => {
    expect(frostfireStatuses('fire')).toEqual([{ kind: 'slow', potency: 0.3, duration: 1.5 }]);
    expect(frostfireStatuses('frost')).toEqual([{ kind: 'burn', potency: 5, duration: 2 }]);
    expect(frostfireStatuses('nature')).toEqual([]);
  });
});
