import type { EnemyKind, FloorDef, MapNodeKind, SpawnGroup, WaveDef } from '../types';

export const FLOOR_COUNT = 10;

const g = (kind: EnemyKind, count: number, at: number, interval: number): SpawnGroup => ({ kind, count, at, interval });

/** Hand-tuned wave tables, floors 1..10. */
const WAVES: Record<number, WaveDef[]> = {
  1: [
    { groups: [g('grunt', 4, 1, 1.6)] },
    { groups: [g('grunt', 4, 1, 1.4), g('runner', 2, 4, 1.5)] },
  ],
  2: [
    { groups: [g('grunt', 5, 1, 1.4), g('runner', 2, 3, 1.5)] },
    { groups: [g('archer', 2, 1, 2.5), g('grunt', 4, 2, 1.3)] },
    { groups: [g('runner', 4, 1, 1.0), g('archer', 1, 3, 1)] },
  ],
  3: [
    { groups: [g('grunt', 6, 1, 1.2), g('runner', 3, 3, 1.2)] },
    { groups: [g('brute', 1, 1, 1), g('archer', 2, 3, 2)] },
    { groups: [g('grunt', 5, 1, 1.0), g('runner', 4, 2, 1.0), g('archer', 2, 4, 2)] },
  ],
  4: [
    { groups: [g('grunt', 6, 1, 1.1), g('shaman', 1, 3, 1)] },
    { groups: [g('brute', 2, 1, 3), g('archer', 3, 2, 1.8)] },
    { groups: [g('runner', 5, 1, 0.9), g('shaman', 1, 2, 1), g('grunt', 5, 3, 1.0)] },
  ],
  5: [
    { groups: [g('grunt', 6, 1, 1.0), g('archer', 2, 2, 2)] },
    { groups: [g('elite_knight', 1, 1, 1), g('grunt', 4, 4, 1.5)] },
    { groups: [g('shaman', 2, 1, 3), g('runner', 5, 2, 0.9), g('brute', 1, 5, 1)] },
  ],
  6: [
    { groups: [g('grunt', 8, 1, 0.9), g('runner', 4, 3, 1.0)] },
    { groups: [g('brute', 2, 1, 3), g('archer', 3, 2, 1.6), g('shaman', 1, 4, 1)] },
    { groups: [g('runner', 6, 1, 0.8), g('brute', 2, 3, 3), g('archer', 2, 4, 2)] },
  ],
  7: [
    { groups: [g('grunt', 8, 1, 0.8), g('archer', 3, 2, 1.8)] },
    { groups: [g('brute', 3, 1, 2.5), g('shaman', 2, 2, 3), g('runner', 4, 4, 1)] },
    { groups: [g('grunt', 6, 1, 0.8), g('runner', 6, 2, 0.7), g('archer', 3, 3, 1.5)] },
  ],
  8: [
    { groups: [g('brute', 3, 1, 2.5), g('grunt', 8, 2, 0.8)] },
    { groups: [g('shaman', 3, 1, 2.5), g('archer', 4, 2, 1.5), g('runner', 5, 4, 0.8)] },
    { groups: [g('brute', 3, 1, 2.2), g('runner', 8, 2, 0.6), g('shaman', 2, 3, 3)] },
  ],
  9: [
    { groups: [g('grunt', 10, 1, 0.7), g('archer', 4, 2, 1.5)] },
    { groups: [g('brute', 4, 1, 2.2), g('shaman', 3, 2, 2.5), g('runner', 6, 3, 0.7)] },
    { groups: [g('brute', 3, 1, 2), g('archer', 5, 2, 1.3), g('shaman', 3, 3, 2.5), g('runner', 8, 4, 0.6)] },
  ],
  10: [
    { groups: [g('grunt', 8, 1, 0.8), g('archer', 3, 2, 1.8)] },
    { groups: [g('boss_lich', 1, 1, 1), g('grunt', 6, 5, 2), g('runner', 4, 8, 2)] },
    { groups: [g('shaman', 2, 1, 4), g('brute', 2, 3, 4), g('runner', 6, 5, 1)] },
  ],
};

/**
 * The floor for map row `row` (1..10). The node kind decides the encounter:
 * battle = that row's waves; elite = same plus an Elite Knight in the middle wave and +10% HP; boss = row-10 waves.
 */
export function floorDef(row: number, nodeKind: MapNodeKind = 'battle'): FloorDef {
  const floor = Math.max(1, Math.min(FLOOR_COUNT, Math.round(row)));
  const kind: FloorDef['kind'] = nodeKind === 'boss' ? 'boss' : nodeKind === 'elite' ? 'elite' : 'normal';
  const waves: WaveDef[] = WAVES[floor].map((w) => ({ groups: w.groups.map((x) => ({ ...x })) }));
  let hpScale = 1 + 0.18 * (floor - 1);
  if (kind === 'elite') {
    waves[Math.floor(waves.length / 2)].groups.push(g('elite_knight', 1, 2, 1));
    hpScale *= 1.1;
  }
  return { floor, kind, waves, hpScale };
}
