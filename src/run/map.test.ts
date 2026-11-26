import { describe, expect, it } from 'vitest';
import { MAP_ROWS, findNode, generateMap, isValidMap, reachable } from './map';

describe('generateMap', () => {
  it('has six rows per act map', () => {
    expect(MAP_ROWS).toBe(6);
    for (const act of [1, 2, 3]) expect(generateMap(1, act).rows).toHaveLength(6);
  });

  it('is deterministic for a seed and act, and differs between acts and seeds', () => {
    for (let s = 0; s < 20; s++) for (const a of [1, 2, 3]) expect(generateMap(s, a)).toEqual(generateMap(s, a));
    expect(generateMap(1)).not.toEqual(generateMap(2));
    expect(generateMap(1, 1)).not.toEqual(generateMap(1, 2));
    // ids carry the act so seeded offers differ between acts
    expect(generateMap(1, 2).rows[0][0].id).toBe('a2r1c0');
  });

  it('keeps the row structure invariants over many seeds and acts', () => {
    for (let s = 0; s < 400; s++) {
      for (const act of [1, 2, 3]) {
        const { rows } = generateMap(s * 7919 + 3, act);
        expect(rows).toHaveLength(MAP_ROWS);
        expect(rows[0].map((n) => n.kind)).toEqual(['battle', 'battle', 'battle']);
        expect(rows[5].map((n) => n.kind)).toEqual(['boss']);
        expect(rows[4].length).toBeGreaterThanOrEqual(2);
        expect(rows[4].length).toBeLessThanOrEqual(3);
        for (const n of rows[4]) expect(['shop', 'forge', 'shrine', 'rest']).toContain(n.kind);
        for (let r = 1; r <= 3; r++) {
          const row = rows[r];
          expect(row.length).toBeGreaterThanOrEqual(2);
          expect(row.length).toBeLessThanOrEqual(4);
          expect(row.some((n) => n.kind === 'battle')).toBe(true);
          for (const n of row) {
            if (n.kind === 'elite') expect(r + 1).toBeGreaterThanOrEqual(3);
            expect(['battle', 'elite', 'shop', 'forge', 'shrine', 'event', 'treasure', 'rest']).toContain(n.kind);
          }
        }
        // at least one elite on row 3 or 4
        expect([...rows[2], ...rows[3]].some((n) => n.kind === 'elite')).toBe(true);
        expect(rows[1].some((n) => n.kind === 'elite')).toBe(false);
        rows.forEach((row, ri) => row.forEach((n, ci) => {
          expect(n.row).toBe(ri + 1);
          expect(n.col).toBe(ci);
          expect(n.id).toBe(`a${act}r${ri + 1}c${ci}`);
        }));
      }
    }
  });

  it('uses the new node kinds, with treasure and rest from row 2', () => {
    const seen: Record<string, number> = {};
    const row1: Record<string, number> = {};
    for (let s = 0; s < 300; s++) {
      for (const row of generateMap(s).rows) for (const n of row) {
        seen[n.kind] = (seen[n.kind] ?? 0) + 1;
        if (n.row < 2) row1[n.kind] = (row1[n.kind] ?? 0) + 1;
      }
    }
    for (const k of ['event', 'treasure', 'rest']) expect(seen[k]).toBeGreaterThan(0);
    expect(Object.keys(row1)).toEqual(['battle']);
    expect([...Array(300).keys()].some((s) => generateMap(s).rows[1].some((n) => n.kind === 'treasure' || n.kind === 'rest'))).toBe(true);
    expect([...Array(300).keys()].some((s) => generateMap(s).rows[4].some((n) => n.kind === 'rest'))).toBe(true);
  });

  it('has non-crossing edges, 1-2 exits per node, and no dead ends or orphans', () => {
    for (let s = 0; s < 400; s++) {
      for (const act of [1, 2, 3]) {
        const map = generateMap(s, act);
        expect(isValidMap(map)).toBe(true);
        const incoming = new Set<string>();
        for (let r = 0; r < MAP_ROWS; r++) {
          const edges: [number, number][] = [];
          for (const n of map.rows[r]) {
            if (r < MAP_ROWS - 1) {
              expect(n.next.length).toBeGreaterThanOrEqual(1);
              expect(n.next.length).toBeLessThanOrEqual(2);
            } else expect(n.next).toEqual([]);
            for (const id of n.next) {
              const t = findNode(map, id)!;
              expect(t.row).toBe(n.row + 1);
              incoming.add(id);
              edges.push([n.col, t.col]);
            }
          }
          for (const [a1, b1] of edges) for (const [a2, b2] of edges) {
            expect((a1 - a2) * (b1 - b2) >= 0).toBe(true); // no crossing
          }
          if (r > 0) for (const n of map.rows[r]) expect(incoming.has(n.id)).toBe(true);
        }
      }
    }
  });

  it('rejects the old 10-row map shape', () => {
    const old = { rows: Array.from({ length: 10 }, (_, r) => [{ id: `r${r + 1}c0`, row: r + 1, col: 0, kind: 'battle', next: r < 9 ? [`r${r + 2}c0`] : [] }]) };
    expect(isValidMap(old)).toBe(false);
  });

  it('reachable() starts at row 1 and follows edges', () => {
    const map = generateMap(5);
    expect(reachable(map, null)).toEqual(map.rows[0]);
    const n = map.rows[0][0];
    expect(reachable(map, n.id).map((x) => x.id)).toEqual(n.next);
  });
});
