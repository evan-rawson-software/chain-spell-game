import { describe, expect, it } from 'vitest';
import { combineBoons } from '../data/boons';
import { SCHOOLS } from '../data/schools';
import { addBoon, addGold, effectiveWardHp, forgeRune, manaGain, newRun, removeBoon } from './state';

describe('run state', () => {
  it('builds a run from the school', () => {
    for (const school of SCHOOLS) {
      const r = newRun(11, school.id);
      expect(r.school).toBe(school.id);
      expect(r.owned.map((o) => o.defId)).toEqual(school.kit);
      expect(r.owned.map((o) => o.uid)).toEqual(school.kit.map((id, i) => `${id}-${i}`));
      expect(r.gold).toBe(20);
      expect(r.at).toBeNull();
      expect(r.floor).toBe(1);
      expect(r.boons).toEqual(school.boon ? [school.boon] : []);
      expect(r.map.rows).toHaveLength(10);
    }
  });

  it('computes mana gain per node kind', () => {
    const t = combineBoons([]);
    expect(manaGain('battle', t)).toBe(2);
    expect(manaGain('elite', t)).toBe(3);
    expect(manaGain('boss', t)).toBe(0);
    for (const k of ['shop', 'forge', 'shrine'] as const) expect(manaGain(k, t)).toBe(1);
    expect(manaGain('battle', { ...t, manaGain: 1 })).toBe(3);
    expect(manaGain('battle', { ...t, manaGain: -5 })).toBe(0);
    expect(manaGain('shop', { ...t, manaGain: 1 })).toBe(1);
  });

  it('forges the owned entry and the placed copy', () => {
    const r = newRun(3);
    const uid = r.graph.nodes.find((n) => n.uid !== 'root')!.uid;
    const f = forgeRune(r, uid);
    expect(f.owned.find((o) => o.uid === uid)!.plus).toBe(true);
    expect(f.graph.nodes.find((o) => o.uid === uid)!.plus).toBe(true);
    expect(r.owned.find((o) => o.uid === uid)!.plus).toBeUndefined();
  });

  it('adds and removes boons, scales gold, floors ward HP at 1', () => {
    const r = newRun(3);
    const t = combineBoons([]);
    expect(addBoon(addBoon(r, 'greed'), 'greed').boons.filter((b) => b === 'greed')).toHaveLength(1);
    expect(removeBoon(addBoon(r, 'greed'), 'greed').boons).not.toContain('greed');
    expect(addGold(r, 15, { ...t, goldMul: 1.5 }).gold).toBe(r.gold + 23);
    expect(effectiveWardHp(r, { ...t, wardHp: -500 })).toBe(1);
  });
});
