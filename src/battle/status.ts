import type { Element, StatusApplication } from '../types';
import type { Enemy, StatusState } from './model';
import { sfx } from './sound';
import { traitBlocksBurn } from './rules';

export function newStatus(): StatusState {
  return { burn: null, poison: [], slow: null, freeze: 0, wet: null, weaken: null };
}

export interface ApplyCtx {
  /** sourceUid of the rune applying it (per-rune damage stats) */
  src?: string;
  /** multiplier on slow potency (heatwave) */
  slowMul?: number;
}

export function applyStatus(e: Enemy, a: StatusApplication, ctx: ApplyCtx = {}): void {
  const st = e.st;
  const dur = Math.max(0.05, a.duration);
  switch (a.kind) {
    case 'burn':
      if (traitBlocksBurn(e.trait)) break;
      st.burn = !st.burn || a.potency >= st.burn.dps
        ? { dps: a.potency, t: dur, src: ctx.src ?? st.burn?.src }
        : { dps: st.burn.dps, t: dur, src: st.burn.src };
      break;
    case 'poison':
      st.poison.push({ dps: a.potency, t: dur, src: ctx.src });
      break;
    case 'slow': {
      const p = a.potency * (ctx.slowMul ?? 1);
      if (!st.slow || p > st.slow.p) st.slow = { p: Math.min(0.95, p), t: dur };
      else if (p === st.slow.p) st.slow.t = Math.max(st.slow.t, dur);
      break;
    }
    case 'freeze':
      st.freeze = Math.max(st.freeze, dur * e.cfg.freezeMul);
      sfx('freeze');
      break;
    case 'wet':
      st.wet = { p: Math.max(st.wet?.p ?? 0, a.potency), t: dur };
      break;
    case 'weaken':
      st.weaken = { p: Math.max(st.weaken?.p ?? 0, a.potency), t: dur };
      break;
  }
}

/** Advances timers; returns damage-over-time dealt this tick, with the attributed rune of each source. */
export interface DotTick { burn: number; burnSrc?: string; poison: number; poisonBy: Map<string | undefined, number> }
export function tickStatus(st: StatusState, dt: number): DotTick {
  let burn = 0, poison = 0, burnSrc: string | undefined;
  const poisonBy = new Map<string | undefined, number>();
  if (st.burn) {
    burnSrc = st.burn.src;
    burn = st.burn.dps * Math.min(dt, st.burn.t);
    st.burn.t -= dt;
    if (st.burn.t <= 0) st.burn = null;
  }
  if (st.poison.length) {
    for (const p of st.poison) {
      const d = p.dps * Math.min(dt, p.t);
      poison += d; p.t -= dt;
      poisonBy.set(p.src, (poisonBy.get(p.src) ?? 0) + d);
    }
    st.poison = st.poison.filter(p => p.t > 0);
  }
  if (st.slow) { st.slow.t -= dt; if (st.slow.t <= 0) st.slow = null; }
  if (st.freeze > 0) st.freeze = Math.max(0, st.freeze - dt);
  if (st.wet) { st.wet.t -= dt; if (st.wet.t <= 0) st.wet = null; }
  if (st.weaken) { st.weaken.t -= dt; if (st.weaken.t <= 0) st.weaken = null; }
  return { burn, burnSrc, poison, poisonBy };
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

/** Strips every status (Cleanser pulse). Returns how many kinds were removed. */
export function clearStatuses(st: StatusState): number {
  const n = (st.burn ? 1 : 0) + (st.poison.length ? 1 : 0) + (st.slow ? 1 : 0) + (st.freeze > 0 ? 1 : 0)
    + (st.wet ? 1 : 0) + (st.weaken ? 1 : 0);
  st.burn = null; st.poison = []; st.slow = null; st.freeze = 0; st.wet = null; st.weaken = null;
  return n;
}
