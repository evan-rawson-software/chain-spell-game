import { describe, expect, it } from 'vitest';
import { BOSSES, FEATURE_UNLOCK, bossFor, floorDef, nodePreview } from './floors';

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `r${3 + (i % 8)}c${i}`);

describe('floorDef / nodePreview', () => {
  it('is deterministic from seed and node id', () => {
    for (let s = 0; s < 30; s++) {
      for (const id of ['r2c0', 'r5c1', 'r7c2']) {
        expect(floorDef(7, 'elite', id, s)).toEqual(floorDef(7, 'elite', id, s));
        expect(nodePreview(7, 'battle', id, s)).toEqual(nodePreview(7, 'battle', id, s));
      }
    }
    const a = Array.from({ length: 40 }, (_, s) => JSON.stringify(nodePreview(6, 'battle', 'r6c0', s)));
    expect(new Set(a).size).toBeGreaterThan(3);
  });

  it('without a node it is the plain base floor', () => {
    const f = floorDef(5, 'elite');
    expect(f.hazard).toBeUndefined();
    expect(f.eliteTrait).toBeUndefined();
    expect(floorDef(10, 'boss').waves.flatMap((w) => w.groups).some((x) => x.kind === 'boss_lich')).toBe(true);
  });

  it('unlocks featured enemies by row', () => {
    for (let s = 0; s < 200; s++) {
      for (let row = 1; row <= 9; row++) {
        const p = nodePreview(row, 'battle', `r${row}c${s % 3}`, s);
        if (row === 1) expect(p.featured).toBeUndefined();
        if (p.featured) expect(row).toBeGreaterThanOrEqual(FEATURE_UNLOCK[p.featured]!);
        if (p.featured === 'swarmer') expect(p.swarm! >= 8 && p.swarm! <= 12).toBe(true);
      }
    }
    const seen = new Set<string>();
    for (let s = 0; s < 200; s++) { const f = nodePreview(5, 'battle', 'r5c0', s).featured; if (f) seen.add(f); }
    expect([...seen].sort()).toEqual(['armored', 'cleanser', 'shield_bearer', 'splitter', 'swarmer']);
    const early = new Set<string>();
    for (let s = 0; s < 200; s++) { const f = nodePreview(2, 'battle', 'r2c0', s).featured; if (f) early.add(f); }
    expect([...early].sort()).toEqual(['shield_bearer', 'swarmer']);
  });

  it('puts the featured enemy into the floor waves', () => {
    for (let s = 0; s < 60; s++) {
      const p = nodePreview(5, 'battle', 'r5c1', s);
      const f = floorDef(5, 'battle', 'r5c1', s);
      const kinds = f.waves.flatMap((w) => w.groups.map((x) => x.kind));
      expect(kinds).toContain(p.featured);
      if (p.featured === 'swarmer') {
        const sw = f.waves.flatMap((w) => w.groups).find((x) => x.kind === 'swarmer')!;
        expect(sw.count).toBe(p.swarm);
      }
    }
  });

  it('rolls hazards from row 3 at about 30% of battle/elite nodes', () => {
    let hits = 0;
    const list = ids(2000);
    list.forEach((id, i) => { if (nodePreview(5, 'battle', id, i).hazard) hits++; });
    expect(hits / list.length).toBeGreaterThan(0.24);
    expect(hits / list.length).toBeLessThan(0.36);
    for (let s = 0; s < 300; s++) for (const row of [1, 2]) expect(nodePreview(row, 'battle', `r${row}c0`, s).hazard).toBeUndefined();
    expect(nodePreview(5, 'shop', 'r5c0', 1)).toEqual({});
  });

  it('gives every elite a trait, and normal battles none', () => {
    for (let s = 0; s < 100; s++) {
      expect(floorDef(5, 'elite', 'r5c0', s).eliteTrait).toBeTruthy();
      expect(floorDef(5, 'battle', 'r5c0', s).eliteTrait).toBeUndefined();
    }
  });

  it('picks the boss from the seed and builds matching boss waves', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 100; s++) {
      const boss = bossFor(s);
      seen.add(boss);
      expect(BOSSES).toContain(boss);
      expect(nodePreview(10, 'boss', 'r10c0', s)).toEqual({ boss });
      const f = floorDef(10, 'boss', 'r10c0', s);
      expect(f.kind).toBe('boss');
      const kinds = f.waves.flatMap((w) => w.groups.map((x) => x.kind));
      expect(kinds.filter((k) => (BOSSES as string[]).includes(k))).toEqual([boss]);
      expect(f.hazard).toBeUndefined();
    }
    expect(seen.size).toBe(3);
  });
});
