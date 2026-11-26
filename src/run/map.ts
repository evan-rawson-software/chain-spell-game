import type { MapNode, MapNodeKind, RunMap } from '../types';
import { createRng, type Rng } from './rng';

export const MAP_ROWS = 10;

const KIND_WEIGHTS: [MapNodeKind, number][] = [['battle', 50], ['elite', 12], ['shop', 13], ['forge', 12], ['shrine', 13]];
const REST_KINDS: MapNodeKind[] = ['shop', 'forge', 'shrine'];

export const nodeId = (row: number, col: number): string => `r${row}c${col}`;

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rowKinds(row: number, rng: Rng): MapNodeKind[] {
  if (row === 1) return ['battle', 'battle', 'battle'];
  if (row === MAP_ROWS) return ['boss'];
  if (row === MAP_ROWS - 1) {
    const n = 2 + rng.int(2);
    return Array.from({ length: n }, () => rng.pick(REST_KINDS));
  }
  const n = 2 + rng.int(3);
  const pool = KIND_WEIGHTS.filter(([k]) => k !== 'elite' || row >= 4);
  const kinds = Array.from({ length: n }, () => rng.weighted(pool, ([, w]) => w)[0]);
  if (!kinds.includes('battle')) kinds[rng.int(n)] = 'battle';
  // Every map has at least one elite (row 5), without removing the row's only battle.
  if (row === 5 && !kinds.includes('elite')) {
    const battles = kinds.filter((k) => k === 'battle').length;
    const spots = kinds.map((k, i) => (k === 'battle' && battles === 1 ? -1 : i)).filter((i) => i >= 0);
    kinds[rng.pick(spots)] = 'elite';
  }
  return kinds;
}

/**
 * A monotone lattice path from (0,0) to (a-1,b-1): its steps are the edges between a row of `a`
 * nodes and a row of `b` nodes. Monotone means no crossings; every node is covered; each upper node
 * gets at most two edges. Randomized backtracking (the grids are at most 4x4).
 */
function linkRows(a: number, b: number, rng: Rng): [number, number][] {
  const path: [number, number][] = [];
  // `out` = edges the current upper node already has (including the one just added)
  const go = (i: number, j: number, out: number): boolean => {
    path.push([i, j]);
    if (i === a - 1 && j === b - 1) return true;
    const moves: [number, number][] = [];
    if (i < a - 1) moves.push([1, 0]);
    if (j < b - 1 && out < 2) moves.push([0, 1]);
    if (i < a - 1 && j < b - 1) moves.push([1, 1], [1, 1]);
    for (const [di, dj] of shuffle(moves, rng)) {
      if (go(i + di, j + dj, di === 0 ? out + 1 : 1)) return true;
    }
    path.pop();
    return false;
  };
  go(0, 0, 1);
  return path;
}

/** Deterministic map for a run seed. */
export function generateMap(seed: number): RunMap {
  const rng = createRng((seed ^ 0x9e3779b9) >>> 0);
  const rows: MapNode[][] = [];
  for (let r = 1; r <= MAP_ROWS; r++) {
    rows.push(rowKinds(r, rng).map((kind, col) => ({ id: nodeId(r, col), row: r, col, kind, next: [] })));
  }
  for (let r = 0; r < MAP_ROWS - 1; r++) {
    for (const [i, j] of linkRows(rows[r].length, rows[r + 1].length, rng)) rows[r][i].next.push(rows[r + 1][j].id);
  }
  return { rows };
}

export function findNode(map: RunMap, id: string | null): MapNode | undefined {
  if (!id) return undefined;
  for (const row of map.rows) for (const n of row) if (n.id === id) return n;
  return undefined;
}

/** Nodes the player may pick next: row 1 at the start, otherwise the visited node's exits. */
export function reachable(map: RunMap, at: string | null): MapNode[] {
  if (!at) return map.rows[0] ?? [];
  const n = findNode(map, at);
  return n ? n.next.map((id) => findNode(map, id)).filter((x): x is MapNode => !!x) : [];
}

/** Cheap structural check used when loading saves. */
export function isValidMap(m: unknown): m is RunMap {
  const rows = (m as RunMap | undefined)?.rows;
  if (!Array.isArray(rows) || rows.length !== MAP_ROWS) return false;
  const ids = new Set<string>();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length === 0) return false;
    for (const n of row) {
      if (!n || typeof n.id !== 'string' || typeof n.row !== 'number' || typeof n.col !== 'number'
        || typeof n.kind !== 'string' || !Array.isArray(n.next)) return false;
      ids.add(n.id);
    }
  }
  return rows.every((row) => row.every((n) => n.next.every((id) => ids.has(id))));
}
