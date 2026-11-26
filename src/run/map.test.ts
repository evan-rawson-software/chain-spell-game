import { describe, expect, it } from 'vitest';
import { MAP_ROWS, findNode, generateMap, isValidMap, reachable } from './map';

describe('generateMap', () => {
  it('is deterministic for a seed', () => {
    for (let s = 0; s < 20; s++) expect(generateMap(s)).toEqual(generateMap(s));
    expect(generateMap(1)).not.toEqual(generateMap(2));
  });

  it('keeps the row structure invariants over many seeds', () => {
    for (let s = 0; s < 500; s++) {
      const { rows } = generateMap(s * 7919 + 3);
      expect(rows).toHaveLength(MAP_ROWS);
      expect(rows[0].map((n) => n.kind)).toEqual(['battle', 'battle', 'battle']);
      expect(rows[9].map((n) => n.kind)).toEqual(['boss']);
      expect(rows[8].length).toBeGreaterThanOrEqual(2);
      expect(rows[8].length).toBeLessThanOrEqual(3);
      for (const n of rows[8]) expect(['shop', 'forge', 'shrine']).toContain(n.kind);
      for (let r = 1; r <= 7; r++) {
        const row = rows[r];
        expect(row.length).toBeGreaterThanOrEqual(2);
        expect(row.length).toBeLessThanOrEqual(4);
        expect(row.some((n) => n.kind === 'battle')).toBe(true);
        for (const n of row) {
          if (n.kind === 'elite') expect(r + 1).toBeGreaterThanOrEqual(4);
          expect(['battle', 'elite', 'shop', 'forge', 'shrine']).toContain(n.kind);
        }
      }
      rows.forEach((row, ri) => row.forEach((n, ci) => {
        expect(n.row).toBe(ri + 1);
        expect(n.col).toBe(ci);
        expect(n.id).toBe(`r${ri + 1}c${ci}`);
      }));
    }
  });

  it('has non-crossing edges, 1-2 exits per node, and no dead ends or orphans', () => {
    for (let s = 0; s < 500; s++) {
      const map = generateMap(s);
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
  });

  it('reachable() starts at row 1 and follows edges', () => {
    const map = generateMap(5);
    expect(reachable(map, null)).toEqual(map.rows[0]);
    const n = map.rows[0][0];
    expect(reachable(map, n.id).map((x) => x.id)).toEqual(n.next);
  });
});
