import { describe, expect, it } from 'vitest';
import { combineBoons } from '../data/boons';
import { CATALOG } from '../data/runes';
import { eventFor, mageCost, resolveAltar, resolveDice, resolveFountain, resolveMage, resolveMerchant, resolveTome } from './events';
import { createRng } from './rng';
import { addBattleStats, dailySeed, emptyStats, loadRun, manaGain, newRun, saveRun, todayString } from './state';
import { cutCount, sellRune, sellValue, transmute } from './trade';

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};

describe('stats, daily and save upgrade', () => {
  it('accumulates battle stats', () => {
    let r = newRun(1);
    expect(r.stats).toEqual(emptyStats());
    r = addBattleStats(r, { won: true, kills: 5, damageTaken: 0, durationSec: 1, bestHit: 40, runeDamage: { a: 10, b: 5 }, reactionCounts: { melt: 2 } });
    r = addBattleStats(r, { won: true, kills: 3, damageTaken: 0, durationSec: 1, bestHit: 25, runeDamage: { a: 7 }, reactionCounts: { melt: 1, shatter: 4 } });
    r = addBattleStats(r, { won: false, kills: 1, damageTaken: 0, durationSec: 1 });
    expect(r.stats).toEqual({ battles: 3, kills: 9, bestHit: 40, runeDamage: { a: 17, b: 5 }, reactions: { melt: 3, shatter: 4 } });
  });

  it('seeds daily runs from the date string', () => {
    expect(dailySeed('2026-11-26')).toBe(dailySeed('2026-11-26'));
    expect(dailySeed('2026-11-26')).not.toBe(dailySeed('2026-11-27'));
    expect(todayString(new Date(2026, 10, 5))).toBe('2026-11-05');
    expect(newRun(dailySeed('2026-11-26'), undefined, '2026-11-26').daily).toBe('2026-11-26');
    expect(newRun(1).daily).toBeNull();
  });

  it('upgrades a saved run that lacks daily/stats and keeps node state', () => {
    const run = newRun(9);
    const old = { ...run } as Partial<typeof run>;
    delete old.daily;
    delete old.stats;
    store.set('chain-spell-run-v2', JSON.stringify({ run: old, phase: 'map', visited: [], sold: [] }));
    const loaded = loadRun()!;
    expect(loaded.run.daily).toBeNull();
    expect(loaded.run.stats).toEqual(emptyStats());
    expect(loaded.ns).toEqual({});
    saveRun(run, 'event', ['r1c0'], [], {});
    expect(loadRun()).toBeNull(); // a node phase needs run.at
    saveRun({ ...run, at: 'r1c0' }, 'event', ['r1c0'], [], { outcome: ['x'], rerolled: true, ops: 2 });
    expect(loadRun()!.ns).toEqual({ outcome: ['x'], rerolled: true, ops: 2 });
  });

  it('gives new node kinds +1 mana', () => {
    const t = combineBoons([]);
    for (const k of ['event', 'treasure', 'rest'] as const) expect(manaGain(k, t)).toBe(1);
  });
});

describe('selling, transmuting and events', () => {
  const runWith = (defs: string[]) => {
    const r = newRun(5);
    return { ...r, owned: defs.map((d, i) => ({ uid: `${d}-t${i}`, defId: d })), graph: { ...r.graph, nodes: r.graph.nodes.filter((n) => n.uid === 'root'), links: [] } };
  };
  const byRarity = (rar: string) => Object.values(CATALOG).filter((d) => d.rarity === rar && d.id !== 'source').map((d) => d.id);

  it('prices sales by rarity and forging', () => {
    const [c] = byRarity('common');
    const [u] = byRarity('uncommon');
    const [ra] = byRarity('rare');
    const [s] = byRarity('starter');
    expect(sellValue({ uid: 'a', defId: c })).toBe(15);
    expect(sellValue({ uid: 'a', defId: s })).toBe(15);
    expect(sellValue({ uid: 'a', defId: u })).toBe(25);
    expect(sellValue({ uid: 'a', defId: ra })).toBe(40);
    expect(sellValue({ uid: 'a', defId: ra, plus: true })).toBe(50);
  });

  it('selling a placed rune removes it (and dependents) from the spell', () => {
    const r = newRun(2);
    const first = r.graph.links.find((l) => l.from.uid === 'root')!.toUid;
    const n = cutCount(r, first);
    expect(n).toBeGreaterThanOrEqual(1);
    const sold = sellRune(r, first)!;
    expect(sold.cut.length).toBe(n);
    expect(sold.run.owned.some((o) => o.uid === first)).toBe(false);
    expect(sold.run.graph.nodes.some((x) => x.uid === first)).toBe(false);
    expect(sold.run.gold).toBe(r.gold + sold.gold);
    const owned = new Set(sold.run.owned.map((o) => o.uid));
    for (const x of sold.run.graph.nodes) if (x.uid !== 'root') expect(owned.has(x.uid)).toBe(true);
  });

  it('transmutes two same-tier runes one tier up', () => {
    const [c1, c2] = byRarity('common');
    const [u] = byRarity('uncommon');
    const r = runWith([c1, c2, u]);
    const t = transmute(r, r.owned[0].uid, r.owned[1].uid, createRng(3))!;
    expect(t.result.rarity).toBe('uncommon');
    expect(t.run.owned).toHaveLength(2);
    expect(transmute(r, r.owned[0].uid, r.owned[2].uid, createRng(3))).toBeNull();
    const rr = runWith(byRarity('rare').slice(0, 2));
    const t2 = transmute(rr, rr.owned[0].uid, rr.owned[1].uid, createRng(4))!;
    expect(t2.result.rarity).toBe('rare');
  });

  it('events resolve as specified', () => {
    const [c1, c2, c3] = byRarity('common');
    const r = { ...runWith([c1, c2, c3]), gold: 100 };
    expect(mageCost(r)).toBe(50);
    const m = resolveMage(r, createRng(1))!;
    expect(m.run.gold).toBe(50);
    expect(m.run.owned).toHaveLength(4);
    expect(['uncommon', 'rare']).toContain(CATALOG[m.run.owned[3].defId].rarity);
    expect(mageCost({ ...r, gold: 12 })).toBe(10);
    expect(resolveMage({ ...r, gold: 5 }, createRng(1))).toBeNull();

    const a = resolveAltar(r, r.owned[0].uid, createRng(1))!;
    expect(a.run.owned).toHaveLength(2);
    expect(a.run.owned.every((o) => o.plus)).toBe(true);

    const mer = resolveMerchant(r, r.owned[0].uid, createRng(1))!;
    expect(CATALOG[mer.run.owned[2].defId].rarity).toBe('uncommon');

    expect(resolveDice({ ...r, gold: 24 }, createRng(1))).toBeNull();
    const golds = Array.from({ length: 200 }, (_, i) => resolveDice(r, createRng(i))!.run.gold);
    expect(new Set(golds)).toEqual(new Set([75, 135]));
    const wins = golds.filter((g) => g === 135).length;
    expect(wins).toBeGreaterThan(70);
    expect(wins).toBeLessThan(130);

    expect(resolveFountain(r, 'hp', createRng(1))!.run.wardMaxHp).toBe(r.wardMaxHp + 15);
    expect(resolveFountain(r, 'curse', createRng(1))).toBeNull();

    expect(resolveTome(r, createRng(1))).toBeNull(); // nothing placed to forge
    const fresh = newRun(7);
    const tome = resolveTome(fresh, createRng(1))!;
    expect(tome.run.boons.length).toBe(fresh.boons.length + 1);
    expect(tome.run.graph.nodes.filter((n) => n.uid !== 'root').every((n) => n.plus)).toBe(true);
    expect(resolveFountain(tome.run, 'curse', createRng(1))!.run.boons.length).toBe(fresh.boons.length);
  });

  it('picks the same event for the same node', () => {
    expect(eventFor(1, 'r3c0')).toBe(eventFor(1, 'r3c0'));
    expect(new Set(Array.from({ length: 100 }, (_, i) => eventFor(i, 'r3c0'))).size).toBe(6);
  });
});
