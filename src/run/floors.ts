import type { EliteTraitId, EnemyKind, FloorDef, HazardId, MapNodeKind, SpawnGroup, WaveDef } from '../types';
import { nodeSeed } from './rewards';
import { createRng } from './rng';

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

export type BossKind = 'boss_lich' | 'boss_golem' | 'boss_hydra';
export const BOSSES: BossKind[] = ['boss_lich', 'boss_golem', 'boss_hydra'];

/** Row (1-based) from which each featured enemy can appear. */
export const FEATURE_UNLOCK: Partial<Record<EnemyKind, number>> = {
  shield_bearer: 2, swarmer: 2, splitter: 3, armored: 4, cleanser: 4,
};
const FEATURABLE = Object.keys(FEATURE_UNLOCK) as EnemyKind[];
export const HAZARDS: HazardId[] = ['rain', 'heatwave', 'fog'];
export const ELITE_TRAITS: EliteTraitId[] = ['hasted', 'reflective', 'regenerating', 'burn_immune'];
export const HAZARD_MIN_ROW = 3;
export const HAZARD_CHANCE = 0.3;

/** What a map node tells the player before they pick it. */
export interface NodePreview {
  featured?: EnemyKind;
  hazard?: HazardId;
  trait?: EliteTraitId;
  boss?: BossKind;
  /** pack size when the featured enemy is the swarmer (8-12) */
  swarm?: number;
}

/** The run's boss, picked from the run seed. */
export function bossFor(seed: number): BossKind {
  return createRng(nodeSeed(seed, 'boss', 5)).pick(BOSSES);
}

/** Featured enemy, hazard, elite trait or boss of a node: deterministic from the run seed and node id. */
export function nodePreview(row: number, nodeKind: MapNodeKind, nodeId: string, seed: number): NodePreview {
  if (nodeKind === 'boss') return { boss: bossFor(seed) };
  if (nodeKind !== 'battle' && nodeKind !== 'elite') return {};
  const rng = createRng(nodeSeed(seed, nodeId, 77));
  const out: NodePreview = {};
  const unlocked = FEATURABLE.filter((k) => row >= (FEATURE_UNLOCK[k] ?? 99));
  const featured = unlocked.length ? rng.pick(unlocked) : undefined;
  const hazardRoll = rng.next();
  const hazard = rng.pick(HAZARDS);
  const trait = rng.pick(ELITE_TRAITS);
  const swarm = 8 + rng.int(5);
  if (featured) out.featured = featured;
  if (featured === 'swarmer') out.swarm = swarm;
  if (row >= HAZARD_MIN_ROW && hazardRoll < HAZARD_CHANCE) out.hazard = hazard;
  if (nodeKind === 'elite') out.trait = trait;
  return out;
}

function featuredGroup(kind: EnemyKind, row: number, swarm: number): SpawnGroup {
  switch (kind) {
    case 'shield_bearer': return g(kind, 3 + Math.floor(row / 4), 2, 2);
    case 'splitter': return g(kind, 2 + Math.floor(row / 4), 2, 2.5);
    case 'armored': return g(kind, 2 + Math.floor(row / 5), 2, 2.5);
    case 'cleanser': return g(kind, row >= 7 ? 2 : 1, 3, 4);
    case 'swarmer': return g(kind, swarm, 2, 0.25);
    default: return g(kind, 2, 2, 2);
  }
}

/** Boss row wave tables, one per boss. */
function bossWaves(boss: BossKind): WaveDef[] {
  const opener: WaveDef = { groups: [g('grunt', 8, 1, 0.8), g('archer', 3, 2, 1.8)] };
  switch (boss) {
    case 'boss_golem':
      return [
        opener,
        { groups: [g('boss_golem', 1, 1, 1), g('grunt', 4, 6, 2.5), g('archer', 2, 10, 3)] },
        { groups: [g('shaman', 2, 1, 4), g('brute', 2, 3, 4), g('runner', 6, 5, 1)] },
      ];
    case 'boss_hydra':
      return [
        opener,
        { groups: [g('boss_hydra', 1, 1, 1), g('runner', 4, 8, 2), g('archer', 2, 5, 3)] },
        { groups: [g('shaman', 2, 1, 4), g('brute', 2, 3, 4), g('runner', 6, 5, 1)] },
      ];
    default:
      return WAVES[10].map((w) => ({ groups: w.groups.map((x) => ({ ...x })) }));
  }
}

/**
 * The floor for map row `row` (1..10). The node kind decides the encounter:
 * battle = that row's waves; elite = same plus an Elite Knight in the middle wave and +10% HP; boss = row-10 waves
 * for the run's boss. With `nodeId` and the run `seed` the floor also carries the node's featured enemy (mixed into
 * the second wave), hazard and elite trait, all deterministic; without them it is the plain base floor.
 */
export function floorDef(row: number, nodeKind: MapNodeKind = 'battle', nodeId?: string, seed?: number): FloorDef {
  const floor = Math.max(1, Math.min(FLOOR_COUNT, Math.round(row)));
  const kind: FloorDef['kind'] = nodeKind === 'boss' ? 'boss' : nodeKind === 'elite' ? 'elite' : 'normal';
  const withNode = nodeId !== undefined && seed !== undefined;
  const preview: NodePreview = withNode ? nodePreview(floor, nodeKind, nodeId, seed) : {};
  const waves: WaveDef[] = kind === 'boss' && preview.boss
    ? bossWaves(preview.boss)
    : WAVES[floor].map((w) => ({ groups: w.groups.map((x) => ({ ...x })) }));
  let hpScale = 1 + 0.18 * (floor - 1);
  if (kind === 'elite') {
    waves[Math.floor(waves.length / 2)].groups.push(g('elite_knight', 1, 2, 1));
    hpScale *= 1.1;
  }
  const def: FloorDef = { floor, kind, waves, hpScale };
  if (preview.featured) {
    waves[Math.min(1, waves.length - 1)].groups.push(featuredGroup(preview.featured, floor, preview.swarm ?? 10));
  }
  if (preview.hazard) def.hazard = preview.hazard;
  if (preview.trait) def.eliteTrait = preview.trait;
  return def;
}
