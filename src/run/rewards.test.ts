import { describe, expect, it } from 'vitest';
import { rollRewards } from './rewards';
import { createRng } from './rng';
import { floorDef } from './floors';
import type { Rarity, RuneCatalog, RuneDef } from '../types';

const mk = (id: string, rarity: Rarity): RuneDef => ({
  id, name: id, description: '', rarity, inputs: id === 'source' ? [] : ['R'], outputs: [], mana: 1, castTime: 0,
});
const cat: RuneCatalog = {};
const entries: [string, Rarity][] = [['source', 'starter'], ['fb', 'starter'], ['a', 'common'], ['b', 'common'],
  ['c', 'common'], ['d', 'uncommon'], ['e', 'uncommon'], ['f', 'rare'], ['g', 'rare']];
for (const [id, r] of entries) cat[id] = mk(id, r);

describe('rollRewards', () => {
  it('is deterministic for a seed', () => {
    for (let n = 1; n <= 10; n++) {
      expect(rollRewards(floorDef(n), createRng(42 + n), cat)).toEqual(rollRewards(floorDef(n), createRng(42 + n), cat));
    }
  });
  it('returns 3 distinct options, no starters', () => {
    for (let s = 0; s < 200; s++) {
      for (const n of [1, 5, 7, 10]) {
        const r = rollRewards(floorDef(n), createRng(s), cat);
        expect(r).toHaveLength(3);
        expect(new Set(r.map((x) => x.defId)).size).toBe(3);
        for (const x of r) {
          expect(x.kind).toBe('rune');
          expect(['a', 'b', 'c', 'd', 'e', 'f', 'g']).toContain(x.defId);
        }
      }
    }
  });
  it('never offers max mana (it grows automatically)', () => {
    for (let s = 0; s < 50; s++) {
      for (const n of [1, 5, 10]) for (const x of rollRewards(floorDef(n), createRng(s), cat)) expect(x.kind).toBe('rune');
    }
  });
});
