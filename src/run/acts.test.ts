import { beforeEach, describe, expect, it } from 'vitest';
import { combineBoons } from '../data/boons';
import { FUSIONS } from '../data/fusions';
import { CATALOG } from '../data/runes';
import { removeRune } from '../spell';
import type { RunState } from '../types';
import { fuse, craftableRecipes, fusionCut, ingredients, recipeBook } from './fusion';
import { HISTORY_MAX, HISTORY_KEY, addEntry, buildEntry, loadHistory, recordRunEnd } from './history';
import { generateMap } from './map';
import { advanceAct, emptyGraph, forgeRune, loadRun, loadoutUsed, manaGain, newRun, saveRun, switchLoadout, takeDiscardNotice } from './state';
import {
  TELEMETRY_MAX, TELEMETRY_KEY, capRuns, damageShare, finishRun, loadTelemetry, newTelemetryRun, recordFusion, recordOffer, recordPurchase,
  updateTelemetry,
} from './telemetry';
import { canTransmute, dropRune, sellRune, sellValue, transmute } from './trade';
import { createRng } from './rng';

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};
beforeEach(() => store.clear());

/** Elementalist (amplify, fireball, frost_bolt) holding the fusion ingredients for steam_burst. */
const elementalist = (): RunState => newRun(5, 'elementalist');

describe('acts', () => {
  it('starts at act 1 with an ability, three loadout slots and an act-1 map', () => {
    const r = newRun(3, 'elementalist', null, 'detonate');
    expect(r.act).toBe(1);
    expect(r.ability).toBe('detonate');
    expect(r.loadouts).toEqual([r.graph, null, null]);
    expect(r.map).toEqual(generateMap(3, 1));
  });

  it('advances to the next act with a fresh map, keeping everything owned', () => {
    let r = newRun(3);
    r = { ...r, at: r.map.rows[5][0].id, floor: 6, gold: 77 };
    const n = advanceAct(r);
    expect(n.act).toBe(2);
    expect(n.map).toEqual(generateMap(3, 2));
    expect(n.at).toBeNull();
    expect(n.floor).toBe(1);
    expect(n.gold).toBe(77);
    expect(n.owned).toBe(r.owned);
    expect(advanceAct(advanceAct(n)).act).toBe(3);
    expect(advanceAct(advanceAct(advanceAct(n))).act).toBe(3);
  });

  it('pays an act boss like an elite (mana) through the elite kind', () => {
    const t = combineBoons([]);
    expect(manaGain('elite', t)).toBe(3);
    expect(manaGain('boss', t)).toBe(0);
  });
});

describe('save format', () => {
  it('round-trips act, ability and loadouts', () => {
    const base = newRun(8, 'elementalist', null, 'ward_pulse');
    const r = switchLoadout({ ...base, act: 2, map: generateMap(8, 2) }, 1);
    saveRun(r, 'map', [], [], {});
    const loaded = loadRun()!;
    expect(loaded.run.act).toBe(2);
    expect(loaded.run.ability).toBe('ward_pulse');
    expect(loaded.run.loadout).toBe(1);
    expect(loaded.run.loadouts[0]!.nodes.length).toBe(base.graph.nodes.length);
    expect(loaded.run.graph).toEqual(emptyGraph());
  });

  it('fills defaults for a v3 save missing the new fields', () => {
    const r = newRun(8) as Partial<RunState>;
    delete r.ability;
    delete r.act;
    delete r.loadouts;
    delete r.loadout;
    store.set('chain-spell-run-v3', JSON.stringify({ run: r, phase: 'map', visited: [], sold: [] }));
    const loaded = loadRun()!;
    expect(loaded.run.act).toBe(1);
    expect(loaded.run.ability).toBe('overcast');
    expect(loaded.run.loadout).toBe(0);
    expect(loaded.run.loadouts).toEqual([loaded.run.graph, null, null]);
  });

  it('discards old v2 saves (10-row maps) and says so once', () => {
    store.set('chain-spell-run-v2', JSON.stringify({ run: { map: { rows: new Array(10).fill([]) } }, phase: 'map' }));
    expect(loadRun()).toBeNull();
    expect(store.has('chain-spell-run-v2')).toBe(false);
    expect(takeDiscardNotice()).toBe(true);
    expect(takeDiscardNotice()).toBe(false);
    expect(loadRun()).toBeNull();
    expect(takeDiscardNotice()).toBe(false);
  });

  it('drops loadout slots that name runes you no longer own', () => {
    const base = newRun(8, 'elementalist');
    const ghost = { rootUid: 'root', nodes: [{ uid: 'root', defId: 'source' }, { uid: 'nope-9', defId: 'fireball' }], links: [] };
    saveRun({ ...base, loadouts: [base.graph, ghost, null] } as RunState, 'map');
    expect(loadRun()!.run.loadouts[1]).toBeNull();
  });
});

describe('loadouts', () => {
  it('switches slots, saving the current spell and starting empty slots as the Source alone', () => {
    const r0 = elementalist();
    const r1 = switchLoadout(r0, 1);
    expect(r1.loadout).toBe(1);
    expect(r1.graph).toEqual(emptyGraph());
    expect(r1.loadouts[0]).toBe(r0.graph);
    expect(loadoutUsed(r1, 0)).toBe(true);
    expect(loadoutUsed(r1, 1)).toBe(false);
    const back = switchLoadout(r1, 0);
    expect(back.graph).toBe(r0.graph);
    expect(switchLoadout(r0, 0)).toBe(r0);
    expect(switchLoadout(r0, 3)).toBe(r0);
  });

  it('removes a sold rune from every loadout, and forging marks every copy', () => {
    const r0 = elementalist();
    const uid = r0.graph.links.find((l) => l.from.uid === 'root')!.toUid;
    // slot 1 holds the same spell
    const r1 = { ...r0, loadouts: [r0.graph, r0.graph, null] as RunState['loadouts'] };
    const forged = forgeRune(r1, uid);
    expect(forged.loadouts[1]!.nodes.find((n) => n.uid === uid)!.plus).toBe(true);
    expect(forged.graph.nodes.find((n) => n.uid === uid)!.plus).toBe(true);
    const sold = sellRune(r1, uid)!;
    expect(sold.run.graph.nodes.some((n) => n.uid === uid)).toBe(false);
    expect(sold.run.loadouts[1]!.nodes.some((n) => n.uid === uid)).toBe(false);
    expect(sold.run.loadouts[1]).toEqual(removeRune(r0.graph, uid));
    expect(sold.run.owned.some((o) => o.uid === uid)).toBe(false);
    // dropping from a spell that is not active still counts
    const away = switchLoadout(r1, 2);
    const dropped = dropRune(away, uid);
    expect(dropped.run.loadouts[0]!.nodes.some((n) => n.uid === uid)).toBe(false);
    expect(dropped.run.loadouts[1]!.nodes.some((n) => n.uid === uid)).toBe(false);
  });
});

describe('fusion', () => {
  it('knows every recipe result in the catalog as a fused rune', () => {
    for (const f of FUSIONS) {
      expect(CATALOG[f.a]).toBeTruthy();
      expect(CATALOG[f.b]).toBeTruthy();
      expect(CATALOG[f.result].rarity).toBe('fused');
    }
  });

  it('shows ??? status and craftability from what you own', () => {
    const r = elementalist(); // fireball + frost_bolt
    const steam = recipeBook(r).find((s) => s.recipe.result === 'steam_burst')!;
    expect(steam.known).toBe(true);
    expect(steam.craftable).toBe(true);
    const lightning = recipeBook(r).find((s) => s.recipe.result === 'stormfrost_spear')!;
    expect(lightning.known).toBe(false);
    expect(lightning.craftable).toBe(false);
    expect(craftableRecipes(r).map((x) => x.result)).toContain('steam_burst');
  });

  it('consumes one copy of each ingredient, removing placed ones from the spell and every loadout', () => {
    const r0 = elementalist();
    const recipe = FUSIONS.find((f) => f.result === 'steam_burst')!;
    const cut = fusionCut(r0, recipe);
    expect(cut).toBeGreaterThan(0);
    const pair = ingredients(r0, recipe)!;
    const withSlot = { ...r0, loadouts: [r0.graph, r0.graph, null] as RunState['loadouts'] };
    const res = fuse(withSlot, recipe)!;
    expect(res.result.id).toBe('steam_burst');
    expect(res.run.owned.some((o) => pair.some((p) => p.uid === o.uid))).toBe(false);
    expect(res.run.owned.some((o) => o.defId === 'steam_burst')).toBe(true);
    expect(res.run.owned.length).toBe(r0.owned.length - 1);
    for (const g of [res.run.graph, res.run.loadouts[1]!]) for (const p of pair) expect(g.nodes.some((n) => n.uid === p.uid)).toBe(false);
    expect(fuse(res.run, recipe)).toBeNull(); // ingredients are gone
  });

  it('needs two copies when both ingredients are the same rune', () => {
    const same = { a: 'fireball', b: 'fireball', result: 'steam_burst' };
    const r = elementalist();
    expect(ingredients(r, same)).toBeNull();
    const two = { ...r, owned: [...r.owned, { uid: 'fireball-9', defId: 'fireball' }] };
    expect(ingredients(two, same)!.map((i) => i.uid).sort()).toEqual(['fireball-1', 'fireball-9']);
  });

  it('sells fused runes for 50 and refuses to transmute them', () => {
    expect(sellValue({ uid: 'x', defId: 'steam_burst' })).toBe(50);
    expect(sellValue({ uid: 'x', defId: 'steam_burst', plus: true })).toBe(60);
    const r = elementalist();
    const withFused = { ...r, owned: [...r.owned, { uid: 'steam_burst-8', defId: 'steam_burst' }, { uid: 'steam_burst-9', defId: 'steam_burst' }] };
    expect(canTransmute({ uid: 'x', defId: 'steam_burst' })).toBe(false);
    expect(transmute(withFused, 'steam_burst-8', 'steam_burst-9', createRng(1))).toBeNull();
    expect(sellRune(withFused, 'steam_burst-8')!.gold).toBe(50);
  });
});

describe('history', () => {
  it('builds an entry with where the run ended and the top rune', () => {
    const r = elementalist();
    const run: RunState = {
      ...r, act: 2, map: generateMap(5, 2), at: 'a2r6c0', floor: 6,
      stats: { battles: 9, kills: 120, bestHit: 321.7, runeDamage: { 'fireball-1': 500, 'frost_bolt-2': 200, 'gone-4': 50 }, reactions: {} },
    };
    const e = buildEntry(run, 'lost', new Date('2026-11-26T12:00:00Z'));
    expect(e).toMatchObject({ school: 'elementalist', ability: 'overcast', outcome: 'lost', act: 2, row: 6, kills: 120, bestHit: 322, seed: 5, daily: null });
    expect(e.topRune).toEqual({ defId: 'fireball', damage: 500 });
    expect(e.boss).toBeTruthy();
    expect(e.code.startsWith('CS1.')).toBe(true);
    expect(buildEntry(run, 'won').act).toBe(3);
    expect(buildEntry({ ...run, act: 1, at: null, floor: 3 }, 'abandoned').boss).toBeNull();
  });

  it('keeps the newest 30, newest first', () => {
    let list: ReturnType<typeof loadHistory> = [];
    for (let i = 0; i < 40; i++) list = addEntry(list, { ...buildEntry(elementalist(), 'lost'), kills: i });
    expect(list).toHaveLength(HISTORY_MAX);
    expect(list[0].kills).toBe(39);
    expect(list[29].kills).toBe(10);
  });

  it('records at the end of a run (history and telemetry) and survives bad storage', () => {
    recordRunEnd(elementalist(), 'abandoned');
    recordRunEnd(elementalist(), 'won');
    expect(loadHistory().map((e) => e.outcome)).toEqual(['won', 'abandoned']);
    expect(loadTelemetry()[0].end).toMatchObject({ result: 'abandoned', act: 1, row: 1 });
    store.set(HISTORY_KEY, '{bad');
    expect(loadHistory()).toEqual([]);
  });
});

describe('telemetry', () => {
  it('logs offers, purchases and fusions, then closes with the final spell and damage share', () => {
    const run = elementalist();
    let t = newTelemetryRun(run, new Date('2026-11-26T12:00:00Z'));
    t = recordOffer(t, { source: 'battle', act: 1, row: 1, offered: ['a', 'b', 'c'], taken: ['a'] });
    t = recordPurchase(t, { act: 1, row: 5, kind: 'rune', defId: 'a', gold: 30 });
    t = recordFusion(t, { act: 1, row: 5, a: 'fireball', b: 'frost_bolt', result: 'steam_burst', gold: 0 });
    expect(t.offers).toHaveLength(1);
    expect(t.purchases[0].gold).toBe(30);
    expect(t.fusions[0].result).toBe('steam_burst');
    const done = finishRun(t, { ...run, stats: { ...run.stats, runeDamage: { 'fireball-1': 75, 'frost_bolt-2': 25 }, reactions: { melt: 3 } } }, 'lost', 2, 4);
    expect(done.finalSpell).toEqual(run.graph.nodes.filter((n) => n.uid !== 'root').map((n) => n.defId));
    expect(done.damageShare).toEqual({ fireball: 0.75, frost_bolt: 0.25 });
    expect(done.reactions).toEqual({ melt: 3 });
    expect(done.end).toEqual({ act: 2, row: 4, result: 'lost' });
    expect(damageShare(run)).toEqual({});
  });

  it('caps stored runs at 200 and updates the open record of the same run', () => {
    const run = elementalist();
    const many = Array.from({ length: 250 }, (_, i) => ({ ...newTelemetryRun({ ...run, seed: i }), id: String(i) }));
    const capped = capRuns(many);
    expect(capped).toHaveLength(TELEMETRY_MAX);
    expect(capped[0].id).toBe('50');
    store.set(TELEMETRY_KEY, JSON.stringify({ v: 1, runs: many }));
    updateTelemetry({ ...run, seed: 249 }, (t) => recordOffer(t, { source: 'battle', act: 1, row: 1, offered: [], taken: [] }));
    expect(loadTelemetry()).toHaveLength(TELEMETRY_MAX);
    expect(loadTelemetry().at(-1)!.offers).toHaveLength(1);
    // a new seed starts a new record; finished records are not reopened
    updateTelemetry({ ...run, seed: 999 }, (t) => t);
    expect(loadTelemetry()).toHaveLength(TELEMETRY_MAX);
    store.set(TELEMETRY_KEY, '{nope');
    expect(loadTelemetry()).toEqual([]);
  });
});
