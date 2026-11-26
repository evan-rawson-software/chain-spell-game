import type { Enemy, World } from './model';
import { isBoss } from './rules';

/** "Big spell moment" helpers: shake, hit-stop, slow motion, multi-kill and combo tracking. */

export const MULTI_WINDOW = 0.5;
export const COMBO_WINDOW = 2;
export const BIG_HIT = 150;

export function addTrauma(w: World, n: number): void {
  w.trauma = Math.min(1, w.trauma + n);
}

export function requestHitStop(w: World, sec: number): void {
  w.hitStopReq += sec;
}

/** Floating damage number size: grows with the log of the damage. */
export function damageTextSize(dmg: number): number {
  return Math.max(12, Math.min(30, 12 + 5 * Math.log10(Math.max(1, dmg))));
}

/** Callout text for n kills within MULTI_WINDOW, or null below 3. */
export function multiKillTitle(n: number): string | null {
  if (n < 3) return null;
  if (n === 3) return 'TRIPLE';
  if (n < 8) return `MULTI-KILL ×${n}`;
  return `MASSACRE ×${n}${n === 8 ? '+' : ''}`;
}

export function isBigEnemy(e: Enemy): boolean {
  return e.kind === 'elite_knight' || isBoss(e.kind);
}

/** Bookkeeping for one kill: multi-kill callouts, combo counter, elite/boss moments. */
export function registerKill(w: World, e: Enemy, onMulti: () => void): void {
  const t = w.time;
  w.killTimes.push(t);
  while (w.killTimes.length && t - w.killTimes[0] > MULTI_WINDOW) w.killTimes.shift();
  const n = w.killTimes.length;
  if (n < 3) w.multiShown = 0;
  else if (n > w.multiShown) {
    w.multiShown = n;
    w.callout = { text: multiKillTitle(n)!, color: n >= 8 ? '#ff5a5a' : n >= 5 ? '#ffb347' : '#ffe27a', t: 0, max: 1.3 };
    onMulti();
  }

  w.combo.n = t - w.combo.last <= COMBO_WINDOW ? w.combo.n + 1 : 1;
  w.combo.last = t;

  if (isBigEnemy(e)) {
    addTrauma(w, 0.9);
    requestHitStop(w, 0.1);
    w.slowmoReq = 0.8;
    w.flashReq = 1;
  }
}

/** Big single hits: shake, hit-stop and a heavier number. Returns true if it was a big hit. */
export function onBigHit(w: World, dmg: number): boolean {
  if (dmg < BIG_HIT) return false;
  addTrauma(w, 0.5);
  requestHitStop(w, 0.06);
  return true;
}

/** Combo shown in the HUD: count and remaining fade (0..1), or null. */
export function comboState(w: World): { n: number; k: number } | null {
  const age = w.time - w.combo.last;
  if (w.combo.n < 2 || age > COMBO_WINDOW) return null;
  return { n: w.combo.n, k: 1 - age / COMBO_WINDOW };
}

/** Whether a compiled plan counts as a "large cast". */
export function isLargeCast(shots: { count: number; damage: number }[]): boolean {
  let proj = 0, dmg = 0;
  for (const s of shots) {
    const c = Math.max(1, Math.round(s.count));
    proj += c;
    dmg += s.damage * c;
  }
  return proj >= 6 || dmg >= 300;
}
