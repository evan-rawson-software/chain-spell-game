import type { AbilityId } from '../types';
import type { StatusState } from './model';
import type { Element } from '../types';

/**
 * Active ability decisions (DESIGN.md, "Active ability"). Pure: no World, no DOM.
 * abilityfx.ts applies them to the battle.
 */

export interface AbilityInfo {
  name: string;
  cooldown: number;
  color: string;
  desc: string;
}

export const ABILITY_INFO: Record<AbilityId, AbilityInfo> = {
  overcast: { name: 'Overcast', cooldown: 20, color: '#ffd24a', desc: 'Fire the whole spell now; the next charge takes twice as long' },
  ward_pulse: { name: 'Ward Pulse', cooldown: 18, color: '#6fd8ff', desc: 'Knock back, slow and clear projectiles around the circle' },
  detonate: { name: 'Detonate', cooldown: 22, color: '#ff7a3a', desc: 'Consume every status on every enemy for burst damage' },
};

/** After an Overcast the next charge takes this many times as long. */
export const OVERCAST_CHARGE_MUL = 2;

export const PULSE_RADIUS = 300;
export const PULSE_PUSH = 200;
export const PULSE_SLOW = { p: 0.5, t: 2 };

/** Detonate constants. */
export const DETONATE_BURN_SECONDS = 3;
export const DETONATE_BURN_MUL = 2;
export const DETONATE_POISON_MUL = 1.5;
export const DETONATE_SLOW = 30;
export const DETONATE_FREEZE = 30;
export const DETONATE_WET = 20;
export const DETONATE_WEAKEN = 25;

export function isAbilityId(v: unknown): v is AbilityId {
  return v === 'overcast' || v === 'ward_pulse' || v === 'detonate';
}

/** Cooldown state: seconds left (0 = ready). A fight starts ready. */
export function cooldownAfterUse(id: AbilityId): number {
  return ABILITY_INFO[id].cooldown;
}

export function tickCooldown(left: number, dt: number): number {
  return Math.max(0, left - Math.max(0, dt));
}

/** 0..1 progress of the cooldown sweep (1 = ready). */
export function cooldownFrac(id: AbilityId, left: number): number {
  const max = ABILITY_INFO[id].cooldown;
  return max <= 0 ? 1 : Math.max(0, Math.min(1, 1 - left / max));
}

export interface DetonatePart { element: Element; damage: number }

/**
 * Burst damage for the statuses on one enemy, before the reaction-damage scale: burn 3 s of its
 * dps x2 (fire), poison remaining x1.5 (nature), slow / freeze 30 frost each, wet 20 lightning,
 * weaken 25 arcane. Parts of the same element are merged.
 */
export function detonateParts(st: StatusState, reactionMul = 1): DetonatePart[] {
  const sum: Partial<Record<Element, number>> = {};
  const add = (el: Element, n: number): void => { if (n > 0) sum[el] = (sum[el] ?? 0) + n * reactionMul; };
  if (st.burn) add('fire', st.burn.dps * DETONATE_BURN_SECONDS * DETONATE_BURN_MUL);
  if (st.poison.length) {
    let rem = 0;
    for (const p of st.poison) rem += p.dps * Math.max(0, p.t);
    add('nature', rem * DETONATE_POISON_MUL);
  }
  if (st.slow) add('frost', DETONATE_SLOW);
  if (st.freeze > 0) add('frost', DETONATE_FREEZE);
  if (st.wet) add('lightning', DETONATE_WET);
  if (st.weaken) add('arcane', DETONATE_WEAKEN);
  return (Object.keys(sum) as Element[]).map(el => ({ element: el, damage: sum[el]! }));
}

export function detonateTotal(st: StatusState, reactionMul = 1): number {
  return detonateParts(st, reactionMul).reduce((a, p) => a + p.damage, 0);
}

export interface PulseResult { hit: boolean; dx: number; dy: number }

/**
 * Ward Pulse on one enemy at (x, y) with body radius r: whether it is inside the shockwave and how
 * far it is pushed directly away from the circle (at most PULSE_PUSH, never past the origin).
 */
export function pulseKnock(x: number, y: number, r: number, wx: number, wy: number): PulseResult {
  const d = Math.hypot(x - wx, y - wy);
  if (d > PULSE_RADIUS + r) return { hit: false, dx: 0, dy: 0 };
  if (d < 1e-6) return { hit: true, dx: PULSE_PUSH, dy: 0 };
  return { hit: true, dx: ((x - wx) / d) * PULSE_PUSH, dy: ((y - wy) / d) * PULSE_PUSH };
}

/** Whether an enemy projectile at (x, y) is destroyed by the pulse. */
export function pulseCatches(x: number, y: number, wx: number, wy: number): boolean {
  return Math.hypot(x - wx, y - wy) <= PULSE_RADIUS;
}
