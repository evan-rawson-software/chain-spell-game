import { BOONS } from '../data/boons';
import { CATALOG, ROOT_UID, starterGraph } from '../data/runes';
import { DEFAULT_SCHOOL, SCHOOLS } from '../data/schools';
import type { BoonTotals } from '../contracts';
import type { BattleResult, MapNodeKind, ReactionKind, Reward, RunState, RunStats, RuneInstance } from '../types';
import { findNode, generateMap, isValidMap } from './map';

export const MAX_MANA_START = 8;
export const WARD_HP = 100;
export const START_GOLD = 20;
const KEY = 'chain-spell-run-v2';
const OLD_KEYS = ['chain-spell-run-v1'];

export type Phase = 'map' | 'prepare' | 'reward' | 'shop' | 'forge' | 'shrine' | 'blessing' | 'event' | 'treasure' | 'rest';
const PHASES: Phase[] = ['map', 'prepare', 'reward', 'shop', 'forge', 'shrine', 'blessing', 'event', 'treasure', 'rest'];

/** Small per-node state that must survive a reload (reset whenever a node is picked or left). */
export interface NodeState {
  /** reward screen: the rune cards were rerolled once */
  rerolled?: boolean;
  /** shop: number of transmutes done here (salts the next roll) */
  ops?: number;
  /** event: result lines, set once the choice was made */
  outcome?: string[];
}

/**
 * Saved format (localStorage `chain-spell-run-v2`):
 *   { run: RunState, phase: Phase, visited: string[], sold: number[], ns: NodeState }
 * `run.daily` ('YYYY-MM-DD' or null) and `run.stats` were added later; loadRun fills them in for older v2 saves.
 * `run.at` is the node being played (phase != 'map') or the last cleared node (phase 'map').
 * `visited` is the path of node ids, `sold` the shop stock indexes bought at the current shop.
 * Shop stock, rewards and shrine offers are re-derived from run.seed + node id, so they survive reloads.
 */
export interface SavedRun { run: RunState; phase: Phase; visited: string[]; sold: number[]; ns: NodeState }

export const emptyStats = (): RunStats => ({ battles: 0, kills: 0, bestHit: 0, runeDamage: {}, reactions: {} });

/** Local date as 'YYYY-MM-DD'. */
export function todayString(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Stable seed for a daily run: FNV-1a hash of the date string. */
export function dailySeed(date: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < date.length; i++) h = Math.imul(h ^ date.charCodeAt(i), 0x01000193) >>> 0;
  return h >>> 0;
}

/** Folds a finished battle into the run totals (pure). */
export function addBattleStats(run: RunState, r: BattleResult): RunState {
  const prev = run.stats;
  const runeDamage = { ...prev.runeDamage };
  for (const [uid, dmg] of Object.entries(r.runeDamage ?? {})) if (isNum(dmg)) runeDamage[uid] = (runeDamage[uid] ?? 0) + dmg;
  const reactions = { ...prev.reactions };
  for (const [k, n] of Object.entries(r.reactionCounts ?? {})) if (isNum(n)) reactions[k as ReactionKind] = (reactions[k as ReactionKind] ?? 0) + n;
  const stats: RunStats = {
    battles: prev.battles + 1,
    kills: prev.kills + (isNum(r.kills) ? r.kills : 0),
    bestHit: Math.max(prev.bestHit, isNum(r.bestHit) ? r.bestHit : 0),
    runeDamage,
    reactions,
  };
  return { ...run, stats };
}

export function newRun(
  seed: number = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0,
  schoolId: string = DEFAULT_SCHOOL,
  daily: string | null = null,
): RunState {
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
    daily,
    stats: emptyStats(),
  };
}

/** Max mana gained automatically when leaving a node of this kind. */
export function manaGain(kind: MapNodeKind, totals: BoonTotals): number {
  if (kind === 'boss') return 0;
  if (kind === 'shop' || kind === 'forge' || kind === 'shrine' || kind === 'event' || kind === 'treasure' || kind === 'rest') return 1;
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

export function saveRun(run: RunState, phase: Phase, visited: string[] = [], sold: number[] = [], ns: NodeState = {}): void {
  try { localStorage.setItem(KEY, JSON.stringify({ run, phase, visited, sold, ns } satisfies SavedRun)); } catch { /* ignore */ }
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

function sanitizeStats(x: unknown): RunStats {
  const st = emptyStats();
  const r = x as Partial<RunStats> | null | undefined;
  if (!r || typeof r !== 'object') return st;
  if (isNum(r.battles)) st.battles = r.battles;
  if (isNum(r.kills)) st.kills = r.kills;
  if (isNum(r.bestHit)) st.bestHit = r.bestHit;
  if (r.runeDamage && typeof r.runeDamage === 'object') for (const [k, v] of Object.entries(r.runeDamage)) if (isNum(v)) st.runeDamage[k] = v;
  if (r.reactions && typeof r.reactions === 'object') for (const [k, v] of Object.entries(r.reactions)) if (isNum(v)) st.reactions[k as ReactionKind] = v;
  return st;
}

function sanitizeNodeState(x: unknown): NodeState {
  const r = x as NodeState | null | undefined;
  const ns: NodeState = {};
  if (!r || typeof r !== 'object') return ns;
  if (r.rerolled === true) ns.rerolled = true;
  if (isNum(r.ops)) ns.ops = r.ops;
  if (Array.isArray(r.outcome)) ns.outcome = r.outcome.filter((l): l is string => typeof l === 'string');
  return ns;
}

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
    // Saves from before daily runs / run stats lack these fields: upgrade instead of discarding.
    const daily = typeof r.daily === 'string' ? r.daily : null;
    const run: RunState = { ...r, boons: r.boons.filter((b) => typeof b === 'string' && !!BOONS[b]), daily, stats: sanitizeStats(r.stats) };
    if (s.phase !== 'map' && !run.at) return null;
    const visited = Array.isArray(s.visited) ? s.visited.filter((v): v is string => typeof v === 'string') : [];
    const sold = Array.isArray(s.sold) ? s.sold.filter(isNum) : [];
    const ns = sanitizeNodeState(s.ns);
    return { run, phase: s.phase as Phase, visited, sold, ns };
  } catch { return null; }
}
