import { describe, expect, it } from 'vitest';
import {
  breaksShell, defenseMul, elementMul, fogAlpha, fogVisible, hazardSlowMul, hydraStage, isBoss, reflectDamage,
  regenAmount, splitsInto, stompHitsWard, traitBlocksBurn, traitSpeedMul,
} from './rules';
import { ENEMY_CFG, newWorld } from './model';
import { blockHit, damageEnemy, enemyVisible, spawnEnemy, sweepDead, updateEnemies } from './enemies';
import { applyStatus } from './status';
import type { ReactionKind } from '../types';

const none = { frozen: false, weakened: false, shellBroken: 0 };

describe('defense rules', () => {
  it('armored takes 40% unless frozen or weakened', () => {
    expect(defenseMul('armored', none)).toBeCloseTo(0.4);
    expect(defenseMul('armored', { ...none, frozen: true })).toBe(1);
    expect(defenseMul('armored', { ...none, weakened: true })).toBe(1);
  });
  it('golem shell takes 25% until broken', () => {
    expect(defenseMul('boss_golem', none)).toBeCloseTo(0.25);
    expect(defenseMul('boss_golem', { ...none, shellBroken: 3 })).toBe(1);
  });
  it('others have no innate defense', () => {
    expect(defenseMul('grunt', none)).toBe(1);
  });
  it('only shatter, combust and overload break the shell', () => {
    const yes: ReactionKind[] = ['shatter', 'combust', 'overload'];
    expect(yes.every(k => breaksShell(k))).toBe(true);
    expect(breaksShell('melt')).toBe(false);
    expect(breaksShell('unravel')).toBe(false);
  });
});

describe('splits and bosses', () => {
  it('splitter splits into 3 splitlings, splitling does not split', () => {
    expect(splitsInto('splitter')).toEqual({ kind: 'splitling', count: 3 });
    expect(splitsInto('splitling')).toBeNull();
  });
  it('hydra stages at 66% and 33%', () => {
    expect(hydraStage(1)).toBe(0);
    expect(hydraStage(0.67)).toBe(0);
    expect(hydraStage(0.66)).toBe(1);
    expect(hydraStage(0.4)).toBe(1);
    expect(hydraStage(0.33)).toBe(2);
    expect(hydraStage(0.01)).toBe(2);
  });
  it('knows the three bosses', () => {
    expect(isBoss('boss_lich') && isBoss('boss_golem') && isBoss('boss_hydra')).toBe(true);
    expect(isBoss('elite_knight')).toBe(false);
    expect(isBoss('hydra_head')).toBe(false);
  });
  it('stomp reaches the ward only within 350', () => {
    expect(stompHitsWard(380, 300, 80, 300)).toBe(true);
    expect(stompHitsWard(500, 300, 80, 300)).toBe(false);
  });
});

describe('elite traits', () => {
  it('hasted is +40% speed', () => {
    expect(traitSpeedMul('hasted')).toBe(1.4);
    expect(traitSpeedMul(undefined)).toBe(1);
  });
  it('reflect is 15% capped at 5', () => {
    expect(reflectDamage(20)).toBeCloseTo(3);
    expect(reflectDamage(1000)).toBe(5);
  });
  it('regen is 2% max HP/s only after 2 s unhit', () => {
    expect(regenAmount(600, 1, 1.5)).toBe(0);
    expect(regenAmount(600, 0.5, 2.5)).toBeCloseTo(6);
  });
  it('burn-immune halves fire and blocks burn', () => {
    expect(traitBlocksBurn('burn_immune')).toBe(true);
    expect(elementMul('fire', undefined, 'burn_immune')).toBe(0.5);
    expect(elementMul('frost', undefined, 'burn_immune')).toBe(1);
  });
});

describe('hazards', () => {
  it('rain cuts fire 25%, stacking with burn-immune', () => {
    expect(elementMul('fire', 'rain', undefined)).toBe(0.75);
    expect(elementMul('fire', 'rain', 'burn_immune')).toBeCloseTo(0.375);
    expect(elementMul('frost', 'rain', undefined)).toBe(1);
  });
  it('heatwave halves slows', () => {
    expect(hazardSlowMul('heatwave')).toBe(0.5);
    expect(hazardSlowMul('rain')).toBe(1);
  });
  it('fog hides distant enemies unless hit within 0.6 s', () => {
    expect(fogVisible(600, 99)).toBe(true);
    expect(fogVisible(651, 99)).toBe(false);
    expect(fogVisible(800, 0.3)).toBe(true);
    expect(fogVisible(800, 0.6)).toBe(false);
    expect(fogAlpha(800, 0)).toBe(1);
  });
});

describe('enemies in a world', () => {
  const world = (rules: Parameters<typeof newWorld>[3] = {}) => newWorld(100, undefined, [], rules);

  it('shield absorbs exactly one hit, then regrows after 4 s without a hit', () => {
    const w = world();
    const e = spawnEnemy(w, 'shield_bearer', 1, { x: 400, y: 300 });
    expect(blockHit(w, e)).toBe(true);
    expect(blockHit(w, e)).toBe(false);
    w.time = 1;
    updateEnemies(w, 0.05, 1);
    expect(e.shield).toBe(false);
    w.time = 4.2;
    updateEnemies(w, 0.05, 1);
    expect(e.shield).toBe(true);
  });

  it('damage over time ignores the shield', () => {
    const w = world();
    const e = spawnEnemy(w, 'shield_bearer', 1, { x: 400, y: 300 });
    applyStatus(e, { kind: 'burn', potency: 10, duration: 3 });
    updateEnemies(w, 0.5, 1);
    expect(e.shield).toBe(true);
    expect(e.hp).toBeLessThan(e.maxHp);
  });

  it('a splitter spawns 3 splitlings on death, splitlings spawn nothing', () => {
    const w = world();
    const e = spawnEnemy(w, 'splitter', 1, { x: 400, y: 300 });
    damageEnemy(w, e, 9999, 'pure');
    sweepDead(w);
    expect(w.enemies.map(x => x.kind)).toEqual(['splitling', 'splitling', 'splitling']);
    damageEnemy(w, w.enemies[0], 9999, 'pure');
    sweepDead(w);
    expect(w.enemies.length).toBe(2);
  });

  it('armored takes 40% damage, full when frozen', () => {
    const w = world();
    const e = spawnEnemy(w, 'armored', 1, { x: 400, y: 300 });
    expect(damageEnemy(w, e, 100, 'pure')).toBeCloseTo(40);
    e.st.freeze = 2;
    expect(damageEnemy(w, e, 100, 'pure')).toBeCloseTo(100);
  });

  it('golem shell reduces damage by 75% until broken', () => {
    const w = world();
    const e = spawnEnemy(w, 'boss_golem', 1, { x: 600, y: 300 });
    expect(damageEnemy(w, e, 100, 'pure')).toBeCloseTo(25);
    e.shellBroken = 6;
    expect(damageEnemy(w, e, 100, 'pure')).toBeCloseTo(100);
  });

  it('rain keeps enemies wet and cuts fire damage', () => {
    const w = world({ hazard: 'rain' });
    const e = spawnEnemy(w, 'grunt', 1, { x: 400, y: 300 });
    updateEnemies(w, 0.05, 1);
    expect(e.st.wet).not.toBeNull();
    expect(damageEnemy(w, e, 20, 'fire')).toBeCloseTo(15);
  });

  it('heatwave ignites everyone every 5 s', () => {
    const w = world({ hazard: 'heatwave' });
    const e = spawnEnemy(w, 'grunt', 1, { x: 400, y: 300 });
    updateEnemies(w, 4.9, 1);
    expect(e.st.burn).toBeNull();
    updateEnemies(w, 0.2, 1);
    expect(e.st.burn?.dps).toBe(3);
  });

  it('fog hides far enemies until hit', () => {
    const w = world({ hazard: 'fog' });
    const far = spawnEnemy(w, 'grunt', 1, { x: 800, y: 300 });
    const near = spawnEnemy(w, 'grunt', 1, { x: 300, y: 300 });
    expect(enemyVisible(w, far)).toBe(false);
    expect(enemyVisible(w, near)).toBe(true);
    damageEnemy(w, far, 1, 'pure');
    expect(enemyVisible(w, far)).toBe(true);
  });

  it('elite traits: burn-immune ignores burn, reflective hurts the ward', () => {
    const imm = world({ eliteTrait: 'burn_immune' });
    const k = spawnEnemy(imm, 'elite_knight', 1, { x: 400, y: 300 });
    applyStatus(k, { kind: 'burn', potency: 10, duration: 3 });
    expect(k.st.burn).toBeNull();

    const ref = world({ eliteTrait: 'reflective' });
    const r = spawnEnemy(ref, 'elite_knight', 1, { x: 400, y: 300 });
    damageEnemy(ref, r, 20, 'pure');
    expect(ref.wardHp).toBeLessThan(100);
    expect(ref.wardHp).toBeGreaterThanOrEqual(95);
    expect(spawnEnemy(world(), 'elite_knight', 1).trait).toBeUndefined();
  });

  it('hydra grows 2 heads at 66% and 33%, heads have 15% of boss HP', () => {
    const w = world();
    const h = spawnEnemy(w, 'boss_hydra', 1, { x: 700, y: 300 });
    damageEnemy(w, h, h.maxHp * 0.35, 'pure');
    updateEnemies(w, 0.01, 1);
    const heads = w.enemies.filter(e => e.kind === 'hydra_head');
    expect(heads.length).toBe(2);
    expect(heads[0].maxHp).toBe(Math.round(h.maxHp * 0.15));
    damageEnemy(w, h, h.maxHp * 0.35, 'pure');
    updateEnemies(w, 0.01, 1);
    expect(w.enemies.filter(e => e.kind === 'hydra_head' && !e.dead).length).toBe(4);
  });

  it('attributes damage and DoT to the rune that applied it', () => {
    const w = world();
    const e = spawnEnemy(w, 'brute', 1, { x: 400, y: 300 });
    damageEnemy(w, e, 10, 'pure', false, { src: 'a' });
    applyStatus(e, { kind: 'burn', potency: 10, duration: 3 }, { src: 'b' });
    updateEnemies(w, 1, 1);
    expect(w.runeDamage.a).toBe(10);
    expect(w.runeDamage.b).toBeGreaterThan(5);
  });

  it('config sanity', () => {
    expect(ENEMY_CFG.swarmer.hp).toBe(12);
    expect(ENEMY_CFG.dummy.speed).toBe(0);
  });
});
