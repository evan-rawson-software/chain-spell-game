import { describe, expect, it } from 'vitest';
import {
  ABILITY_INFO, OVERCAST_CHARGE_MUL, cooldownAfterUse, cooldownFrac, detonateParts, detonateTotal, isAbilityId,
  pulseCatches, pulseKnock, tickCooldown,
} from './ability';
import { newStatus } from './status';
import { ENEMY_CFG, newWorld } from './model';
import { spawnEnemy, updateEnemies } from './enemies';
import { createCaster } from './core';
import { createAbility } from './abilityfx';

describe('ability cooldowns', () => {
  it('uses the design cooldowns', () => {
    expect(ABILITY_INFO.overcast.cooldown).toBe(20);
    expect(ABILITY_INFO.ward_pulse.cooldown).toBe(18);
    expect(ABILITY_INFO.detonate.cooldown).toBe(22);
    expect(cooldownAfterUse('detonate')).toBe(22);
    expect(OVERCAST_CHARGE_MUL).toBe(2);
  });
  it('ticks down and clamps at ready', () => {
    expect(tickCooldown(5, 2)).toBe(3);
    expect(tickCooldown(1, 5)).toBe(0);
    expect(cooldownFrac('overcast', 20)).toBe(0);
    expect(cooldownFrac('overcast', 10)).toBeCloseTo(0.5);
    expect(cooldownFrac('overcast', 0)).toBe(1);
  });
  it('validates ids', () => {
    expect(isAbilityId('detonate')).toBe(true);
    expect(isAbilityId('nope')).toBe(false);
  });
});

describe('detonate damage table', () => {
  it('is empty without statuses', () => {
    expect(detonateParts(newStatus())).toEqual([]);
  });
  it('burn = 3 s of dps x2 fire', () => {
    const st = newStatus();
    st.burn = { dps: 8, t: 1 };
    expect(detonateParts(st)).toEqual([{ element: 'fire', damage: 48 }]);
  });
  it('poison = remaining x1.5 nature', () => {
    const st = newStatus();
    st.poison = [{ dps: 5, t: 4 }, { dps: 2, t: 1 }];
    expect(detonateParts(st)[0]).toEqual({ element: 'nature', damage: (20 + 2) * 1.5 });
  });
  it('slow, freeze, wet, weaken', () => {
    const st = newStatus();
    st.slow = { p: 0.4, t: 2 };
    st.freeze = 1;
    st.wet = { p: 0.5, t: 2 };
    st.weaken = { p: 0.25, t: 2 };
    const parts = detonateParts(st);
    expect(parts.find(p => p.element === 'frost')!.damage).toBe(60);
    expect(parts.find(p => p.element === 'lightning')!.damage).toBe(20);
    expect(parts.find(p => p.element === 'arcane')!.damage).toBe(25);
    expect(detonateTotal(st)).toBe(105);
  });
  it('scales with reaction damage', () => {
    const st = newStatus();
    st.wet = { p: 0.5, t: 2 };
    expect(detonateTotal(st, 1.5)).toBeCloseTo(30);
  });
});

describe('ward pulse', () => {
  it('pushes enemies inside 300 px away by 200', () => {
    const k = pulseKnock(280, 300, 10, 80, 300);
    expect(k.hit).toBe(true);
    expect(k.dx).toBeCloseTo(200);
    expect(k.dy).toBeCloseTo(0);
  });
  it('ignores enemies outside the radius (body radius counts)', () => {
    expect(pulseKnock(500, 300, 10, 80, 300).hit).toBe(false);
    expect(pulseKnock(385, 300, 10, 80, 300).hit).toBe(true);
  });
  it('pushes diagonally away', () => {
    const k = pulseKnock(80, 100, 10, 80, 300);
    expect(k.dx).toBeCloseTo(0);
    expect(k.dy).toBeCloseTo(-200);
  });
  it('catches projectiles within 300', () => {
    expect(pulseCatches(300, 300, 80, 300)).toBe(true);
    expect(pulseCatches(400, 300, 80, 300)).toBe(false);
  });
});

describe('in a world', () => {
  const plan = {
    castTime: 1, manaUsed: 1, stagger: 0, keystones: [],
    shots: [{
      element: 'fire' as const, damage: 10, speed: 500, size: 6, aoeRadius: 0, count: 1, spreadDeg: 0, pierce: 0,
      homing: 0, chain: 0, statuses: [], sourceUid: 'a', runeName: 'A',
    }],
  };

  it('overcast fires an extra cast and slows only the next charge', () => {
    const w = newWorld(100);
    const c = createCaster(plan);
    const ab = createAbility('overcast');
    expect(ab.ready).toBe(true);
    expect(ab.use(w, c, { x: 500, y: 300 })).toBe(true);
    expect(c.castTime).toBe(2);
    expect(ab.ready).toBe(false);
    c.update(w, 0.01, () => ({ x: 500, y: 300 }), null);
    expect(w.pprojs.length).toBe(1);
    c.charge = c.castTime;
    c.update(w, 0.01, () => ({ x: 500, y: 300 }), null);
    expect(c.castTime).toBe(1);
  });

  it('detonate does nothing (and keeps its cooldown) with no statuses', () => {
    const w = newWorld(100);
    spawnEnemy(w, 'grunt', 1, { x: 400, y: 300 });
    const ab = createAbility('detonate');
    expect(ab.use(w, createCaster(plan), null)).toBe(false);
    expect(ab.ready).toBe(true);
  });

  it('detonate consumes statuses and damages without reactions', () => {
    const w = newWorld(100);
    const e = spawnEnemy(w, 'brute', 1, { x: 400, y: 300 });
    e.st.burn = { dps: 5, t: 3 };
    e.st.wet = { p: 0.5, t: 3 };
    const ab = createAbility('detonate');
    expect(ab.use(w, createCaster(plan), null)).toBe(true);
    expect(e.st.burn).toBeNull();
    expect(e.st.wet).toBeNull();
    expect(e.hp).toBeLessThan(e.maxHp);
    expect(w.reactions).toBe(0);
    expect(ab.left).toBe(22);
  });

  it('ward pulse slows, knocks back and clears enemy shots', () => {
    const w = newWorld(100);
    const e = spawnEnemy(w, 'grunt', 1, { x: 280, y: 300 });
    const far = spawnEnemy(w, 'grunt', 1, { x: 700, y: 300 });
    w.eprojs.push({ x: 200, y: 300, vx: 0, vy: 0, r: 4, dmg: 5, color: '#fff', dead: false });
    createAbility('ward_pulse').use(w, createCaster(plan), null);
    updateEnemies(w, 1, 1);
    expect(e.st.slow?.p).toBe(0.5);
    expect(far.st.slow).toBeNull();
    expect(e.x).toBeGreaterThan(400);
    expect(w.eprojs[0].dead).toBe(true);
  });
});

describe('directions', () => {
  it('top / bottom spawns enter off-screen at x 350..900', () => {
    const w = newWorld(100);
    for (let i = 0; i < 20; i++) {
      const t = spawnEnemy(w, 'grunt', 1, undefined, { from: 'top' });
      const b = spawnEnemy(w, 'grunt', 1, undefined, { from: 'bottom' });
      expect(t.y).toBeLessThan(0);
      expect(b.y).toBeGreaterThan(600);
      expect(t.x).toBeGreaterThanOrEqual(350);
      expect(b.x).toBeLessThanOrEqual(900);
    }
  });
  it('ranged enemies stop at their distance from the ward from any edge', () => {
    const w = newWorld(100);
    const a = spawnEnemy(w, 'archer', 1, { x: 900, y: -20 });
    for (let i = 0; i < 400; i++) updateEnemies(w, 0.1, 1);
    const d = Math.hypot(a.x - 80, a.y - 300);
    expect(d).toBeCloseTo(ENEMY_CFG.archer.ranged!.stopX - 80, 0);
  });
});
