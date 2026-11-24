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
        const keys = r.map((x) => (x.kind === 'rune' ? x.defId : 'mana'));
        expect(new Set(keys).size).toBe(3);
        for (const x of r) if (x.kind === 'rune') expect(['a', 'b', 'c', 'd', 'e', 'f', 'g']).toContain(x.defId);
      }
    }
  });
  it('elite and boss floors include +3 max mana', () => {
    for (const n of [5, 10]) {
      expect(rollRewards(floorDef(n), createRng(7), cat)).toContainEqual({ kind: 'maxMana', amount: 3 });
    }
  });
});
