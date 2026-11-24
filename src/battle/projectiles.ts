import type { ResolvedShot } from '../types';
import { damageEnemy } from './enemies';
import { ELEMENT_COLOR, H, MUZZLE_X, MUZZLE_Y, W, burst, type Enemy, type PProj, type World } from './model';
import { applyStatus } from './status';

const CHAIN_RANGE = 200;
const CHAIN_FALLOFF = 0.75;

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
  damageEnemy(w, e, dmg, shot.element);
  if (!e.dead) for (const s of shot.statuses) applyStatus(e, s);
  burst(w, e.x, e.y, ELEMENT_COLOR[shot.element], 7, 130, 0.35, 2.2);
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

  if (shot.aoeRadius > 0) {
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
