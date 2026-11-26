import type { EliteTraitId, EnemyKind, FloorDef, HazardId, MapNodeKind, SpawnGroup, WaveDef } from '../types';
import { MAP_ROWS } from './map';
import { nodeSeed } from './rewards';
import { createRng } from './rng';

/** Total difficulty steps in a run: 3 acts x 6 rows. */
export const FLOOR_COUNT = 18;

const g = (kind: EnemyKind, count: number, at: number, interval: number): SpawnGroup => ({ kind, count, at, interval });

/** Hand-tuned wave tables 1..10 (10 = the Lich King). Stretched over depth 1..18, see `waveTable`. */
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

export const ACT_TITLES = ['The Crypt', 'The Frozen Marsh', 'The Storm Spire'];
const ROMAN = ['I', 'II', 'III'];
/** "Act II - The Frozen Marsh" (act title card text). */
export const actTitle = (act: number): string => `Act ${ROMAN[act - 1] ?? act} — ${ACT_TITLES[act - 1] ?? ''}`;

/** Difficulty depth 1..18 of a map row: d = (act - 1) * 6 + row. */
export const depthOf = (act: number, row: number): number => (Math.max(1, Math.min(3, act)) - 1) * MAP_ROWS + Math.max(1, Math.min(MAP_ROWS, row));

/** Depth from which each featured enemy can appear (act 1 has shield bearers, swarmers, splitters; act 2 adds the rest). */
export const FEATURE_UNLOCK: Partial<Record<EnemyKind, number>> = {
  shield_bearer: 2, swarmer: 3, splitter: 4, armored: 7, cleanser: 8,
};
const FEATURABLE = Object.keys(FEATURE_UNLOCK) as EnemyKind[];
export const HAZARDS: HazardId[] = ['rain', 'heatwave', 'fog'];
export const ELITE_TRAITS: EliteTraitId[] = ['hasted', 'reflective', 'regenerating', 'burn_immune'];
export const HAZARD_MIN_DEPTH = 3;
export const HAZARD_CHANCE = 0.3;
/** Share of spawn groups that enter from the top or bottom edge, per act (act 1 uses only the right edge). */
export const FROM_CHANCE = [0, 0.3, 0.55];
/** HP multiplier growth per depth step (the old 10-row game used 0.18 per row; stretched over 18 depths). */
export const HP_PER_DEPTH = 0.1;
/** What a map node tells the player before they pick it. */
export interface NodePreview {
  featured?: EnemyKind;
  hazard?: HazardId;
  trait?: EliteTraitId;
  boss?: BossKind;
  /** pack size when the featured enemy is the swarmer (8-12) */
  swarm?: number;
}

/** The three bosses in a seeded order, one per act. */
export function bossOrder(seed: number): BossKind[] {
  const rng = createRng(nodeSeed(seed, 'boss', 5));
  const a = [...BOSSES];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The boss of an act (1..3) for this run seed. */
export function bossFor(seed: number, act = 1): BossKind {
  return bossOrder(seed)[Math.max(1, Math.min(3, act)) - 1];
}

/** Featured enemy, hazard, elite trait or boss of a node: deterministic from the run seed and node id (which carries the act). */
export function nodePreview(row: number, nodeKind: MapNodeKind, nodeId: string, seed: number, act = 1): NodePreview {
  if (nodeKind === 'boss') return { boss: bossFor(seed, act) };
  if (nodeKind !== 'battle' && nodeKind !== 'elite') return {};
  const depth = depthOf(act, row);
  const rng = createRng(nodeSeed(seed, nodeId, 77));
  const out: NodePreview = {};
  const unlocked = FEATURABLE.filter((k) => depth >= (FEATURE_UNLOCK[k] ?? 99));
  const featured = unlocked.length ? rng.pick(unlocked) : undefined;
  const hazardRoll = rng.next();
  const hazard = rng.pick(HAZARDS);
  const trait = rng.pick(ELITE_TRAITS);
  const swarm = 8 + rng.int(5);
  if (featured) out.featured = featured;
  if (featured === 'swarmer') out.swarm = swarm;
  if (depth >= HAZARD_MIN_DEPTH && hazardRoll < HAZARD_CHANCE) out.hazard = hazard;
  if (nodeKind === 'elite') out.trait = trait;
  return out;
}

function featuredGroup(kind: EnemyKind, depth: number, swarm: number): SpawnGroup {
  switch (kind) {
    case 'shield_bearer': return g(kind, 3 + Math.floor(depth / 7), 2, 2);
    case 'splitter': return g(kind, 2 + Math.floor(depth / 7), 2, 2.5);
    case 'armored': return g(kind, 2 + Math.floor(depth / 9), 2, 2.5);
    case 'cleanser': return g(kind, depth >= 12 ? 2 : 1, 3, 4);
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
 * Wave table for a difficulty depth (non-boss, 1..17). The ten hand-tuned tables are stretched over the run:
 * table = 1 + floor((depth - 1) / 2), so tables 1..9 are used (10 belongs to the Lich King). Every second depth
 * (the even ones) repeats the previous table with 20% more enemies in each group.
 */
export function waveTable(depth: number): WaveDef[] {
  const d = Math.max(1, Math.min(FLOOR_COUNT, Math.round(depth)));
  const table = Math.min(9, 1 + Math.floor((d - 1) / 2));
  const bump = d % 2 === 0 ? 1.2 : 1;
  return WAVES[table].map((w) => ({ groups: w.groups.map((x) => ({ ...x, count: Math.max(x.count, Math.round(x.count * bump)) })) }));
}

/** Sends some groups in through the top or bottom edge (act 2: ~30%, act 3: ~55%); bosses always enter from the right. */
function addDirections(waves: WaveDef[], act: number, rng: ReturnType<typeof createRng>): void {
  const chance = FROM_CHANCE[Math.max(1, Math.min(3, act)) - 1] ?? 0;
  for (const w of waves) {
    for (const grp of w.groups) {
      const isBoss = (BOSSES as string[]).includes(grp.kind);
      // always draw, so adding or removing groups elsewhere doesn't shift the rest
      const roll = rng.next();
      const side = rng.next() < 0.5 ? 'top' : 'bottom';
      if (chance > 0 && !isBoss && roll < chance) grp.from = side;
    }
  }
}

/**
 * The floor for map row `row` (1..6) of `act` (1..3), at difficulty depth d = (act - 1) * 6 + row (1..18); the
 * returned `floor` is that depth. The node kind decides the encounter: battle = the depth's stretched wave table;
 * elite = same plus an Elite Knight in the middle wave and +10% HP; boss = the act boss's waves. With `nodeId` and
 * the run `seed` the floor also carries the node's featured enemy (mixed into the second wave), hazard and elite
 * trait, all deterministic; without them it is the plain base floor (boss: the Lich King). HP scales by
 * 1 + 0.1 * (d - 1) (2.7x at depth 18). Act 2 and 3 send some groups from the top/bottom edge.
 */
export function floorDef(row: number, nodeKind: MapNodeKind = 'battle', nodeId?: string, seed?: number, act = 1): FloorDef {
  const actN = Math.max(1, Math.min(3, Math.round(act)));
  const floor = depthOf(actN, Math.round(row));
  const kind: FloorDef['kind'] = nodeKind === 'boss' ? 'boss' : nodeKind === 'elite' ? 'elite' : 'normal';
  const withNode = nodeId !== undefined && seed !== undefined;
  const preview: NodePreview = withNode ? nodePreview(Math.round(row), nodeKind, nodeId, seed, actN) : {};
  const waves: WaveDef[] = kind === 'boss'
    ? bossWaves(preview.boss ?? 'boss_lich')
    : waveTable(floor);
  let hpScale = 1 + HP_PER_DEPTH * (floor - 1);
  if (kind === 'elite') {
    waves[Math.floor(waves.length / 2)].groups.push(g('elite_knight', 1, 2, 1));
    hpScale *= 1.1;
  }
  const def: FloorDef = { floor, kind, waves, hpScale, act: actN };
  if (preview.featured) {
    waves[Math.min(1, waves.length - 1)].groups.push(featuredGroup(preview.featured, floor, preview.swarm ?? 10));
  }
  addDirections(waves, actN, createRng(nodeSeed(seed ?? 0, nodeId ?? `d${floor}`, 90)));
  if (preview.hazard) def.hazard = preview.hazard;
  if (preview.trait) def.eliteTrait = preview.trait;
  return def;
}
