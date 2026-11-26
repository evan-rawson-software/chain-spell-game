import type { Element } from '../types';
import type { StatusState } from './model';

/**
 * Elemental reactions (DESIGN.md, "Elemental reactions"). Pure: no DOM, canvas or World.
 * `planReactions` inspects an enemy's statuses BEFORE the hit's own statuses are applied and
 * returns what should happen; projectiles.ts executes the plan.
 */

export type ReactionKind =
  | 'shatter' | 'melt' | 'steam' | 'combust' | 'wildfire' | 'electrocute' | 'overload' | 'unravel';

export type StatusKey = 'burn' | 'poison' | 'slow' | 'freeze' | 'wet' | 'weaken';

export const STATUS_KEYS: StatusKey[] = ['burn', 'poison', 'slow', 'freeze', 'wet', 'weaken'];

/** Extra (non-multiplier) effect of a reaction. */
export type ReactionExtra =
  | { type: 'cloud'; radius: number; wet: { p: number; t: number }; slow: { p: number; t: number } }
  | { type: 'combust'; radius: number; damage: number }
  | { type: 'spread'; radius: number; burn: { dps: number; t: number } }
  | { type: 'arcs'; radius: number; frac: number }
  | { type: 'blast'; radius: number; frac: number };

export interface ReactionPlan {
  kind: ReactionKind;
  /** Callout text */
  name: string;
  color: string;
  /** Damage multiplier for the triggering hit (1 = none). Before reactionDamageMul scaling. */
  mult: number;
  extra: ReactionExtra | null;
  /** Statuses removed from the target after the hit. */
  consume: StatusKey[];
}

export const REACTION_COOLDOWN = 0.15;

export const REACTION_NAMES: Record<ReactionKind, string> = {
  shatter: 'SHATTER', melt: 'MELT', steam: 'STEAM', combust: 'COMBUST',
  wildfire: 'WILDFIRE', electrocute: 'ELECTROCUTE', overload: 'OVERLOAD', unravel: 'UNRAVEL',
};

export const REACTION_COLORS: Record<ReactionKind, string> = {
  shatter: '#bfeaff', melt: '#ffa04a', steam: '#e4ecf4', combust: '#ff5a2a',
  wildfire: '#9be05a', electrocute: '#ffe14d', overload: '#ff8a3a', unravel: '#c070ff',
};

/** Which status kinds the enemy currently has. */
export function activeStatuses(st: StatusState): StatusKey[] {
  const out: StatusKey[] = [];
  if (st.burn) out.push('burn');
  if (st.poison.length) out.push('poison');
  if (st.slow) out.push('slow');
  if (st.freeze > 0) out.push('freeze');
  if (st.wet) out.push('wet');
  if (st.weaken) out.push('weaken');
  return out;
}

/** Total damage the poison stacks would still deal. */
export function remainingPoison(st: StatusState): number {
  let sum = 0;
  for (const p of st.poison) sum += p.dps * Math.max(0, p.t);
  return sum;
}

/**
 * Every reaction a hit of `element` triggers on an enemy in state `st`, in table order.
 * Several can fire at once (e.g. a fire hit on a frozen, slowed enemy melts and shatters).
 */
export function planReactions(st: StatusState, element: Element): ReactionPlan[] {
  const out: ReactionPlan[] = [];
  const add = (kind: ReactionKind, mult: number, extra: ReactionExtra | null, consume: StatusKey[]): void => {
    out.push({ kind, name: REACTION_NAMES[kind], color: REACTION_COLORS[kind], mult, extra, consume });
  };
  const kinds = activeStatuses(st);

  if (st.freeze > 0 && element !== 'frost') add('shatter', 2, null, ['freeze']);
  if (st.slow && element === 'fire') add('melt', 1.5, null, ['slow']);
  if (st.burn && element === 'frost') {
    add('steam', 1, { type: 'cloud', radius: 80, wet: { p: 0.5, t: 3 }, slow: { p: 0.3, t: 2 } }, ['burn']);
  }
  if (st.poison.length && element === 'fire') {
    add('combust', 1, { type: 'combust', radius: 80, damage: remainingPoison(st) * 1.5 }, ['poison']);
  }
  if (st.burn && element === 'nature') {
    add('wildfire', 1, { type: 'spread', radius: 100, burn: { dps: st.burn.dps, t: st.burn.t } }, []);
  }
  if (st.wet && element === 'lightning') add('electrocute', 1, { type: 'arcs', radius: 180, frac: 0.5 }, ['wet']);
  if (st.burn && element === 'lightning') add('overload', 1, { type: 'blast', radius: 70, frac: 0.4 }, ['burn']);
  if (kinds.length >= 2 && element === 'arcane') add('unravel', 1 + 0.25 * kinds.length, null, kinds);
  return out;
}

/** Combined multiplier on the triggering hit; only the bonus part scales with reactionDamageMul. */
export function reactionMult(plans: ReactionPlan[], reactionDamageMul = 1): number {
  let m = 1;
  for (const p of plans) m *= 1 + (p.mult - 1) * reactionDamageMul;
  return m;
}

/** Removes the listed statuses (the consumption step of a reaction). */
export function consumeStatuses(st: StatusState, keys: StatusKey[]): void {
  for (const k of keys) {
    switch (k) {
      case 'burn': st.burn = null; break;
      case 'poison': st.poison = []; break;
      case 'slow': st.slow = null; break;
      case 'freeze': st.freeze = 0; break;
      case 'wet': st.wet = null; break;
      case 'weaken': st.weaken = null; break;
    }
  }
}

/** Plans minus the kinds still on cooldown for this enemy (`reactAt`: kind -> time it may fire again). */
export function readyPlans(plans: ReactionPlan[], reactAt: Record<string, number>, now: number): ReactionPlan[] {
  return plans.filter(p => (reactAt[p.kind] ?? -Infinity) <= now);
}

/** Marks every plan's kind as triggered at `now`. */
export function markTriggered(plans: ReactionPlan[], reactAt: Record<string, number>, now: number): void {
  for (const p of plans) reactAt[p.kind] = now + REACTION_COOLDOWN;
}
