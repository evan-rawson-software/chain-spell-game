import type { BoonTotals } from '../contracts';
import type { BattleMods, BoonDef } from '../types';

export const NEUTRAL_MODS: BattleMods = {
  enemyHpMul: 1, enemySpeedMul: 1, enemyDamageMul: 1, reactionDamageMul: 1, wardRegen: 0,
};

const list: BoonDef[] = [
  // ---- blessings
  { id: 'catalysis', name: 'Catalysis', kind: 'blessing', description: 'Elemental reactions deal 50% more damage.', battle: { reactionDamageMul: 1.5 } },
  { id: 'ember_heart', name: 'Ember Heart', kind: 'blessing', description: 'Fire shots deal 20% more damage.', spell: [{ stat: 'damage', op: 'increased', value: 0.2, element: 'fire' }] },
  { id: 'frost_heart', name: 'Frost Heart', kind: 'blessing', description: 'Frost shots deal 20% more damage.', spell: [{ stat: 'damage', op: 'increased', value: 0.2, element: 'frost' }] },
  { id: 'verdant_heart', name: 'Verdant Heart', kind: 'blessing', description: 'Nature statuses are 25% more potent.', spell: [{ stat: 'statusPotency', op: 'increased', value: 0.25, element: 'nature' }] },
  { id: 'storm_heart', name: 'Storm Heart', kind: 'blessing', description: 'Lightning shots chain 1 extra time.', spell: [{ stat: 'chain', op: 'flat', value: 1, element: 'lightning' }] },
  { id: 'swift_wind', name: 'Swift Wind', kind: 'blessing', description: 'Projectiles fly 25% faster.', spell: [{ stat: 'speed', op: 'increased', value: 0.25 }] },
  { id: 'keen_edge', name: 'Keen Edge', kind: 'blessing', description: 'All shots deal 15% more damage.', spell: [{ stat: 'damage', op: 'increased', value: 0.15 }] },
  { id: 'stoneskin', name: 'Stoneskin', kind: 'blessing', description: '+25 ward HP.', wardHp: 25 },
  { id: 'mending', name: 'Mending', kind: 'blessing', description: 'Your ward regenerates 1 HP per second.', battle: { wardRegen: 1 } },
  { id: 'prosperity', name: 'Prosperity', kind: 'blessing', description: 'Gain 30% more gold.', goldMul: 1.3 },
  { id: 'abundance', name: 'Abundance', kind: 'blessing', description: 'One extra rune offered after each battle.', rewardOffer: 1 },
  { id: 'wellspring', name: 'Wellspring', kind: 'blessing', description: '+1 max mana per cleared battle.', manaGain: 1 },
  // ---- curses
  { id: 'frailty', name: 'Frailty', kind: 'curse', description: '-20 ward HP.', wardHp: -20 },
  { id: 'swift_foes', name: 'Swift Foes', kind: 'curse', description: 'Enemies move 15% faster.', battle: { enemySpeedMul: 1.15 } },
  { id: 'thick_hide', name: 'Thick Hide', kind: 'curse', description: 'Enemies have 20% more HP.', battle: { enemyHpMul: 1.2 } },
  { id: 'brutality', name: 'Brutality', kind: 'curse', description: 'Enemies deal 25% more damage to your ward.', battle: { enemyDamageMul: 1.25 } },
  { id: 'greed', name: 'Greed', kind: 'curse', description: 'Shop prices are 30% higher.', priceMul: 1.3 },
  { id: 'scarcity', name: 'Scarcity', kind: 'curse', description: 'One fewer rune offered after each battle.', rewardOffer: -1 },
  { id: 'dull_edge', name: 'Dull Edge', kind: 'curse', description: 'All shots deal 10% less damage.', spell: [{ stat: 'damage', op: 'more', value: -0.1 }] },
  { id: 'drought', name: 'Drought', kind: 'curse', description: '-1 max mana per cleared battle.', manaGain: -1 },
];

export const BOONS: Record<string, BoonDef> = Object.fromEntries(list.map((b) => [b.id, b]));

export function combineBoons(ids: string[]): BoonTotals {
  const t: BoonTotals = {
    spell: [], battle: { ...NEUTRAL_MODS }, wardHp: 0, goldMul: 1, priceMul: 1, rewardOffer: 0, manaGain: 0,
  };
  for (const id of ids) {
    const b = BOONS[id];
    if (!b) continue;
    if (b.spell) t.spell.push(...b.spell.map((m) => ({ ...m })));
    const bm = b.battle;
    if (bm) {
      t.battle.enemyHpMul *= bm.enemyHpMul ?? 1;
      t.battle.enemySpeedMul *= bm.enemySpeedMul ?? 1;
      t.battle.enemyDamageMul *= bm.enemyDamageMul ?? 1;
      t.battle.reactionDamageMul *= bm.reactionDamageMul ?? 1;
      t.battle.wardRegen += bm.wardRegen ?? 0;
    }
    t.wardHp += b.wardHp ?? 0;
    t.goldMul *= b.goldMul ?? 1;
    t.priceMul *= b.priceMul ?? 1;
    t.rewardOffer += b.rewardOffer ?? 0;
    t.manaGain += b.manaGain ?? 0;
  }
  return t;
}
