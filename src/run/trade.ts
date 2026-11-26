import { CATALOG, SOURCE_ID } from '../data/runes';
import { defOf } from '../spell';
import type { Rarity, RunState, RuneDef, RuneInstance } from '../types';
import type { Rng } from './rng';
import { allLoadouts, applyReward, removeFromLoadouts } from './state';

export type Tier = 'common' | 'uncommon' | 'rare' | 'fused';

/** Starter runes count as common. */
export function tierOf(rarity: Rarity): Tier {
  return rarity === 'starter' ? 'common' : rarity;
}

export const SELL_PRICE: Record<Tier, number> = { common: 15, uncommon: 25, rare: 40, fused: 50 };
export const FORGED_SELL_BONUS = 10;

export function instTier(inst: RuneInstance): Tier {
  return tierOf(CATALOG[inst.defId]?.rarity ?? 'common');
}

/** Gold for selling a rune: 15/25/40/50 (common/uncommon/rare/fused), +10 if forged. */
export function sellValue(inst: RuneInstance): number {
  return SELL_PRICE[instTier(inst)] + (inst.plus ? FORGED_SELL_BONUS : 0);
}

/** Fused runes can't be transmuted or traded up. */
export const canTransmute = (inst: RuneInstance): boolean => instTier(inst) !== 'fused';

/** The tier a transmute / trade produces (rare stays rare: a random rare or keystone). Not defined for fused. */
export function nextTier(t: Tier): Tier {
  return t === 'common' ? 'uncommon' : 'rare';
}

/** Runes (catalog defs) of a tier that can be handed out. Keystones are rare. */
export function poolOf(tier: Tier): RuneDef[] {
  if (tier === 'fused') return [];
  return Object.values(CATALOG).filter((d) => d.id !== SOURCE_ID && d.rarity !== 'starter' && d.rarity === tier);
}

/** A random rune one tier above `from`, avoiding `exclude` defIds when another choice exists. */
export function rollHigher(from: Tier, rng: Rng, exclude: readonly string[] = []): RuneDef | undefined {
  if (from === 'fused') return undefined;
  const pool = poolOf(nextTier(from));
  if (!pool.length) return undefined;
  const fresh = pool.filter((d) => !exclude.includes(d.id));
  return rng.pick(fresh.length ? fresh : pool);
}

/**
 * Removes a rune from the run entirely. If it is placed, it and everything fed by it leave the spell; every other
 * loadout loses it (and its dependents) too. `cut` lists the runes that left the *active* spell.
 */
export function dropRune(run: RunState, uid: string): { run: RunState; cut: RuneInstance[] } {
  const next = removeFromLoadouts(run, uid);
  const keep = new Set(next.graph.nodes.map((n) => n.uid));
  const cut = run.graph.nodes.filter((n) => !keep.has(n.uid));
  return { run: { ...next, owned: run.owned.filter((o) => o.uid !== uid) }, cut };
}

/** True if the rune sits in the active spell or any loadout. */
export function isPlaced(run: RunState, uid: string): boolean {
  return allLoadouts(run).some((g) => g?.nodes.some((n) => n.uid === uid));
}

/** How many runes (the rune itself and its dependents) would leave the spell if `uid` were dropped. */
export function cutCount(run: RunState, uid: string): number {
  return dropRune(run, uid).cut.length;
}

export function runeLabel(inst: RuneInstance): string {
  return defOf(CATALOG, inst)?.name ?? inst.defId;
}

/** Sell: the rune leaves the run for gold. */
export function sellRune(run: RunState, uid: string): { run: RunState; gold: number; cut: RuneInstance[] } | null {
  const inst = run.owned.find((o) => o.uid === uid);
  if (!inst) return null;
  const gold = sellValue(inst);
  const d = dropRune(run, uid);
  return { run: { ...d.run, gold: d.run.gold + gold }, gold, cut: d.cut };
}

/** Transmute two runes of one tier into a random rune a tier higher. */
export function transmute(run: RunState, uidA: string, uidB: string, rng: Rng): { run: RunState; result: RuneDef; cut: RuneInstance[] } | null {
  const a = run.owned.find((o) => o.uid === uidA);
  const b = run.owned.find((o) => o.uid === uidB);
  if (!a || !b || a.uid === b.uid || instTier(a) !== instTier(b) || !canTransmute(a)) return null;
  const result = rollHigher(instTier(a), rng, [a.defId, b.defId]);
  if (!result) return null;
  const first = dropRune(run, a.uid);
  const second = dropRune(first.run, b.uid);
  const next = applyReward(second.run, { kind: 'rune', defId: result.id });
  return { run: next, result, cut: [...first.cut, ...second.cut] };
}
