import type { Element, EnemyKind, ResolvedShot, StatusKind } from '../types';

export const W = 1000;
export const H = 600;
export const WIZ_X = 80;
export const WIZ_Y = 300;
export const WIZ_R = 30;
/** Where projectiles leave the staff. */
export const MUZZLE_X = 110;
export const MUZZLE_Y = 268;

export interface StatusState {
  burn: { dps: number; t: number } | null;
  poison: { dps: number; t: number }[];
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
}

export interface PProj {
  x: number; y: number; vx: number; vy: number;
  r: number;
  shot: ResolvedShot;
  hit: Set<number>;
  pierceLeft: number;
  dead: boolean;
  age: number;
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
export interface FloatText { x: number; y: number; text: string; color: string; t: number; max: number; size: number }

export interface World {
  time: number;
  enemies: Enemy[];
  pprojs: PProj[];
  eprojs: EProj[];
  fx: Particle[];
  rings: Ring[];
  arcs: Arc[];
  texts: FloatText[];
  wizHp: number;
  wizMax: number;
  wizFlash: number;
  kills: number;
  damageTaken: number;
  nextId: number;
}

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
};

export function newWorld(wizMax: number): World {
  return {
    time: 0, enemies: [], pprojs: [], eprojs: [], fx: [], rings: [], arcs: [], texts: [],
    wizHp: wizMax, wizMax, wizFlash: 0, kills: 0, damageTaken: 0, nextId: 1,
  };
}

export function burst(w: World, x: number, y: number, color: string, n: number, speed: number, life = 0.5, size = 2.5): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.3 + Math.random() * 0.7);
    w.fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.6 + Math.random() * 0.6), max: life, size: size * (0.6 + Math.random() * 0.8), color, drag: 2.5 });
  }
}

export function floatText(w: World, x: number, y: number, text: string, color: string, size = 14, max = 0.9): void {
  w.texts.push({ x: x + (Math.random() - 0.5) * 10, y, text, color, t: 0, max, size });
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
  w.texts = w.texts.filter(t => t.t < t.max);
  if (w.fx.length > 1200) w.fx.splice(0, w.fx.length - 1200);
}
