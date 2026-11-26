import { keystoneFlags, type KeystoneFlags } from './keystones';
import type {
  BattleMods, KeystoneId, Element, EliteTraitId, EnemyKind, HazardId, ReactionKind, ResolvedShot, StatusKind,
} from '../types';

export const W = 1000;
export const H = 600;
export const WARD_X = 80;
export const WARD_Y = 300;
export const WARD_R = 30;
/** Where projectiles leave: the center of the magic circle. */
export const MUZZLE_X = WARD_X;
export const MUZZLE_Y = WARD_Y;

export interface StatusState {
  /** `src` = sourceUid of the rune that applied it (per-rune damage stats) */
  burn: { dps: number; t: number; src?: string } | null;
  poison: { dps: number; t: number; src?: string }[];
  slow: { p: number; t: number } | null;
  freeze: number;
  wet: { p: number; t: number } | null;
  weaken: { p: number; t: number } | null;
}

export interface EnemyCfg {
  name: string;
  hp: number;
  speed: number;
  r: number;
  color: string;
  resist: Partial<Record<Element, number>>;
  /** melee: attack on contact with cooldown */
  melee?: { dmg: number; cd: number };
  /** ranged: stop at stopX and shoot */
  ranged?: { stopX: number; cd: number; projSpeed: number; projR: number; dmg: number; count: number; spreadDeg: number; color: string };
  summon?: { every: number; count: number };
  /** Shield Bearer: a shield absorbs one whole hit */
  shield?: boolean;
  /** Cleanser: every `every` s strips all statuses from enemies within `radius` */
  pulse?: { every: number; radius: number };
  /** Golem: periodic shockwave */
  stomp?: { every: number };
  /** multiplier on freeze duration */
  freezeMul: number;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  cfg: EnemyCfg;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  r: number;
  st: StatusState;
  cd: number;
  summonCd: number;
  dead: boolean;
  flash: number;
  attackAnim: number;
  dotAcc: number;
  dotTimer: number;
  phase: number;
  /** reaction kind -> world time before which it can't trigger on this enemy again */
  reactAt: Record<string, number>;
  /** HP scale this enemy was spawned with (for splits) */
  hpScale: number;
  /** shield up (Shield Bearer) */
  shield: boolean;
  /** world time the enemy last took a non-DoT hit (blocked hits count; fog reveal) */
  lastHit: number;
  /** world time the enemy last took any damage (Regenerating) */
  lastDamaged: number;
  /** seconds of broken shell remaining (Golem) */
  shellBroken: number;
  /** Golem: seconds until the next stomp; Cleanser: until the next pulse */
  abilityCd: number;
  /** Hydra growth stage reached (0..2) */
  stage: number;
  trait?: EliteTraitId;
  /** visual timer: shield pop / pulse flash */
  shieldFlash: number;
}

export interface PProj {
  x: number; y: number; vx: number; vy: number;
  r: number;
  shot: ResolvedShot;
  hit: Set<number>;
  pierceLeft: number;
  dead: boolean;
  age: number;
  /** spawned by Hydra Sigil: never splits again */
  shard?: boolean;
}

export interface EProj {
  x: number; y: number; vx: number; vy: number;
  r: number; dmg: number; color: string; dead: boolean;
}

export interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; color: string; drag: number;
}

export interface Ring { x: number; y: number; r: number; maxR: number; t: number; max: number; color: string }
export interface Arc { pts: { x: number; y: number }[]; t: number; max: number; color: string }
export interface FloatText { x: number; y: number; text: string; color: string; t: number; max: number; size: number; glow?: boolean }

export interface World {
  time: number;
  enemies: Enemy[];
  pprojs: PProj[];
  eprojs: EProj[];
  fx: Particle[];
  rings: Ring[];
  arcs: Arc[];
  texts: FloatText[];
  wardHp: number;
  wardMax: number;
  wardFlash: number;
  kills: number;
  damageTaken: number;
  nextId: number;
  mods: BattleMods;
  /** elemental reactions triggered */
  reactions: number;
  /** largest single hit dealt */
  bestHit: number;
  // --- juice (see juice.ts) ---
  /** screen shake 0..1 */
  trauma: number;
  /** requested hit-stop seconds, consumed by the game loop */
  hitStopReq: number;
  /** real seconds of slow motion requested, consumed by the game loop */
  slowmoReq: number;
  /** white flash strength requested 0..1, consumed by the game loop */
  flashReq: number;
  killTimes: number[];
  multiShown: number;
  combo: { n: number; last: number };
  callout: { text: string; color: string; t: number; max: number } | null;
  lastReactSfx: number;
  /** active keystone rules */
  ks: KeystoneFlags;
  /** casts since the ward was last damaged (Momentum) */
  momentum: number;
  hazard?: HazardId;
  eliteTrait?: EliteTraitId;
  /** heatwave: seconds until the next ignition */
  hazardT: number;
  /** damage per terminal rune sourceUid */
  runeDamage: Record<string, number>;
  reactionCounts: Partial<Record<ReactionKind, number>>;
}

export const NEUTRAL_MODS: BattleMods = {
  enemyHpMul: 1, enemySpeedMul: 1, enemyDamageMul: 1, reactionDamageMul: 1, wardRegen: 0,
};

export const ELEMENT_COLOR: Record<Element, string> = {
  fire: '#ff7a2f', frost: '#7fd8ff', nature: '#6ee06e', lightning: '#ffe14d',
  arcane: '#b67cff', storm: '#3fe0c8', pure: '#ffffff',
};

export const STATUS_COLOR: Record<StatusKind, string> = {
  burn: '#ff7a2f', poison: '#7bd34a', slow: '#6fa8ff', freeze: '#d8f4ff', wet: '#3e83f7', weaken: '#c070ff',
};

export const ENEMY_CFG: Record<EnemyKind, EnemyCfg> = {
  grunt: { name: 'Grunt', hp: 40, speed: 55, r: 14, color: '#7a9a4a', resist: {}, melee: { dmg: 8, cd: 1.0 }, freezeMul: 1 },
  runner: { name: 'Runner', hp: 25, speed: 125, r: 11, color: '#d6a23a', resist: {}, melee: { dmg: 5, cd: 0.7 }, freezeMul: 1 },
  brute: { name: 'Brute', hp: 160, speed: 34, r: 23, color: '#8a5a3c', resist: { frost: 0.5 }, melee: { dmg: 18, cd: 1.5 }, freezeMul: 1 },
  archer: {
    name: 'Archer', hp: 50, speed: 50, r: 13, color: '#4f9a86', resist: {}, freezeMul: 1,
    ranged: { stopX: 600, cd: 2.0, projSpeed: 380, projR: 4, dmg: 7, count: 1, spreadDeg: 0, color: '#e8dca8' },
  },
  shaman: {
    name: 'Shaman', hp: 70, speed: 40, r: 15, color: '#7a5ab0', resist: { arcane: 0.5 }, freezeMul: 1,
    ranged: { stopX: 700, cd: 3.0, projSpeed: 150, projR: 9, dmg: 12, count: 1, spreadDeg: 0, color: '#c58bff' },
  },
  elite_knight: {
    name: 'Elite Knight', hp: 600, speed: 38, r: 26, color: '#9aa4b5', resist: { fire: 0.3, frost: 0.3 },
    melee: { dmg: 25, cd: 1.4 }, freezeMul: 0.6,
  },
  boss_lich: {
    name: 'Lich King', hp: 3000, speed: 30, r: 48, color: '#5a3a7a', resist: {}, freezeMul: 0.3,
    ranged: { stopX: 750, cd: 3.5, projSpeed: 210, projR: 8, dmg: 10, count: 5, spreadDeg: 50, color: '#8cffb0' },
    summon: { every: 12, count: 3 },
  },
  shield_bearer: {
    name: 'Shield Bearer', hp: 90, speed: 42, r: 17, color: '#5f87b8', resist: {},
    melee: { dmg: 10, cd: 1.2 }, freezeMul: 1, shield: true,
  },
  splitter: {
    name: 'Splitter', hp: 90, speed: 45, r: 18, color: '#b8508c', resist: {},
    melee: { dmg: 8, cd: 1.1 }, freezeMul: 1,
  },
  splitling: {
    name: 'Splitling', hp: 12, speed: 115, r: 7, color: '#e07ab5', resist: {},
    melee: { dmg: 3, cd: 0.8 }, freezeMul: 1,
  },
  cleanser: {
    name: 'Cleanser', hp: 60, speed: 45, r: 14, color: '#f2e8a0', resist: {}, freezeMul: 1,
    ranged: { stopX: 540, cd: 3.5, projSpeed: 220, projR: 4, dmg: 3, count: 1, spreadDeg: 0, color: '#fff6c0' },
    pulse: { every: 4, radius: 150 },
  },
  armored: {
    name: 'Armored', hp: 140, speed: 36, r: 18, color: '#7d8794', resist: {},
    melee: { dmg: 14, cd: 1.4 }, freezeMul: 1,
  },
  swarmer: {
    name: 'Swarmer', hp: 12, speed: 140, r: 6, color: '#c8553d', resist: {},
    melee: { dmg: 2, cd: 0.6 }, freezeMul: 1,
  },
  boss_golem: {
    name: 'Stone Golem', hp: 3000, speed: 24, r: 52, color: '#8a8478', resist: {}, freezeMul: 0.3,
    melee: { dmg: 35, cd: 2.2 }, stomp: { every: 8 },
  },
  boss_hydra: {
    name: 'Hydra', hp: 3000, speed: 28, r: 46, color: '#3f8f5a', resist: { nature: 0.5 }, freezeMul: 0.3,
    melee: { dmg: 30, cd: 1.8 },
  },
  hydra_head: {
    name: 'Hydra Head', hp: 450, speed: 0, r: 15, color: '#6fb85a', resist: { nature: 0.5 }, freezeMul: 0.6,
    ranged: { stopX: 5000, cd: 2.4, projSpeed: 260, projR: 5, dmg: 8, count: 1, spreadDeg: 0, color: '#9be05a' },
  },
  dummy: {
    name: 'Training Dummy', hp: 1_000_000, speed: 0, r: 22, color: '#b08a5a', resist: {}, freezeMul: 1,
  },
};

export function newWorld(
  wardMax: number, mods: BattleMods = NEUTRAL_MODS, keystones: readonly KeystoneId[] = [],
  floorRules: { hazard?: HazardId; eliteTrait?: EliteTraitId } = {},
): World {
  return {
    time: 0, enemies: [], pprojs: [], eprojs: [], fx: [], rings: [], arcs: [], texts: [],
    wardHp: wardMax, wardMax, wardFlash: 0, kills: 0, damageTaken: 0, nextId: 1,
    mods: { ...NEUTRAL_MODS, ...mods }, reactions: 0, bestHit: 0,
    trauma: 0, hitStopReq: 0, slowmoReq: 0, flashReq: 0, killTimes: [], multiShown: 0,
    combo: { n: 0, last: -99 }, callout: null, lastReactSfx: -99,
    ks: keystoneFlags(keystones), momentum: 0,
    hazard: floorRules.hazard, eliteTrait: floorRules.eliteTrait, hazardT: 5, runeDamage: {}, reactionCounts: {},
  };
}

export function burst(w: World, x: number, y: number, color: string, n: number, speed: number, life = 0.5, size = 2.5): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.3 + Math.random() * 0.7);
    w.fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.6 + Math.random() * 0.6), max: life, size: size * (0.6 + Math.random() * 0.8), color, drag: 2.5 });
  }
}

export function floatText(w: World, x: number, y: number, text: string, color: string, size = 14, max = 0.9, glow = false): void {
  w.texts.push({ x: x + (Math.random() - 0.5) * 10, y, text, color, t: 0, max, size, glow });
}

export function updateFx(w: World, dt: number): void {
  for (const p of w.fx) {
    p.life -= dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    const d = Math.max(0, 1 - p.drag * dt);
    p.vx *= d; p.vy *= d;
  }
  w.fx = w.fx.filter(p => p.life > 0);
  for (const r of w.rings) r.t += dt;
  w.rings = w.rings.filter(r => r.t < r.max);
  for (const a of w.arcs) a.t += dt;
  w.arcs = w.arcs.filter(a => a.t < a.max);
  for (const t of w.texts) { t.t += dt; t.y -= 28 * dt; }
  if (w.callout) { w.callout.t += dt; if (w.callout.t >= w.callout.max) w.callout = null; }
  w.texts = w.texts.filter(t => t.t < t.max);
  if (w.fx.length > 1200) w.fx.splice(0, w.fx.length - 1200);
}
