import { CATALOG, SOURCE_ID } from '../data/runes';
import type { FloorDef, Reward, Rarity, RuneCatalog } from '../types';
import type { Rng } from './rng';

type DropRarity = Exclude<Rarity, 'starter'>;

/** Rarity weights by floor (1..10) and floor kind. */
export function rarityWeights(floor: FloorDef): Record<DropRarity, number> {
  const t = (Math.min(10, Math.max(1, floor.floor)) - 1) / 9; // 0..1
  let w = { common: 70 - 30 * t, uncommon: 26 + 4 * t, rare: 4 + 26 * t };
  if (floor.kind !== 'normal') w = { common: w.common * 0.3, uncommon: w.uncommon, rare: w.rare * 2 + 10 };
  return w;
}

/** Runes offered per floor, and how many the player may take. */
export const REWARD_OFFER = 5;
export const REWARD_PICKS = 2;

export function rollRewards(floor: FloorDef, rng: Rng, catalog: RuneCatalog = CATALOG): Reward[] {
  const pool = Object.values(catalog).filter((d) => d.rarity !== 'starter' && d.id !== SOURCE_ID);
  const weights = rarityWeights(floor);
  const runeCount = REWARD_OFFER;

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
