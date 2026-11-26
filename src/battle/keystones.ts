import type { Element, KeystoneId, ResolvedShot } from '../types';

/** Pure keystone rules (DESIGN.md, Keystones). No DOM, canvas or World. */

export interface KeystoneFlags {
  echo: boolean; death_split: boolean; everlasting: boolean;
  chain_reaction: boolean; frostfire: boolean; momentum: boolean;
}

export function keystoneFlags(list: readonly KeystoneId[] | undefined): KeystoneFlags {
  const has = (k: KeystoneId): boolean => !!list && list.includes(k);
  return {
    echo: has('echo'), death_split: has('death_split'), everlasting: has('everlasting'),
    chain_reaction: has('chain_reaction'), frostfire: has('frostfire'), momentum: has('momentum'),
  };
}

// ---- echo
export const ECHO_EVERY = 3;
export const ECHO_DELAY = 0.3;
/** `castNumber` is 1-based: the 3rd, 6th, ... cast is echoed. */
export function echoDue(castNumber: number): boolean {
  return castNumber > 0 && castNumber % ECHO_EVERY === 0;
}

// ---- momentum
export const MOMENTUM_STEP = 0.1;
export const MOMENTUM_CAP = 2;
/** Damage multiplier after `n` casts without the ward being damaged. */
export function momentumMul(n: number): number {
  return Math.min(MOMENTUM_CAP, 1 + MOMENTUM_STEP * Math.max(0, n));
}
/** HUD text, or null when there is no bonus yet. */
export function momentumLabel(n: number): string | null {
  const pct = Math.round((momentumMul(n) - 1) * 100);
  return pct > 0 ? `Momentum +${pct}%` : null;
}

// ---- death split
export const SPLIT_ANGLE = (30 * Math.PI) / 180;
export const SHARD_DAMAGE_FRAC = 0.5;
/** Headings of the two shards for a shot travelling along `heading` (radians). */
export function shardHeadings(heading: number): [number, number] {
  return [heading - SPLIT_ANGLE, heading + SPLIT_ANGLE];
}
/** The shot a shard carries: same element and statuses, half damage, small, homing, no area/pierce/chain. */
export function shardShot(shot: ResolvedShot): ResolvedShot {
  return {
    ...shot,
    damage: shot.damage * SHARD_DAMAGE_FRAC,
    size: Math.min(shot.size, 4),
    count: 1, spreadDeg: 0, pierce: 0, chain: 0, aoeRadius: 0,
    homing: Math.max(shot.homing, 8),
    speed: Math.max(shot.speed, 420),
  };
}
/** Only a non-shard projectile may split. */
export function canSplit(enabled: boolean, isShard: boolean): boolean {
  return enabled && !isShard;
}

// ---- chain reaction
export const MAX_REACTION_DEPTH = 3;
/** Whether a hit at reaction `depth` (0 = the shot's own hit) may start reactions. */
export function canReact(depth: number, chainReaction: boolean): boolean {
  return depth === 0 || (chainReaction && depth <= MAX_REACTION_DEPTH);
}

// ---- frostfire
export function frostfireStatuses(element: Element): { kind: 'slow' | 'burn'; potency: number; duration: number }[] {
  if (element === 'fire') return [{ kind: 'slow', potency: 0.3, duration: 1.5 }];
  if (element === 'frost') return [{ kind: 'burn', potency: 5, duration: 2 }];
  return [];
}
