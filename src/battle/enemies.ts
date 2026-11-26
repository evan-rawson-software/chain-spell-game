import type { Element, EnemyKind } from '../types';
import {
  ELEMENT_COLOR, ENEMY_CFG, H, WARD_R, WARD_X, WARD_Y, W, burst, floatText,
  type Enemy, type World,
} from './model';
import { addTrauma, damageTextSize, onBigHit, registerKill } from './juice';
import { applyStatus, clearStatuses, damageTakenMul, moveMul, newStatus, tickStatus } from './status';
import {
  HEAT_BURN, HEAT_PERIOD, HYDRA_HEADS_PER_STAGE, HYDRA_HEAD_HP_FRAC, RAIN_WET, SHIELD_REGROW, STOMP_DAMAGE,
  defenseMul, elementMul, fogVisible, hazardSlowMul, hydraStage, isBoss, reflectDamage, regenAmount, splitsInto,
  stompHitsWard, traitSpeedMul,
} from './rules';
import { sfx } from './sound';

export function spawnEnemy(
  w: World, kind: EnemyKind, hpScale: number, at?: { x: number; y: number }, opts: { hp?: number } = {},
): Enemy {
  const cfg = ENEMY_CFG[kind];
  const hp = opts.hp ?? Math.max(1, Math.round(cfg.hp * hpScale * w.mods.enemyHpMul));
  const e: Enemy = {
    id: w.nextId++, kind, cfg,
    x: at ? at.x : W + cfg.r + 10,
    y: at ? at.y : isBoss(kind) ? H / 2 : 60 + Math.random() * 480,
    hp, maxHp: hp, r: cfg.r, st: newStatus(),
    cd: cfg.ranged ? 0.8 + Math.random() * cfg.ranged.cd * 0.5 : 0,
    summonCd: cfg.summon ? cfg.summon.every * 0.5 : 0,
    dead: false, flash: 0, attackAnim: 0, dotAcc: 0, dotTimer: 0, phase: Math.random() * 6, reactAt: {},
    hpScale, shield: !!cfg.shield, lastHit: -99, lastDamaged: w.time, shellBroken: 0,
    abilityCd: cfg.stomp ? cfg.stomp.every : cfg.pulse ? cfg.pulse.every * 0.6 : 0,
    stage: 0, shieldFlash: 0,
    trait: kind === 'elite_knight' ? w.eliteTrait : undefined,
  };
  w.enemies.push(e);
  return e;
}

/** Fog hides enemies beyond x = 650 unless hit recently; with no fog every enemy is visible. */
export function enemyVisible(w: World, e: Enemy): boolean {
  return w.hazard !== 'fog' || fogVisible(e.x, w.time - e.lastHit);
}

/**
 * A Shield Bearer's shield absorbs one whole hit (projectile, blast, arc, reaction hit): returns true if
 * the hit was absorbed. Callers skip damage, reactions and statuses for an absorbed hit.
 */
export function blockHit(w: World, e: Enemy): boolean {
  if (e.dead || !e.shield) return false;
  e.shield = false;
  e.shieldFlash = 0.3;
  e.lastHit = w.time;
  floatText(w, e.x, e.y - e.r - 8, 'BLOCK', '#9fd0ff', 15, 0.8, true);
  w.rings.push({ x: e.x, y: e.y, r: e.r, maxR: e.r * 1.6, t: 0, max: 0.25, color: '#9fd0ff' });
  burst(w, e.x, e.y, '#9fd0ff', 8, 120, 0.3, 2);
  sfx('hitPure', { pitch: 1.5 });
  return true;
}

/** Applies damage after resistances / weaken / wet / defenses. Returns final damage. */
export function damageEnemy(
  w: World, e: Enemy, base: number, element: Element, dot = false, opts: { reaction?: boolean; src?: string } = {},
): number {
  if (e.dead) return 0;
  const resist = e.cfg.resist[element] ?? 0;
  const def = defenseMul(e.kind, { frozen: e.st.freeze > 0, weakened: !!e.st.weaken, shellBroken: e.shellBroken });
  const dmg = base * (1 - resist) * damageTakenMul(e.st, element) * def * elementMul(element, w.hazard, e.trait);
  const before = e.hp;
  e.hp -= dmg;
  e.flash = 0.12;
  e.lastDamaged = w.time;
  if (opts.src) w.runeDamage[opts.src] = (w.runeDamage[opts.src] ?? 0) + Math.min(dmg, Math.max(0, before));
  if (dot) e.dotAcc += dmg;
  else {
    e.lastHit = w.time;
    if (dmg > w.bestHit) w.bestHit = dmg;
    const size = damageTextSize(dmg) * (opts.reaction ? 1.25 : 1);
    floatText(w, e.x, e.y - e.r - 6, String(Math.max(1, Math.round(dmg))), ELEMENT_COLOR[element], size, opts.reaction ? 1.1 : 0.9, !!opts.reaction);
    if (dmg >= 150) { onBigHit(w, dmg); sfx('bigHit'); }
    if (e.trait === 'reflective' && dmg > 0) damageWard(w, reflectDamage(dmg));
  }
  if (e.hp <= 0) killEnemy(w, e);
  return dmg;
}

function killEnemy(w: World, e: Enemy): void {
  e.dead = true;
  w.kills++;
  registerKill(w, e, () => sfx('multiKill'));
  const boss = isBoss(e.kind);
  sfx(boss ? 'bossDie' : 'enemyDie');
  burst(w, e.x, e.y, e.cfg.color, boss ? 60 : 16, boss ? 300 : 140, 0.7, 3);
  w.rings.push({ x: e.x, y: e.y, r: e.r * 0.5, maxR: e.r * 1.8, t: 0, max: 0.35, color: e.cfg.color });

  const split = splitsInto(e.kind);
  if (split) {
    const a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < split.count; i++) {
      const a = a0 + (i * Math.PI * 2) / split.count;
      const y = Math.max(20, Math.min(H - 20, e.y + Math.sin(a) * (e.r + 6)));
      spawnEnemy(w, split.kind, e.hpScale, { x: e.x + Math.cos(a) * (e.r + 6), y });
    }
    burst(w, e.x, e.y, e.cfg.color, 10, 160, 0.4, 2.5);
  }
  if (e.kind === 'boss_hydra') {
    // the heads die with the body so the wave can end (they are not counted as kills)
    for (const o of w.enemies) {
      if (o.kind !== 'hydra_head' || o.dead) continue;
      o.dead = true;
      burst(w, o.x, o.y, o.cfg.color, 14, 160, 0.5, 2.8);
    }
  }
}

export function damageWard(w: World, n: number): void {
  if (w.wardHp <= 0) return;
  n *= w.mods.enemyDamageMul;
  const d = Math.min(n, w.wardHp);
  w.wardHp -= d;
  w.damageTaken += d;
  w.wardFlash = 0.25;
  w.momentum = 0;
  sfx('wardHit');
  addTrauma(w, 0.3);
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

/** Rain keeps everyone Wet; Heatwave ignites everyone every few seconds. */
function updateHazard(w: World, dt: number): void {
  if (w.hazard === 'rain') {
    for (const e of w.enemies) {
      if (e.dead) continue;
      e.st.wet = { p: Math.max(e.st.wet?.p ?? 0, RAIN_WET), t: Math.max(e.st.wet?.t ?? 0, 1) };
    }
  } else if (w.hazard === 'heatwave') {
    w.hazardT -= dt;
    if (w.hazardT <= 0) {
      w.hazardT += HEAT_PERIOD;
      for (const e of w.enemies) {
        if (e.dead) continue;
        applyStatus(e, { kind: 'burn', potency: HEAT_BURN.dps, duration: HEAT_BURN.t }, { slowMul: hazardSlowMul(w.hazard) });
        if (e.st.burn) burst(w, e.x, e.y, '#ff9a3a', 4, 70, 0.4, 2);
      }
    }
  }
}

function spawnHydraHeads(w: World, boss: Enemy, stage: number): void {
  const hp = Math.max(1, Math.round(boss.maxHp * HYDRA_HEAD_HP_FRAC));
  const dy = 110 + 80 * (stage - 1);
  for (let i = 0; i < HYDRA_HEADS_PER_STAGE; i++) {
    const y = Math.max(60, Math.min(H - 60, boss.y + (i ? dy : -dy)));
    const x = Math.max(160, Math.min(920, boss.x + 40));
    const h = spawnEnemy(w, 'hydra_head', boss.hpScale, { x, y }, { hp });
    burst(w, h.x, h.y, '#9be05a', 14, 160, 0.5, 2.8);
    w.rings.push({ x: h.x, y: h.y, r: 6, maxR: 40, t: 0, max: 0.4, color: '#9be05a' });
  }
  floatText(w, boss.x, boss.y - boss.r - 30, 'NEW HEADS', '#9be05a', 20, 1.3, true);
  addTrauma(w, 0.4);
  sfx('reaction', { pitch: 0.7 });
}

function pulseCleanser(w: World, e: Enemy): void {
  const pulse = e.cfg.pulse!;
  let cleared = 0;
  for (const o of w.enemies) {
    if (o.dead || Math.hypot(o.x - e.x, o.y - e.y) > pulse.radius) continue;
    if (clearStatuses(o.st) > 0) { cleared++; burst(w, o.x, o.y, '#fff6c0', 6, 90, 0.4, 2); }
  }
  e.shieldFlash = 0.35;
  w.rings.push({ x: e.x, y: e.y, r: 10, maxR: pulse.radius, t: 0, max: 0.5, color: '#fff6c0' });
  if (cleared > 0) floatText(w, e.x, e.y - e.r - 10, 'CLEANSE', '#fff6c0', 14, 0.9, true);
}

/** Golem stomp: a shockwave. It hurts the ward only if the golem is within STOMP_RANGE of it. */
function stomp(w: World, e: Enemy): void {
  addTrauma(w, 0.5);
  sfx('explosion', { pitch: 0.6 });
  burst(w, e.x, e.y + e.r * 0.6, '#b8b0a0', 24, 220, 0.6, 3);
  w.rings.push({ x: e.x, y: e.y, r: e.r, maxR: 350, t: 0, max: 0.6, color: '#d8cdb8' });
  w.rings.push({ x: e.x, y: e.y, r: e.r * 0.5, maxR: 220, t: 0, max: 0.45, color: '#ffb35a' });
  if (stompHitsWard(e.x, e.y, WARD_X, WARD_Y)) damageWard(w, STOMP_DAMAGE);
}

export function updateEnemies(w: World, dt: number, hpScale: number): void {
  updateHazard(w, dt);
  for (const e of w.enemies) {
    if (e.dead) continue;
    e.phase += dt;
    e.flash = Math.max(0, e.flash - dt);
    e.attackAnim = Math.max(0, e.attackAnim - dt);
    e.shieldFlash = Math.max(0, e.shieldFlash - dt);
    e.shellBroken = Math.max(0, e.shellBroken - dt);

    // damage over time (ignores shields); attributed to the rune that applied it
    const dot = tickStatus(e.st, dt);
    if (dot.burn > 0) damageEnemy(w, e, dot.burn, 'fire', true, { src: dot.burnSrc });
    for (const [src, amt] of dot.poisonBy) {
      if (e.dead) break;
      if (amt > 0) damageEnemy(w, e, amt, 'nature', true, { src });
    }
    if (e.dead) continue;
    e.dotTimer -= dt;
    if (e.dotTimer <= 0) {
      e.dotTimer = 0.5;
      if (e.dotAcc >= 1) {
        floatText(w, e.x, e.y - e.r - 6, String(Math.round(e.dotAcc)), e.st.poison.length && !e.st.burn ? '#7bd34a' : '#ff9a4a', 12, 0.7);
      }
      e.dotAcc = 0;
    }

    if (e.trait === 'regenerating') {
      e.hp = Math.min(e.maxHp, e.hp + regenAmount(e.maxHp, dt, w.time - e.lastDamaged));
    }
    if (e.cfg.shield && !e.shield && w.time - e.lastHit >= SHIELD_REGROW) {
      e.shield = true;
      e.shieldFlash = 0.3;
      w.rings.push({ x: e.x, y: e.y, r: e.r * 1.5, maxR: e.r, t: 0, max: 0.25, color: '#9fd0ff' });
    }
    if (e.kind === 'boss_hydra') {
      const stage = hydraStage(e.hp / e.maxHp);
      while (e.stage < stage) { e.stage++; spawnHydraHeads(w, e, e.stage); }
    }

    if (e.st.freeze > 0) continue; // frozen: no movement, no attacks, cooldowns hold
    const mul = moveMul(e.st) * w.mods.enemySpeedMul * traitSpeedMul(e.trait);
    const cfg = e.cfg;
    e.cd -= dt;

    if (cfg.pulse) {
      e.abilityCd -= dt;
      if (e.abilityCd <= 0) { e.abilityCd = cfg.pulse.every; pulseCleanser(w, e); }
    }
    if (cfg.stomp) {
      e.abilityCd -= dt;
      if (e.abilityCd <= 0) { e.abilityCd = cfg.stomp.every; stomp(w, e); }
    }

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
