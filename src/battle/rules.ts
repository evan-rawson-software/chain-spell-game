import type { Element, EliteTraitId, EnemyKind, HazardId, ReactionKind } from '../types';

/** Pure decision rules for enemies, elite traits, bosses and hazards (DESIGN.md). No World, no DOM. */

// ---- shield bearer
export const SHIELD_REGROW = 4;

/** Seconds until a broken shield is back, given the time since it was last hit. */
export function shieldRegrowIn(sinceHit: number): number {
  return Math.max(0, SHIELD_REGROW - sinceHit);
}

// ---- armored / golem shell
export const ARMOR_REDUCTION = 0.6;
export const SHELL_REDUCTION = 0.75;
export const SHELL_BREAK_TIME = 6;

export interface DefenseState { frozen: boolean; weakened: boolean; shellBroken: number }

/** Damage multiplier from innate defenses (1 = none). Armored: -60% unless frozen or weakened. Golem: -75% while the shell holds. */
export function defenseMul(kind: EnemyKind, s: DefenseState): number {
  if (kind === 'armored') return s.frozen || s.weakened ? 1 : 1 - ARMOR_REDUCTION;
  if (kind === 'boss_golem') return s.shellBroken > 0 ? 1 : 1 - SHELL_REDUCTION;
  return 1;
}

/** Whether an enemy's defense is currently up (used to dim/undim the plating). */
export function defenseUp(kind: EnemyKind, s: DefenseState): boolean {
  return defenseMul(kind, s) < 1;
}

/** Reactions that crack the Stone Golem's shell. */
export function breaksShell(kind: ReactionKind): boolean {
  return kind === 'shatter' || kind === 'combust' || kind === 'overload';
}

// ---- splitter
export const SPLIT_COUNT = 3;
export function splitsInto(kind: EnemyKind): { kind: EnemyKind; count: number } | null {
  return kind === 'splitter' ? { kind: 'splitling', count: SPLIT_COUNT } : null;
}

// ---- bosses
export function isBoss(kind: EnemyKind): boolean {
  return kind === 'boss_lich' || kind === 'boss_golem' || kind === 'boss_hydra';
}

export const HYDRA_THRESHOLDS = [0.66, 0.33];
export const HYDRA_HEADS_PER_STAGE = 2;
export const HYDRA_HEAD_HP_FRAC = 0.15;

/** Hydra growth stage (0..2) for the current HP fraction. A stage only ever increases. */
export function hydraStage(hpFrac: number): number {
  return HYDRA_THRESHOLDS.filter(t => hpFrac <= t).length;
}

export const STOMP_EVERY = 8;
export const STOMP_RANGE = 350;
export const STOMP_DAMAGE = 12;
/** The stomp only hurts the ward when the golem is close enough (center to center). */
export function stompHitsWard(golemX: number, golemY: number, wardX: number, wardY: number): boolean {
  return Math.hypot(golemX - wardX, golemY - wardY) <= STOMP_RANGE;
}

// ---- elite traits
export const TRAIT_INFO: Record<EliteTraitId, { label: string; color: string }> = {
  hasted: { label: 'HASTED', color: '#ffe14d' },
  reflective: { label: 'REFLECTIVE', color: '#9fd8ff' },
  regenerating: { label: 'REGENERATING', color: '#6ee06e' },
  burn_immune: { label: 'BURN-IMMUNE', color: '#ff7a2f' },
};

export function traitSpeedMul(trait: EliteTraitId | undefined): number {
  return trait === 'hasted' ? 1.4 : 1;
}

export const REFLECT_FRAC = 0.15;
export const REFLECT_MAX = 5;
/** Ward damage reflected by one hit of `dmg` on a Reflective elite. */
export function reflectDamage(dmg: number): number {
  return Math.min(REFLECT_MAX, Math.max(0, dmg) * REFLECT_FRAC);
}

export const REGEN_DELAY = 2;
export const REGEN_RATE = 0.02;
/** HP healed this tick by a Regenerating elite. */
export function regenAmount(maxHp: number, dt: number, sinceDamaged: number): number {
  return sinceDamaged > REGEN_DELAY ? maxHp * REGEN_RATE * dt : 0;
}

export function traitBlocksBurn(trait: EliteTraitId | undefined): boolean {
  return trait === 'burn_immune';
}

// ---- hazards
export const HAZARD_INFO: Record<HazardId, { name: string; desc: string }> = {
  rain: { name: 'Rain', desc: 'enemies are Wet, fire -25%' },
  heatwave: { name: 'Heatwave', desc: 'enemies ignite every 5 s, slows halved' },
  fog: { name: 'Fog', desc: 'distant enemies hidden until hit' },
};

export const HEAT_PERIOD = 5;
export const HEAT_BURN = { dps: 3, t: 3 };
export const RAIN_WET = 0.5;
/** Fog hides enemies farther than this from the ward (about x = 650 on the ward line). */
export const FOG_DIST = 570;
export const FOG_REVEAL = 0.6;

/** Damage multiplier for an element from the hazard and an elite trait. */
export function elementMul(element: Element, hazard: HazardId | undefined, trait: EliteTraitId | undefined): number {
  let m = 1;
  if (element === 'fire') {
    if (hazard === 'rain') m *= 0.75;
    if (trait === 'burn_immune') m *= 0.5;
  }
  return m;
}

/** Multiplier on slow potency. */
export function hazardSlowMul(hazard: HazardId | undefined): number {
  return hazard === 'heatwave' ? 0.5 : 1;
}

/** Fog opacity of an enemy `dist` from the ward that was last hit `sinceHit` seconds ago (1 = fully drawn). */
export function fogAlpha(dist: number, sinceHit: number): number {
  if (dist <= FOG_DIST) return 1;
  if (sinceHit >= FOG_REVEAL) return 0;
  return Math.min(1, (FOG_REVEAL - sinceHit) / 0.25);
}

export function fogVisible(dist: number, sinceHit: number): boolean {
  return fogAlpha(dist, sinceHit) > 0;
}
