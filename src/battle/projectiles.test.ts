import { describe, expect, it } from 'vitest';
import { newWorld, type World } from './model';
import { spawnEnemy, updateEnemies } from './enemies';
import { fireShot, updatePlayerProjectiles } from './projectiles';
import { applyStatus } from './status';
import type { Element, ResolvedShot } from '../types';

function shot(p: Partial<ResolvedShot> & { element: Element; sourceUid: string }): ResolvedShot {
  return {
    runeName: p.sourceUid, damage: 20, speed: 600, size: 6, aoeRadius: 0, count: 1, spreadDeg: 0, pierce: 0,
    homing: 0, chain: 0, statuses: [], ...p,
  };
}

function run(w: World, sec: number): void {
  for (let t = 0; t < sec; t += 0.02) {
    w.time += 0.02;
    updateEnemies(w, 0.02, 1);
    updatePlayerProjectiles(w, 0.02);
  }
}

describe('shots through the pipeline', () => {
  it('a shield bearer blocks the first hit entirely, takes the second', () => {
    const w = newWorld(100);
    const e = spawnEnemy(w, 'shield_bearer', 1, { x: 400, y: 300 });
    e.cfg = { ...e.cfg, melee: undefined };
    fireShot(w, shot({ element: 'pure', sourceUid: 'a', damage: 30 }), 400, 300);
    run(w, 1);
    expect(e.hp).toBe(e.maxHp);
    expect(e.shield).toBe(false);
    fireShot(w, shot({ element: 'pure', sourceUid: 'a', damage: 30 }), 400, 300);
    run(w, 1);
    expect(e.hp).toBe(e.maxHp - 30);
    expect(w.runeDamage.a).toBe(30);
  });

  it('a blocked hit applies no statuses', () => {
    const w = newWorld(100);
    const e = spawnEnemy(w, 'shield_bearer', 1, { x: 400, y: 300 });
    fireShot(w, shot({ element: 'fire', sourceUid: 'a', statuses: [{ kind: 'burn', potency: 5, duration: 3 }] }), 400, 300);
    run(w, 0.8);
    expect(e.st.burn).toBeNull();
  });

  it('counts reactions and attributes their damage to the shot', () => {
    const w = newWorld(100);
    const e = spawnEnemy(w, 'brute', 1, { x: 400, y: 300 });
    e.st.freeze = 5;
    fireShot(w, shot({ element: 'fire', sourceUid: 'fb', damage: 40 }), 400, 300);
    run(w, 1);
    expect(w.reactionCounts.shatter).toBe(1);
    expect(w.reactions).toBe(1);
    // shatter doubles: 40 * 2 = 80
    expect(w.runeDamage.fb).toBeCloseTo(80);
  });

  it('a Shatter on the golem breaks its shell', () => {
    const w = newWorld(100);
    const g = spawnEnemy(w, 'boss_golem', 1, { x: 400, y: 300 });
    g.st.freeze = 5;
    fireShot(w, shot({ element: 'fire', sourceUid: 'fb', damage: 40 }), 400, 300);
    run(w, 1);
    expect(g.shellBroken).toBeGreaterThan(5);
    expect(g.shellBroken).toBeLessThanOrEqual(6);
  });

  it('a Melt does not break the golem shell', () => {
    const w = newWorld(100);
    const g = spawnEnemy(w, 'boss_golem', 1, { x: 400, y: 300 });
    applyStatus(g, { kind: 'slow', potency: 0.3, duration: 5 });
    fireShot(w, shot({ element: 'fire', sourceUid: 'fb', damage: 40 }), 400, 300);
    run(w, 1);
    expect(w.reactionCounts.melt).toBe(1);
    expect(g.shellBroken).toBe(0);
  });

  it('DoT from a shot is credited to that shot', () => {
    const w = newWorld(100);
    const e = spawnEnemy(w, 'brute', 1, { x: 400, y: 300 });
    fireShot(w, shot({ element: 'fire', sourceUid: 'fb', damage: 10, statuses: [{ kind: 'burn', potency: 20, duration: 2 }] }), 400, 300);
    run(w, 3);
    expect(w.runeDamage.fb).toBeGreaterThan(40);
    expect(e.hp).toBeLessThan(e.maxHp - 40);
  });

  it('heatwave halves slow potency from shots', () => {
    const w = newWorld(100, undefined, [], { hazard: 'heatwave' });
    const e = spawnEnemy(w, 'brute', 1, { x: 400, y: 300 });
    fireShot(w, shot({ element: 'frost', sourceUid: 'fb', statuses: [{ kind: 'slow', potency: 0.4, duration: 3 }] }), 400, 300);
    run(w, 0.8);
    expect(e.st.slow?.p).toBeCloseTo(0.2);
  });
});

describe('shot speed cap', () => {
  it('fireShot uses the capped speed for velocity but the shot keeps its own', () => {
    const w = newWorld(100);
    const s = shot({ element: 'fire', sourceUid: 'a', speed: 800 });
    fireShot(w, s, 80 + 100, 300, 1, 300);
    const p = w.pprojs[0];
    expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(300, 5);
    expect(p.shot.speed).toBe(800);
  });
});
