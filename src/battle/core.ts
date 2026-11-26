/**
 * Simulation pieces shared by the real battle (game.ts) and the practice range (practice.ts):
 * the auto-cast scheduler and the real-time frame loop with its juice (hit-stop, slow motion,
 * shake, flash). Everything else (world update, rendering, input, layout) stays with the caller.
 */
import type { CastPlan } from '../types';
import { addTrauma, isLargeCast } from './juice';
import { ECHO_DELAY, echoDue, momentumMul } from './keystones';
import { MUZZLE_X, MUZZLE_Y, floatText, type World } from './model';
import { fireShot } from './projectiles';
import { sfx } from './sound';
import { capSpeeds } from './timing';

export interface Point { x: number; y: number }

interface ActiveCast { i: number; t: number; mul: number; echo: boolean }

export interface Caster {
  readonly plan: CastPlan;
  readonly castTime: number;
  readonly hasShots: boolean;
  readonly largeCast: boolean;
  /** Seconds charged toward the next cast. */
  charge: number;
  /** World time of the last cast, for the HUD. */
  lastCast: number;
  lastAim: Point;
  /** terminal sourceUid -> world time its shot last fired (spell strip flashes) */
  flashes: Map<string, number>;
  /** True when a cast started during the last update (the caller clears its manual-fire window). */
  readonly firedLastUpdate: boolean;
  /** Swap the spell: resets charge and any cast in flight. */
  setPlan(plan: CastPlan): void;
  /** Drop casts in flight (battle end). */
  clearCasts(): void;
  /**
   * Advance charging and in-flight casts. A full charge fires at `forced` if given, else at
   * `aim()`; a cast with no target waits. Shots in flight re-aim with `aim()` as they leave.
   */
  update(w: World, dt: number, aim: () => Point | null, forced: Point | null): void;
}

export function createCaster(initial: CastPlan): Caster {
  let plan = initial;
  let speeds = capSpeeds(plan.shots.map(s => s.speed));
  let casts: ActiveCast[] = [];
  let castCount = 0;
  let fired = false;
  const c: Caster = {
    get plan() { return plan; },
    get castTime() { return Math.max(0.05, plan.castTime); },
    get hasShots() { return plan.shots.length > 0; },
    get largeCast() { return isLargeCast(plan.shots); },
    charge: 0,
    lastCast: -99,
    lastAim: { x: 500, y: 300 },
    flashes: new Map(),
    get firedLastUpdate() { return fired; },
    setPlan(p: CastPlan): void {
      plan = p;
      speeds = capSpeeds(plan.shots.map(s => s.speed));
      casts = [];
      castCount = 0;
      c.charge = 0;
    },
    clearCasts(): void { casts = []; },
    update(w, dt, aim, forced): void {
      fired = false;
      const stagger = Math.max(0, plan.stagger);
      c.charge = Math.min(c.castTime, c.charge + dt);
      if (c.hasShots && c.charge >= c.castTime) {
        const target = forced ?? aim();
        if (target) {
          c.lastAim = target;
          c.charge = 0;
          fired = true;
          c.lastCast = w.time;
          const mul = w.ks.momentum ? momentumMul(w.momentum) : 1;
          if (w.ks.momentum) w.momentum++;
          casts.push({ i: 0, t: 0, mul, echo: false });
          castCount++;
          if (w.ks.echo && echoDue(castCount)) {
            casts.push({ i: 0, t: ECHO_DELAY, mul, echo: true });
            echoCue(w, false);
          }
          sfx('castFire');
          if (c.largeCast) addTrauma(w, 0.2);
        }
      }
      for (const k of casts) {
        k.t -= dt;
        while (k.t <= 0 && k.i < plan.shots.length) {
          const a = aim() ?? c.lastAim;
          c.lastAim = a;
          if (k.echo && k.i === 0) echoCue(w, true);
          // speeds are capped per cast, so an echo volley starts again from its own first shot
          fireShot(w, plan.shots[k.i], a.x, a.y, k.mul, speeds[k.i]);
          c.flashes.set(plan.shots[k.i].sourceUid, w.time);
          k.i++;
          k.t += stagger;
        }
      }
      casts = casts.filter(k => k.i < plan.shots.length);
    },
  };
  return c;
}

/** Echo Glyph cue: a pulse and callout when queued, a second pulse when the echo volley fires. */
function echoCue(w: World, fire: boolean): void {
  w.rings.push({ x: MUZZLE_X, y: MUZZLE_Y, r: 20, maxR: fire ? 95 : 70, t: 0, max: 0.4, color: '#c9a6ff' });
  if (fire) {
    w.rings.push({ x: MUZZLE_X, y: MUZZLE_Y, r: 10, maxR: 60, t: 0, max: 0.3, color: '#ffffff' });
    sfx('castFire', { pitch: 1.25 });
  } else {
    floatText(w, MUZZLE_X + 40, MUZZLE_Y - 60, 'ECHO', '#c9a6ff', 20, 1, true);
  }
}

// ---------------------------------------------------------------- frame loop

export const FLASH_DUR = 0.45;
const SLOWMO_SCALE = 0.3;

export interface LoopOptions {
  world: World;
  /** One simulation step of at most 0.05 s. */
  update(dt: number): void;
  draw(): void;
  /** Stop the loop after the frame in which this turns true. */
  done?(): boolean;
  /** Real-time hit-stop on big hits (battle only). Default true. */
  hitStop?: boolean;
  /** Shake magnitude multiplier. */
  shakeMul: number;
}

export interface Loop {
  /** Current screen-shake offset in world units. */
  readonly shake: Point;
  /** Seconds of white flash remaining (0..FLASH_DUR). */
  readonly flashT: number;
  simSpeed: number;
  destroy(): void;
}

/** requestAnimationFrame loop: juice on real time, sim sub-stepped, paused while the tab is hidden. */
export function createLoop(o: LoopOptions): Loop {
  const w = o.world;
  const useHitStop = o.hitStop !== false;
  let stopT = 0, stopBudget = 0.12, slowT = 0, flashT = 0;
  let paused = document.hidden;
  let destroyed = false;
  let raf = 0;
  let last = 0;
  const shake: Point = { x: 0, y: 0 };
  const onVis = (): void => { paused = document.hidden; last = 0; };
  const loop: Loop = {
    shake,
    get flashT() { return flashT; },
    simSpeed: 1,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    },
  };

  function frame(now: number): void {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    if (paused) { last = 0; return; }
    const realDt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;

    // juice runs on real time: shake decay, hit-stop (rate-limited), slow motion, flash
    if (w.hitStopReq > 0) {
      if (useHitStop) {
        const grant = Math.min(w.hitStopReq, stopBudget);
        stopBudget -= grant;
        stopT = Math.min(0.12, stopT + grant);
      }
      w.hitStopReq = 0;
    }
    stopBudget = Math.min(0.12, stopBudget + realDt * 0.24);
    if (w.slowmoReq > 0) { slowT = Math.max(slowT, w.slowmoReq); w.slowmoReq = 0; }
    if (w.flashReq > 0) { flashT = FLASH_DUR * w.flashReq; w.flashReq = 0; }
    w.trauma = Math.max(0, w.trauma - realDt * 1.3);
    flashT = Math.max(0, flashT - realDt);
    const mag = w.trauma * w.trauma * 12 * o.shakeMul;
    shake.x = mag > 0.01 ? (Math.random() * 2 - 1) * mag : 0;
    shake.y = mag > 0.01 ? (Math.random() * 2 - 1) * mag : 0;

    let dt = realDt;
    if (stopT > 0) { stopT -= realDt; dt = 0; }
    else if (slowT > 0) dt = realDt * SLOWMO_SCALE;
    slowT = Math.max(0, slowT - realDt);
    // sub-step so a fast-forwarded frame stays stable (steps of at most 0.05 s)
    let rem = dt * loop.simSpeed;
    while (rem > 1e-6) {
      const step = Math.min(0.05, rem);
      o.update(step);
      rem -= step;
    }
    o.draw();
    if (o.done?.()) { cancelAnimationFrame(raf); raf = 0; }
  }

  raf = requestAnimationFrame(frame);
  return loop;
}
