import type { Element, EnemyKind } from '../types';
import {
  ELEMENT_COLOR, ENEMY_CFG, H, WARD_R, WARD_X, WARD_Y, W, burst, floatText,
  type Enemy, type World,
} from './model';
import { damageTakenMul, moveMul, newStatus, tickStatus } from './status';
import { sfx } from '../audio';

export function spawnEnemy(w: World, kind: EnemyKind, hpScale: number, at?: { x: number; y: number }): Enemy {
  const cfg = ENEMY_CFG[kind];
  const hp = Math.round(cfg.hp * hpScale);
  const e: Enemy = {
    id: w.nextId++, kind, cfg,
    x: at ? at.x : W + cfg.r + 10,
    y: at ? at.y : kind === 'boss_lich' ? H / 2 : 60 + Math.random() * 480,
    hp, maxHp: hp, r: cfg.r, st: newStatus(),
    cd: cfg.ranged ? 0.8 + Math.random() * cfg.ranged.cd * 0.5 : 0,
    summonCd: cfg.summon ? cfg.summon.every * 0.5 : 0,
    dead: false, flash: 0, attackAnim: 0, dotAcc: 0, dotTimer: 0, phase: Math.random() * 6,
  };
  w.enemies.push(e);
  return e;
}

/** Applies damage after resistances / weaken / wet. Returns final damage. */
export function damageEnemy(w: World, e: Enemy, base: number, element: Element, dot = false): number {
  if (e.dead) return 0;
  const resist = e.cfg.resist[element] ?? 0;
  const dmg = base * (1 - resist) * damageTakenMul(e.st, element);
  e.hp -= dmg;
  e.flash = 0.12;
  if (dot) e.dotAcc += dmg;
  else floatText(w, e.x, e.y - e.r - 6, String(Math.max(1, Math.round(dmg))), ELEMENT_COLOR[element], dmg >= 60 ? 19 : 14);
  if (e.hp <= 0) killEnemy(w, e);
  return dmg;
}

function killEnemy(w: World, e: Enemy): void {
  e.dead = true;
  w.kills++;
  sfx(e.kind === 'boss_lich' ? 'bossDie' : 'enemyDie');
  burst(w, e.x, e.y, e.cfg.color, e.kind === 'boss_lich' ? 60 : 16, e.kind === 'boss_lich' ? 300 : 140, 0.7, 3);
  w.rings.push({ x: e.x, y: e.y, r: e.r * 0.5, maxR: e.r * 1.8, t: 0, max: 0.35, color: e.cfg.color });
}

export function damageWard(w: World, n: number): void {
  if (w.wardHp <= 0) return;
  const d = Math.min(n, w.wardHp);
  w.wardHp -= d;
  w.damageTaken += d;
  w.wardFlash = 0.25;
  sfx('wardHit');
  floatText(w, WARD_X, WARD_Y - 50, '-' + Math.round(d), '#ff5a5a', 18, 1);
  burst(w, WARD_X, WARD_Y, '#ff5a5a', 8, 120, 0.4);
}

function fireEnemyShots(w: World, e: Enemy): void {
  const r = e.cfg.ranged!;
  const base = Math.atan2(WARD_Y - e.y, WARD_X - e.x);
  const spread = (r.spreadDeg * Math.PI) / 180;
  for (let i = 0; i < r.count; i++) {
    const a = r.count > 1 ? base - spread / 2 + (spread * i) / (r.count - 1) : base;
    w.eprojs.push({
      x: e.x - e.r * 0.6, y: e.y, vx: Math.cos(a) * r.projSpeed, vy: Math.sin(a) * r.projSpeed,
      r: r.projR, dmg: r.dmg, color: r.color, dead: false,
    });
  }
  e.attackAnim = 0.25;
  sfx('enemyShoot');
}

export function updateEnemies(w: World, dt: number, hpScale: number): void {
  for (const e of w.enemies) {
    if (e.dead) continue;
    e.phase += dt;
    e.flash = Math.max(0, e.flash - dt);
    e.attackAnim = Math.max(0, e.attackAnim - dt);

    // damage over time
    const dot = tickStatus(e.st, dt);
    if (dot.burn > 0) damageEnemy(w, e, dot.burn, 'fire', true);
    if (!e.dead && dot.poison > 0) damageEnemy(w, e, dot.poison, 'nature', true);
    if (e.dead) continue;
    e.dotTimer -= dt;
    if (e.dotTimer <= 0) {
      e.dotTimer = 0.5;
      if (e.dotAcc >= 1) {
        floatText(w, e.x, e.y - e.r - 6, String(Math.round(e.dotAcc)), e.st.poison.length && !e.st.burn ? '#7bd34a' : '#ff9a4a', 12, 0.7);
      }
      e.dotAcc = 0;
    }

    if (e.st.freeze > 0) continue; // frozen: no movement, no attacks, cooldowns hold
    const mul = moveMul(e.st);
    const cfg = e.cfg;
    e.cd -= dt;

    if (cfg.ranged) {
      if (e.x > cfg.ranged.stopX) {
        e.x -= cfg.speed * mul * dt;
      } else if (e.cd <= 0) {
        fireEnemyShots(w, e);
        e.cd = cfg.ranged.cd;
      }
    } else if (cfg.melee) {
      const dx = WARD_X - e.x, dy = WARD_Y - e.y;
      const dist = Math.hypot(dx, dy);
      const reach = e.r + WARD_R - 4;
      if (dist > reach) {
        const s = Math.min(cfg.speed * mul * dt, dist - reach + 1);
        e.x += (dx / dist) * s;
        e.y += (dy / dist) * s;
      } else if (e.cd <= 0) {
        damageWard(w, cfg.melee.dmg);
        e.attackAnim = 0.25;
        e.cd = cfg.melee.cd;
      }
    }

    if (cfg.summon) {
      e.summonCd -= dt;
      if (e.summonCd <= 0) {
        e.summonCd = cfg.summon.every;
        for (let i = 0; i < cfg.summon.count; i++) {
          const y = Math.max(60, Math.min(540, e.y + (i - (cfg.summon.count - 1) / 2) * 110));
          spawnEnemy(w, 'grunt', hpScale, { x: e.x - e.r - 20, y });
        }
        burst(w, e.x, e.y, '#8cffb0', 30, 200, 0.6, 3);
        w.rings.push({ x: e.x, y: e.y, r: e.r, maxR: e.r * 2.5, t: 0, max: 0.5, color: '#8cffb0' });
      }
    }
  }
}

export function updateEnemyProjectiles(w: World, dt: number): void {
  for (const p of w.eprojs) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (Math.hypot(p.x - WARD_X, p.y - WARD_Y) < p.r + WARD_R - 4) {
      damageWard(w, p.dmg);
      p.dead = true;
    } else if (p.x < -40 || p.x > W + 60 || p.y < -40 || p.y > H + 40) {
      p.dead = true;
    }
  }
  w.eprojs = w.eprojs.filter(p => !p.dead);
}

export function sweepDead(w: World): void {
  if (w.enemies.some(e => e.dead)) w.enemies = w.enemies.filter(e => !e.dead);
}
