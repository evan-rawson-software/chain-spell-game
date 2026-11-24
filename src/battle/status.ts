import type { Element, StatusApplication } from '../types';
import type { Enemy, StatusState } from './model';

export function newStatus(): StatusState {
  return { burn: null, poison: [], slow: null, freeze: 0, wet: null, weaken: null };
}

export function applyStatus(e: Enemy, a: StatusApplication): void {
  const st = e.st;
  const dur = Math.max(0.05, a.duration);
  switch (a.kind) {
    case 'burn':
      st.burn = { dps: Math.max(st.burn?.dps ?? 0, a.potency), t: dur };
      break;
    case 'poison':
      st.poison.push({ dps: a.potency, t: dur });
      break;
    case 'slow':
      if (!st.slow || a.potency > st.slow.p) st.slow = { p: Math.min(0.95, a.potency), t: dur };
      else if (a.potency === st.slow.p) st.slow.t = Math.max(st.slow.t, dur);
      break;
    case 'freeze':
      st.freeze = Math.max(st.freeze, dur * e.cfg.freezeMul);
      break;
    case 'wet':
      st.wet = { p: Math.max(st.wet?.p ?? 0, a.potency), t: dur };
      break;
    case 'weaken':
      st.weaken = { p: Math.max(st.weaken?.p ?? 0, a.potency), t: dur };
      break;
  }
}

/** Advances timers; returns damage-over-time dealt this tick. */
export function tickStatus(st: StatusState, dt: number): { burn: number; poison: number } {
  let burn = 0, poison = 0;
  if (st.burn) {
    burn = st.burn.dps * Math.min(dt, st.burn.t);
    st.burn.t -= dt;
    if (st.burn.t <= 0) st.burn = null;
  }
  if (st.poison.length) {
    for (const p of st.poison) { poison += p.dps * Math.min(dt, p.t); p.t -= dt; }
    st.poison = st.poison.filter(p => p.t > 0);
  }
  if (st.slow) { st.slow.t -= dt; if (st.slow.t <= 0) st.slow = null; }
  if (st.freeze > 0) st.freeze = Math.max(0, st.freeze - dt);
  if (st.wet) { st.wet.t -= dt; if (st.wet.t <= 0) st.wet = null; }
  if (st.weaken) { st.weaken.t -= dt; if (st.weaken.t <= 0) st.weaken = null; }
  return { burn, poison };
}

export function moveMul(st: StatusState): number {
  if (st.freeze > 0) return 0;
  return st.slow ? Math.max(0.05, 1 - st.slow.p) : 1;
}

export function damageTakenMul(st: StatusState, element: Element): number {
  let m = 1;
  if (st.weaken) m *= 1 + st.weaken.p;
  if (element === 'lightning' && st.wet) m *= 1 + st.wet.p;
  return m;
}
