import { describe, expect, it } from 'vitest';
import { BOSSES, FEATURE_UNLOCK, FLOOR_COUNT, bossFor, bossOrder, depthOf, floorDef, nodePreview, waveTable } from './floors';

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `a1r${3 + (i % 3)}c${i}`);

describe('depth and difficulty', () => {
  it('maps act and row to depth 1..18', () => {
    expect(depthOf(1, 1)).toBe(1);
    expect(depthOf(1, 6)).toBe(6);
    expect(depthOf(2, 1)).toBe(7);
    expect(depthOf(3, 6)).toBe(18);
    expect(FLOOR_COUNT).toBe(18);
  });

  it('stretches the wave tables: more enemies and HP as depth grows, floor = depth', () => {
    let prevHp = 0;
    for (let d = 1; d <= 17; d++) {
      const act = Math.ceil(d / 6);
      const row = d - (act - 1) * 6;
      if (row === 6) continue;
      const f = floorDef(row, 'battle', undefined, undefined, act);
      expect(f.floor).toBe(d);
      expect(f.act).toBe(act);
      expect(f.hpScale).toBeGreaterThan(prevHp);
      prevHp = f.hpScale;
    }
    expect(floorDef(1).hpScale).toBe(1);
    expect(floorDef(6, 'boss', undefined, undefined, 3).hpScale).toBeCloseTo(2.7);
    const total = (d: number): number => waveTable(d).flatMap((w) => w.groups).reduce((a, g) => a + g.count, 0);
    expect(total(17)).toBeGreaterThan(total(1) * 1.8);
    expect(total(2)).toBeGreaterThanOrEqual(total(1));
    expect(total(3)).toBeGreaterThan(total(1));
  });

  it('sends groups from top/bottom only in acts 2 and 3, more in act 3, never the boss', () => {
    const count = (act: number): { from: number; all: number } => {
      let from = 0;
      let all = 0;
      for (let s = 0; s < 200; s++) {
        for (const row of [1, 2, 3, 4, 5, 6]) {
          const f = floorDef(row, row === 6 ? 'boss' : 'battle', `a${act}r${row}c0`, s, act);
          for (const g of f.waves.flatMap((w) => w.groups)) {
            all++;
            if (g.from) {
              from++;
              expect(['top', 'bottom']).toContain(g.from);
              expect((BOSSES as string[]).includes(g.kind)).toBe(false);
            }
          }
        }
      }
      return { from, all };
    };
    expect(count(1).from).toBe(0);
    const a2 = count(2);
    const a3 = count(3);
    expect(a2.from / a2.all).toBeGreaterThan(0.15);
    expect(a3.from / a3.all).toBeGreaterThan(a2.from / a2.all);
  });
});

describe('floorDef / nodePreview', () => {
  it('is deterministic from seed, node id and act', () => {
    for (let s = 0; s < 30; s++) {
      for (const [row, id, act] of [[2, 'a1r2c0', 1], [4, 'a2r4c1', 2], [3, 'a3r3c2', 3]] as const) {
        expect(floorDef(row, 'elite', id, s, act)).toEqual(floorDef(row, 'elite', id, s, act));
        expect(nodePreview(row, 'battle', id, s, act)).toEqual(nodePreview(row, 'battle', id, s, act));
      }
    }
    const a = Array.from({ length: 40 }, (_, s) => JSON.stringify(nodePreview(4, 'battle', 'a1r4c0', s)));
    expect(new Set(a).size).toBeGreaterThan(3);
  });

  it('without a node it is the plain base floor', () => {
    const f = floorDef(3, 'elite');
    expect(f.hazard).toBeUndefined();
    expect(f.eliteTrait).toBeUndefined();
    expect(floorDef(6, 'boss').waves.flatMap((w) => w.groups).some((x) => x.kind === 'boss_lich')).toBe(true);
  });

  it('unlocks featured enemies by depth', () => {
    for (let s = 0; s < 200; s++) {
      for (let act = 1; act <= 3; act++) {
        for (let row = 1; row <= 5; row++) {
          const p = nodePreview(row, 'battle', `a${act}r${row}c${s % 3}`, s, act);
          const d = depthOf(act, row);
          if (d === 1) expect(p.featured).toBeUndefined();
          if (p.featured) expect(d).toBeGreaterThanOrEqual(FEATURE_UNLOCK[p.featured]!);
          if (p.featured === 'swarmer') expect(p.swarm! >= 8 && p.swarm! <= 12).toBe(true);
        }
      }
    }
    const seen = new Set<string>();
    for (let s = 0; s < 300; s++) { const f = nodePreview(5, 'battle', 'a2r5c0', s, 2).featured; if (f) seen.add(f); }
    expect([...seen].sort()).toEqual(['armored', 'cleanser', 'shield_bearer', 'splitter', 'swarmer']);
    const early = new Set<string>();
    for (let s = 0; s < 200; s++) { const f = nodePreview(2, 'battle', 'a1r2c0', s, 1).featured; if (f) early.add(f); }
    expect([...early]).toEqual(['shield_bearer']);
  });

  it('puts the featured enemy into the floor waves', () => {
    for (let s = 0; s < 60; s++) {
      const p = nodePreview(5, 'battle', 'a2r5c1', s, 2);
      const f = floorDef(5, 'battle', 'a2r5c1', s, 2);
      const kinds = f.waves.flatMap((w) => w.groups.map((x) => x.kind));
      expect(kinds).toContain(p.featured);
      if (p.featured === 'swarmer') {
        const sw = f.waves.flatMap((w) => w.groups).find((x) => x.kind === 'swarmer')!;
        expect(sw.count).toBe(p.swarm);
      }
    }
  });

  it('rolls hazards from depth 3 at about 30% of battle/elite nodes', () => {
    let hits = 0;
    const list = ids(2000);
    list.forEach((id, i) => { if (nodePreview(4, 'battle', id, i).hazard) hits++; });
    expect(hits / list.length).toBeGreaterThan(0.24);
    expect(hits / list.length).toBeLessThan(0.36);
    for (let s = 0; s < 300; s++) for (const row of [1, 2]) expect(nodePreview(row, 'battle', `a1r${row}c0`, s).hazard).toBeUndefined();
    expect(nodePreview(5, 'shop', 'a1r5c0', 1)).toEqual({});
  });

  it('gives every elite a trait, and normal battles none', () => {
    for (let s = 0; s < 100; s++) {
      expect(floorDef(3, 'elite', 'a1r3c0', s).eliteTrait).toBeTruthy();
      expect(floorDef(3, 'battle', 'a1r3c0', s).eliteTrait).toBeUndefined();
    }
  });

  it('orders the three bosses by seed, one per act, and builds matching boss waves', () => {
    const orders = new Set<string>();
    for (let s = 0; s < 200; s++) {
      const order = bossOrder(s);
      orders.add(order.join());
      expect([...order].sort()).toEqual([...BOSSES].sort());
      for (let act = 1; act <= 3; act++) {
        const boss = bossFor(s, act);
        expect(boss).toBe(order[act - 1]);
        expect(nodePreview(6, 'boss', `a${act}r6c0`, s, act)).toEqual({ boss });
        const f = floorDef(6, 'boss', `a${act}r6c0`, s, act);
        expect(f.kind).toBe('boss');
        expect(f.act).toBe(act);
        const kinds = f.waves.flatMap((w) => w.groups.map((x) => x.kind));
        expect(kinds.filter((k) => (BOSSES as string[]).includes(k))).toEqual([boss]);
        expect(f.hazard).toBeUndefined();
      }
    }
    expect(orders.size).toBe(6);
  });
});
