import { describe, expect, it } from 'vitest';
import { BOONS, NEUTRAL_MODS, combineBoons } from './boons';
import { SCHOOLS } from './schools';
import { CATALOG, ROOT_UID, SOURCE_ID, starterGraph } from './runes';
import { compileSpell, validateSpell } from '../spell';
import type { RuneInstance } from '../types';

describe('boons', () => {
  it('ids are unique snake_case and spell mods are shot stats only', () => {
    const ids = Object.values(BOONS).map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [key, b] of Object.entries(BOONS)) {
      expect(b.id).toBe(key);
      expect(b.id).toMatch(/^[a-z]+(_[a-z]+)*$/);
      expect(b.description.length).toBeGreaterThan(5);
      for (const m of b.spell ?? []) expect(['castTime', 'manaCost']).not.toContain(m.stat);
    }
    expect(ids).toHaveLength(20);
  });
  it('combine [] is neutral', () => {
    const t = combineBoons([]);
    expect(t.battle).toEqual(NEUTRAL_MODS);
    expect(t).toMatchObject({ spell: [], wardHp: 0, goldMul: 1, priceMul: 1, rewardOffer: 0, manaGain: 0 });
  });
  it('combines multiplicatively and additively; ignores unknown; duplicates stack', () => {
    const t = combineBoons(['thick_hide', 'thick_hide', 'mending', 'mending', 'stoneskin', 'frailty', 'prosperity', 'greed',
      'abundance', 'scarcity', 'abundance', 'wellspring', 'drought', 'wellspring', 'keen_edge', 'dull_edge', 'nope', 'catalysis']);
    expect(t.battle.enemyHpMul).toBeCloseTo(1.44);
    expect(t.battle.wardRegen).toBe(2);
    expect(t.battle.reactionDamageMul).toBe(1.5);
    expect(t.wardHp).toBe(5);
    expect(t.goldMul).toBeCloseTo(1.3);
    expect(t.priceMul).toBeCloseTo(1.3);
    expect(t.rewardOffer).toBe(1);
    expect(t.manaGain).toBe(1);
    expect(t.spell).toHaveLength(2);
  });
});

describe('schools', () => {
  it('kits exist, boons are blessings, starter graphs validate and compile', () => {
    for (const sc of SCHOOLS) {
      for (const id of sc.kit) expect(CATALOG[id], `${sc.id}:${id}`).toBeDefined();
      expect(sc.boon && BOONS[sc.boon]?.kind).toBe('blessing');
      const owned: RuneInstance[] = sc.kit.map((defId, i) => ({ uid: `r${i}`, defId }));
      const g = starterGraph(owned, sc.id);
      expect(g.nodes[0]).toEqual({ uid: ROOT_UID, defId: SOURCE_ID });
      const v = validateSpell(g, CATALOG, 8);
      expect(v.errors, sc.id).toEqual([]);
      expect(compileSpell(g, CATALOG).shots.length).toBeGreaterThanOrEqual(1);
    }
  });
});
