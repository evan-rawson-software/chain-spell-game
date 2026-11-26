import { BOONS } from '../data/boons';
import { CATALOG, SOURCE_ID } from '../data/runes';
import type { BoonDef, FloorDef, Reward, Rarity, RuneCatalog, MapNodeKind } from '../types';
import { createRng, type Rng } from './rng';

type DropRarity = Exclude<Rarity, 'starter'>;

/** Rarity weights by floor (1..10) and floor kind. */
export function rarityWeights(floor: FloorDef): Record<DropRarity, number> {
  const t = (Math.min(10, Math.max(1, floor.floor)) - 1) / 9; // 0..1
  let w = { common: 70 - 30 * t, uncommon: 26 + 4 * t, rare: 4 + 26 * t };
  if (floor.kind !== 'normal') w = { common: w.common * 0.3, uncommon: w.uncommon, rare: w.rare * 2 + 10 };
  return w;
}

/** Runes offered per battle (before boons), and how many the player may take. */
export const REWARD_OFFER = 5;
export const REWARD_PICKS = 2;
/** Blessings offered after an elite (pick 1). */
export const ELITE_BLESSINGS = 3;

export function rollRewards(floor: FloorDef, rng: Rng, count: number = REWARD_OFFER, catalog: RuneCatalog = CATALOG): Reward[] {
  const pool = Object.values(catalog).filter((d) => d.rarity !== 'starter' && d.id !== SOURCE_ID);
  const weights = rarityWeights(floor);
  const runeCount = Math.max(1, count);

  const out: Reward[] = [];
  const remaining = [...pool];
  while (out.length < runeCount && remaining.length > 0) {
    const rarities = (['common', 'uncommon', 'rare'] as DropRarity[]).filter((r) => remaining.some((d) => d.rarity === r));
    const r = rarities[rng.weightedIndex(rarities.map((x) => weights[x]))];
    const def = rng.pick(remaining.filter((d) => d.rarity === r));
    remaining.splice(remaining.indexOf(def), 1);
    out.push({ kind: 'rune', defId: def.id });
  }
  return out;
}

/** Gold earned for clearing a battle or elite on `row` (before the gold multiplier). */
export function goldReward(kind: MapNodeKind, row: number): number {
  if (kind === 'elite') return 40 + 4 * row;
  if (kind === 'battle') return 15 + 3 * row;
  return 0;
}

/** Up to `count` distinct boons of `kind` that the player doesn't hold, in random order. */
export function rollBoons(
  kind: BoonDef['kind'], held: readonly string[], rng: Rng, count: number, boons: Record<string, BoonDef> = BOONS,
): BoonDef[] {
  const pool = Object.values(boons).filter((b) => b.kind === kind && !held.includes(b.id));
  const out: BoonDef[] = [];
  while (out.length < count && pool.length > 0) out.push(pool.splice(rng.int(pool.length), 1)[0]);
  return out;
}

/** Stable per-node seed so offers survive reloads: hash of the run seed, node id and a salt. */
export function nodeSeed(seed: number, id: string, salt = 0): number {
  let h = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/** Reward reroll: base gold price (times price boons); the reroll uses its own seed salt. */
export const REROLL_COST = 15;
export const REROLL_SALT = 50;

/** Treasure: 3 distinct rare runes, at least one of them a keystone, in a seeded order. */
export function treasureOffers(seed: number, id: string, catalog: RuneCatalog = CATALOG): Reward[] {
  const rng = createRng(nodeSeed(seed, id, 60));
  const rares = Object.values(catalog).filter((d) => d.rarity === 'rare' && d.id !== SOURCE_ID);
  const keystones = rares.filter((d) => d.keystone);
  const picked = keystones.length ? [keystones.splice(rng.int(keystones.length), 1)[0]] : [];
  const rest = rares.filter((d) => !picked.includes(d));
  while (picked.length < 3 && rest.length) picked.push(rest.splice(rng.int(rest.length), 1)[0]);
  for (let i = picked.length - 1; i > 0; i--) { const j = rng.int(i + 1); [picked[i], picked[j]] = [picked[j], picked[i]]; }
  return picked.map((d) => ({ kind: 'rune', defId: d.id }));
}
