import type { Element, ResolvedShot } from '../types';
import type { SfxName } from '../audio';
import { damageEnemy } from './enemies';
import { ELEMENT_COLOR, H, MUZZLE_X, MUZZLE_Y, W, burst, floatText, type Enemy, type PProj, type World } from './model';
import { addTrauma } from './juice';
import {
  consumeStatuses, markTriggered, planReactions, reactionMult, readyPlans, type ReactionPlan,
} from './reactions';
import { applyStatus } from './status';
import { sfx } from '../audio';

const CHAIN_RANGE = 200;
const CHAIN_FALLOFF = 0.75;

const SHOT_SFX: Record<Element, SfxName> = {
  fire: 'shotFire', frost: 'shotFrost', nature: 'shotNature', lightning: 'shotLightning',
  arcane: 'shotArcane', storm: 'shotStorm', pure: 'shotPure',
};
const HIT_SFX: Record<Element, SfxName> = {
  fire: 'hitFire', frost: 'hitFrost', nature: 'hitNature', lightning: 'hitLightning',
  arcane: 'hitArcane', storm: 'hitStorm', pure: 'hitPure',
};

/** Spawn all projectiles of one shot, aimed at (tx, ty). */
export function fireShot(w: World, shot: ResolvedShot, tx: number, ty: number): void {
  const base = Math.atan2(ty - MUZZLE_Y, tx - MUZZLE_X);
  const n = Math.max(1, Math.round(shot.count));
  const spread = (shot.spreadDeg * Math.PI) / 180;
  for (let i = 0; i < n; i++) {
    const a = n > 1 ? base - spread / 2 + (spread * i) / (n - 1) : base;
    w.pprojs.push({
      x: MUZZLE_X, y: MUZZLE_Y,
      vx: Math.cos(a) * shot.speed, vy: Math.sin(a) * shot.speed,
      r: Math.max(2, shot.size), shot, hit: new Set(), pierceLeft: Math.max(0, Math.round(shot.pierce)),
      dead: false, age: 0,
    });
  }
  burst(w, MUZZLE_X, MUZZLE_Y, ELEMENT_COLOR[shot.element], 6, 90, 0.3, 2);
  sfx(SHOT_SFX[shot.element]);
}

function nearest(w: World, x: number, y: number, exclude: Set<number>, maxDist = Infinity): Enemy | null {
  let best: Enemy | null = null;
  let bd = maxDist;
  for (const e of w.enemies) {
    if (e.dead || exclude.has(e.id)) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function applyHit(w: World, e: Enemy, shot: ResolvedShot, dmg: number): void {
  // reactions look at the statuses BEFORE this hit applies its own
  const plans = e.dead ? [] : readyPlans(planReactions(e.st, shot.element), e.reactAt, w.time);
  const rdm = w.mods.reactionDamageMul;
  damageEnemy(w, e, dmg * reactionMult(plans, rdm), shot.element, false, { reaction: plans.length > 0 });
  if (plans.length) {
    markTriggered(plans, e.reactAt, w.time);
    consumeStatuses(e.st, plans.flatMap(p => p.consume));
    plans.forEach((p, i) => runReaction(w, e, p, dmg, rdm, i));
  }
  if (!e.dead) for (const s of shot.statuses) applyStatus(e, s);
  burst(w, e.x, e.y, ELEMENT_COLOR[shot.element], 7, 130, 0.35, 2.2);
}

/** Reaction damage goes straight through damageEnemy, which never starts another reaction. */
function reactionHit(w: World, o: Enemy, amount: number, element: Element): void {
  if (amount > 0) damageEnemy(w, o, amount, element, false, { reaction: true });
}

/** Feedback and area effects of one reaction on `e`. `hitDmg` is the triggering hit before multipliers. */
function runReaction(w: World, e: Enemy, p: ReactionPlan, hitDmg: number, rdm: number, idx: number): void {
  w.reactions++;
  floatText(w, e.x, e.y - e.r - 24 - idx * 16, p.name, p.color, 17, 1.1, true);
  addTrauma(w, 0.25);
  if (p.kind === 'shatter') {
    sfx('shatter');
    burst(w, e.x, e.y, '#dff6ff', 18, 220, 0.5, 2.6);
  } else if (w.time - w.lastReactSfx > 0.06) {
    sfx('reaction', { pitch: 0.85 + Math.random() * 0.4 });
  }
  w.lastReactSfx = w.time;

  const x = e.x, y = e.y, ex = p.extra;
  if (!ex) return;
  const near = (r: number, self: boolean): Enemy[] =>
    w.enemies.filter(o => !o.dead && (self || o !== e) && Math.hypot(o.x - x, o.y - y) <= r + o.r);
  switch (ex.type) {
    case 'cloud':
      w.rings.push({ x, y, r: 10, maxR: ex.radius, t: 0, max: 0.6, color: p.color });
      burst(w, x, y, p.color, 22, ex.radius * 1.4, 0.7, 3);
      for (const o of near(ex.radius, true)) {
        applyStatus(o, { kind: 'wet', potency: ex.wet.p, duration: ex.wet.t });
        applyStatus(o, { kind: 'slow', potency: ex.slow.p, duration: ex.slow.t });
      }
      break;
    case 'combust': {
      w.rings.push({ x, y, r: 8, maxR: ex.radius, t: 0, max: 0.4, color: p.color });
      burst(w, x, y, p.color, 20, ex.radius * 2, 0.5, 2.8);
      const dmg = ex.damage * rdm;
      for (const o of near(ex.radius, true)) reactionHit(w, o, dmg, 'fire');
      break;
    }
    case 'spread':
      w.rings.push({ x, y, r: 8, maxR: ex.radius, t: 0, max: 0.5, color: p.color });
      for (const o of near(ex.radius, false)) {
        applyStatus(o, { kind: 'burn', potency: ex.burn.dps, duration: ex.burn.t });
        burst(w, o.x, o.y, p.color, 6, 90, 0.4, 2);
      }
      break;
    case 'arcs': {
      const dmg = hitDmg * ex.frac * rdm;
      for (const o of near(ex.radius, false)) {
        if (!o.st.wet) continue;
        w.arcs.push({ pts: lightningPoints(x, y, o.x, o.y), t: 0, max: 0.3, color: ELEMENT_COLOR.lightning });
        reactionHit(w, o, dmg, 'lightning');
        consumeStatuses(o.st, ['wet']);
      }
      break;
    }
    case 'blast': {
      w.rings.push({ x, y, r: 8, maxR: ex.radius, t: 0, max: 0.35, color: p.color });
      burst(w, x, y, p.color, 16, ex.radius * 2.2, 0.45, 2.6);
      const dmg = hitDmg * ex.frac * rdm;
      for (const o of near(ex.radius, false)) reactionHit(w, o, dmg, 'lightning');
      break;
    }
  }
}

function lightningPoints(x1: number, y1: number, x2: number, y2: number): { x: number; y: number }[] {
  const pts = [{ x: x1, y: y1 }];
  const segs = Math.max(3, Math.round(Math.hypot(x2 - x1, y2 - y1) / 25));
  const nx = -(y2 - y1), ny = x2 - x1;
  const len = Math.hypot(nx, ny) || 1;
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    const off = (Math.random() - 0.5) * 22;
    pts.push({ x: x1 + (x2 - x1) * t + (nx / len) * off, y: y1 + (y2 - y1) * t + (ny / len) * off });
  }
  pts.push({ x: x2, y: y2 });
  return pts;
}

function onHit(w: World, p: PProj, e: Enemy): void {
  const shot = p.shot;
  p.hit.add(e.id);
  applyHit(w, e, shot, shot.damage);
  sfx(HIT_SFX[shot.element]);

  if (shot.aoeRadius > 0) {
    sfx('explosion');
    addTrauma(w, 0.1);
    const color = ELEMENT_COLOR[shot.element];
    w.rings.push({ x: p.x, y: p.y, r: 4, maxR: shot.aoeRadius, t: 0, max: 0.35, color });
    burst(w, p.x, p.y, color, 14, shot.aoeRadius * 2, 0.45, 2.5);
    for (const o of w.enemies) {
      if (o.dead || o === e) continue;
      if (Math.hypot(o.x - p.x, o.y - p.y) <= shot.aoeRadius + o.r) {
        p.hit.add(o.id);
        applyHit(w, o, shot, shot.damage);
      }
    }
  }

  let cur = e;
  for (let i = 0; i < Math.round(shot.chain); i++) {
    const next = nearest(w, cur.x, cur.y, p.hit, CHAIN_RANGE);
    if (!next) break;
    p.hit.add(next.id);
    w.arcs.push({ pts: lightningPoints(cur.x, cur.y, next.x, next.y), t: 0, max: 0.3, color: ELEMENT_COLOR[shot.element] });
    applyHit(w, next, shot, shot.damage * CHAIN_FALLOFF);
    cur = next;
  }

  if (p.pierceLeft > 0) p.pierceLeft--;
  else p.dead = true;
}

export function updatePlayerProjectiles(w: World, dt: number): void {
  for (const p of w.pprojs) {
    p.age += dt;
    const homing = p.shot.homing;
    if (homing > 0) {
      const t = nearest(w, p.x, p.y, p.hit);
      if (t) {
        const spd = Math.hypot(p.vx, p.vy);
        const cur = Math.atan2(p.vy, p.vx);
        const want = Math.atan2(t.y - p.y, t.x - p.x);
        let diff = want - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const turn = Math.max(-homing * dt, Math.min(homing * dt, diff));
        p.vx = Math.cos(cur + turn) * spd;
        p.vy = Math.sin(cur + turn) * spd;
      }
    }
    // sub-step so fast projectiles don't tunnel
    const dist = Math.hypot(p.vx, p.vy) * dt;
    const steps = Math.max(1, Math.ceil(dist / 8));
    for (let s = 0; s < steps && !p.dead; s++) {
      p.x += (p.vx * dt) / steps;
      p.y += (p.vy * dt) / steps;
      for (const e of w.enemies) {
        if (e.dead || p.hit.has(e.id)) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) < p.r + e.r) {
          onHit(w, p, e);
          if (p.dead) break;
        }
      }
    }
    if (p.x < -60 || p.x > W + 60 || p.y < -60 || p.y > H + 60) p.dead = true;
    if (!p.dead && Math.random() < 0.6) {
      w.fx.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, life: 0.25, max: 0.25, size: p.r * 0.6, color: ELEMENT_COLOR[p.shot.element], drag: 3 });
    }
  }
  w.pprojs = w.pprojs.filter(p => !p.dead);
}
