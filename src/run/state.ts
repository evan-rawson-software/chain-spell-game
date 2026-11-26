import { BOONS } from '../data/boons';
import { CATALOG, ROOT_UID, starterGraph } from '../data/runes';
import { DEFAULT_SCHOOL, SCHOOLS } from '../data/schools';
import type { BoonTotals } from '../contracts';
import type { MapNodeKind, Reward, RunState, RuneInstance } from '../types';
import { findNode, generateMap, isValidMap } from './map';

export const MAX_MANA_START = 8;
export const WARD_HP = 100;
export const START_GOLD = 20;
const KEY = 'chain-spell-run-v2';
const OLD_KEYS = ['chain-spell-run-v1'];

export type Phase = 'map' | 'prepare' | 'reward' | 'shop' | 'forge' | 'shrine' | 'blessing';
const PHASES: Phase[] = ['map', 'prepare', 'reward', 'shop', 'forge', 'shrine', 'blessing'];

/**
 * Saved format (localStorage `chain-spell-run-v2`):
 *   { run: RunState, phase: Phase, visited: string[], sold: number[] }
 * `run.at` is the node being played (phase != 'map') or the last cleared node (phase 'map').
 * `visited` is the path of node ids, `sold` the shop stock indexes bought at the current shop.
 * Shop stock, rewards and shrine offers are re-derived from run.seed + node id, so they survive reloads.
 */
export interface SavedRun { run: RunState; phase: Phase; visited: string[]; sold: number[] }

export function newRun(seed: number = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0, schoolId: string = DEFAULT_SCHOOL): RunState {
  const school = SCHOOLS.find((s) => s.id === schoolId) ?? SCHOOLS.find((s) => s.id === DEFAULT_SCHOOL) ?? SCHOOLS[0];
  const owned: RuneInstance[] = school.kit.map((defId, i) => ({ uid: `${defId}-${i}`, defId }));
  return {
    floor: 1,
    owned,
    graph: starterGraph(owned, school.id),
    maxMana: MAX_MANA_START,
    wardMaxHp: WARD_HP,
    seed,
    school: school.id,
    map: generateMap(seed),
    at: null,
    gold: START_GOLD,
    boons: school.boon ? [school.boon] : [],
  };
}

/** Max mana gained automatically when leaving a node of this kind. */
export function manaGain(kind: MapNodeKind, totals: BoonTotals): number {
  if (kind === 'boss') return 0;
  if (kind === 'shop' || kind === 'forge' || kind === 'shrine') return 1;
  return Math.max(0, (kind === 'elite' ? 3 : 2) + totals.manaGain);
}

/** Effective max ward HP (base + boons, at least 1). */
export function effectiveWardHp(run: RunState, totals: BoonTotals): number {
  return Math.max(1, run.wardMaxHp + totals.wardHp);
}

/** Pure: returns a new state with the rune added (floor is NOT advanced here). */
export function applyReward(state: RunState, reward: Reward): RunState {
  const used = new Set(state.owned.map((o) => o.uid));
  let n = state.owned.length;
  while (used.has(`${reward.defId}-${n}`)) n++;
  return { ...state, owned: [...state.owned, { uid: `${reward.defId}-${n}`, defId: reward.defId }] };
}

export function addBoon(run: RunState, id: string): RunState {
  return run.boons.includes(id) ? run : { ...run, boons: [...run.boons, id] };
}

export function removeBoon(run: RunState, id: string): RunState {
  return { ...run, boons: run.boons.filter((b) => b !== id) };
}

/** Adds `base` gold scaled by the gold multiplier (rounded). */
export function addGold(run: RunState, base: number, totals: BoonTotals): RunState {
  return { ...run, gold: run.gold + Math.round(base * totals.goldMul) };
}

export function spendGold(run: RunState, cost: number): RunState {
  return { ...run, gold: Math.max(0, run.gold - cost) };
}

/** Forge an owned rune: flags the owned entry and the placed copy (same uid). */
export function forgeRune(run: RunState, uid: string): RunState {
  const mark = (r: RuneInstance): RuneInstance => (r.uid === uid ? { ...r, plus: true } : r);
  return { ...run, owned: run.owned.map(mark), graph: { ...run.graph, nodes: run.graph.nodes.map(mark) } };
}

export function saveRun(run: RunState, phase: Phase, visited: string[] = [], sold: number[] = []): void {
  try { localStorage.setItem(KEY, JSON.stringify({ run, phase, visited, sold } satisfies SavedRun)); } catch { /* ignore */ }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(KEY);
    for (const k of OLD_KEYS) localStorage.removeItem(k);
  } catch { /* ignore */ }
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isInst = (x: unknown): x is RuneInstance => {
  const r = x as RuneInstance | null;
  return !!r && typeof r.uid === 'string' && typeof r.defId === 'string' && !!CATALOG[r.defId];
};

export function loadRun(): SavedRun | null {
  try {
    for (const k of OLD_KEYS) localStorage.removeItem(k); // old saves are discarded
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<SavedRun> | null;
    const r = s?.run;
    if (!r || !PHASES.includes(s.phase as Phase)) return null;
    if (!isNum(r.floor) || !isNum(r.maxMana) || !isNum(r.wardMaxHp) || !isNum(r.seed) || !isNum(r.gold)) return null;
    if (!Array.isArray(r.owned) || !r.owned.every(isInst)) return null;
    if (!r.graph || r.graph.rootUid !== ROOT_UID || !Array.isArray(r.graph.nodes) || !Array.isArray(r.graph.links)) return null;
    const uids = new Set(r.owned.map((o) => o.uid));
    uids.add(ROOT_UID);
    if (!r.graph.nodes.every((n) => uids.has(n.uid))) return null;
    if (typeof r.school !== 'string' || !isValidMap(r.map)) return null;
    if (r.at !== null && !findNode(r.map, r.at)) return null;
    if (!Array.isArray(r.boons)) return null;
    const run: RunState = { ...r, boons: r.boons.filter((b) => typeof b === 'string' && !!BOONS[b]) };
    if (s.phase !== 'map' && !run.at) return null;
    const visited = Array.isArray(s.visited) ? s.visited.filter((v): v is string => typeof v === 'string') : [];
    const sold = Array.isArray(s.sold) ? s.sold.filter(isNum) : [];
    return { run, phase: s.phase as Phase, visited, sold };
  } catch { return null; }
}
