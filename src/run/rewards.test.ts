import { describe, expect, it } from 'vitest';
import { REWARD_OFFER, goldReward, rollBoons, rollRewards } from './rewards';
import { createRng } from './rng';
import { floorDef } from './floors';
import type { BoonDef, Rarity, RuneCatalog, RuneDef } from '../types';

const mk = (id: string, rarity: Rarity): RuneDef => ({
  id, name: id, description: '', rarity, inputs: id === 'source' ? [] : ['R'], outputs: [], mana: 1, castTime: 0,
});
const cat: RuneCatalog = {};
const entries: [string, Rarity][] = [['source', 'starter'], ['fb', 'starter'], ['a', 'common'], ['b', 'common'],
  ['c', 'common'], ['h', 'common'], ['d', 'uncommon'], ['e', 'uncommon'], ['f', 'rare'], ['g', 'rare']];
for (const [id, r] of entries) cat[id] = mk(id, r);

describe('rollRewards', () => {
  it('is deterministic for a seed', () => {
    for (let n = 1; n <= 10; n++) {
      expect(rollRewards(floorDef(n), createRng(42 + n), REWARD_OFFER, cat))
        .toEqual(rollRewards(floorDef(n), createRng(42 + n), REWARD_OFFER, cat));
    }
  });
  it('returns 5 distinct options, no starters', () => {
    for (let s = 0; s < 200; s++) {
      for (const n of [1, 5, 7, 10]) {
        const r = rollRewards(floorDef(n), createRng(s), REWARD_OFFER, cat);
        expect(r).toHaveLength(REWARD_OFFER);
        expect(new Set(r.map((x) => x.defId)).size).toBe(REWARD_OFFER);
        for (const x of r) {
          expect(x.kind).toBe('rune');
          expect(['a', 'b', 'c', 'h', 'd', 'e', 'f', 'g']).toContain(x.defId);
        }
      }
    }
  });
  it('honors a custom count, at least 1', () => {
    expect(rollRewards(floorDef(3), createRng(1), 7, cat)).toHaveLength(7);
    expect(rollRewards(floorDef(3), createRng(1), 3, cat)).toHaveLength(3);
    expect(rollRewards(floorDef(3), createRng(1), 0, cat)).toHaveLength(1);
  });
  it('never offers max mana (it grows automatically)', () => {
    for (let s = 0; s < 50; s++) {
      for (const n of [1, 5, 10]) for (const x of rollRewards(floorDef(n), createRng(s), REWARD_OFFER, cat)) expect(x.kind).toBe('rune');
    }
  });
});

describe('floorDef', () => {
  it('lets the node decide the kind', () => {
    expect(floorDef(3, 'battle').kind).toBe('normal');
    expect(floorDef(3, 'elite').kind).toBe('elite');
    expect(floorDef(10, 'boss').kind).toBe('boss');
  });
  it('adds an elite knight to the middle wave and +10% HP for elites', () => {
    const base = floorDef(6, 'battle');
    const elite = floorDef(6, 'elite');
    expect(elite.hpScale).toBeCloseTo(base.hpScale * 1.1);
    const mid = Math.floor(base.waves.length / 2);
    expect(elite.waves[mid].groups.some((g) => g.kind === 'elite_knight')).toBe(true);
    expect(base.waves[mid].groups.some((g) => g.kind === 'elite_knight')).toBe(false);
  });
});

describe('goldReward / rollBoons', () => {
  it('scales gold by row and kind', () => {
    expect(goldReward('battle', 2)).toBe(21);
    expect(goldReward('elite', 5)).toBe(60);
    expect(goldReward('shop', 5)).toBe(0);
  });
  it('rolls distinct unheld boons of a kind', () => {
    const b = (id: string, kind: BoonDef['kind']): BoonDef => ({ id, name: id, description: '', kind });
    const boons = Object.fromEntries([b('a', 'blessing'), b('b', 'blessing'), b('c', 'blessing'), b('d', 'blessing'), b('x', 'curse')].map((x) => [x.id, x]));
    for (let s = 0; s < 50; s++) {
      const r = rollBoons('blessing', ['a'], createRng(s), 3, boons);
      expect(r).toHaveLength(3);
      expect(r.map((x) => x.id)).not.toContain('a');
      expect(r.every((x) => x.kind === 'blessing')).toBe(true);
    }
    expect(rollBoons('curse', ['x'], createRng(1), 1, boons)).toHaveLength(0);
  });
});
