import type { AbilityId } from '../types';

export interface AbilityInfo {
  id: AbilityId;
  name: string;
  /** seconds */
  cooldown: number;
  description: string;
}

/** Active abilities (DESIGN.md, Active ability). Used in battle with Space, right-click or the HUD button. */
export const ABILITIES: AbilityInfo[] = [
  {
    id: 'overcast', name: 'Overcast', cooldown: 20,
    description: 'Fires the whole spell immediately as an extra cast. The next charge then takes twice as long.',
  },
  {
    id: 'ward_pulse', name: 'Ward Pulse', cooldown: 18,
    description: 'A shockwave from the circle knocks enemies within 300 px back 200 px, slows them 50% for 2 s and destroys enemy projectiles inside it.',
  },
  {
    id: 'detonate', name: 'Detonate', cooldown: 22,
    description: 'Every status on every enemy is consumed for burst damage: burn, poison, slow, freeze, wet and weaken. Scaled by reaction damage; never triggers reactions.',
  },
];

export const ABILITY_IDS: AbilityId[] = ABILITIES.map((a) => a.id);
export const DEFAULT_ABILITY: AbilityId = 'overcast';

export const abilityInfo = (id: AbilityId): AbilityInfo => ABILITIES.find((a) => a.id === id) ?? ABILITIES[0];
