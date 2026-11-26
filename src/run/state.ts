import { BOONS } from '../data/boons';
import { CATALOG, ROOT_UID, SOURCE_ID, starterGraph } from '../data/runes';
import { DEFAULT_SCHOOL, SCHOOLS } from '../data/schools';
import { removeRune } from '../spell';
import type { BoonTotals } from '../contracts';
import type { AbilityId, BattleResult, MapNodeKind, ReactionKind, Reward, RunState, RunStats, RuneInstance, SpellGraph } from '../types';
import { ABILITY_IDS, DEFAULT_ABILITY } from './abilities';
import { ACTS, findNode, generateMap, isValidMap } from './map';

export const MAX_MANA_START = 8;
export const WARD_HP = 100;
export const START_GOLD = 20;
const KEY = 'chain-spell-run-v3';
/** Saves from before acts (10-row maps). They are discarded, not migrated: see `takeDiscardNotice`. */
const OLD_KEYS = ['chain-spell-run-v1', 'chain-spell-run-v2'];
export const LOADOUT_SLOTS = 3;

/** Saved format v3 (acts, ability, loadouts). See SavedRun. */
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
 * Saved format (localStorage `chain-spell-run-v3`; v1/v2 saves have 10-row maps and are discarded on load):
 *   { run: RunState, phase: Phase, visited: string[], sold: number[], ns: NodeState }
 * `run.act` (1..3), `run.ability`, `run.loadouts` (3 slots, `run.loadout` active, that slot mirrors `run.graph`) are filled in
 * with defaults when missing.
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
  ability: AbilityId = DEFAULT_ABILITY,
): RunState {
  const school = SCHOOLS.find((s) => s.id === schoolId) ?? SCHOOLS.find((s) => s.id === DEFAULT_SCHOOL) ?? SCHOOLS[0];
  const owned: RuneInstance[] = school.kit.map((defId, i) => ({ uid: `${defId}-${i}`, defId }));
  const graph = starterGraph(owned, school.id);
  return {
    floor: 1,
    owned,
    graph,
    maxMana: MAX_MANA_START,
    wardMaxHp: WARD_HP,
    seed,
    school: school.id,
    ability,
    act: 1,
    map: generateMap(seed, 1),
    at: null,
    gold: START_GOLD,
    boons: school.boon ? [school.boon] : [],
    daily,
    stats: emptyStats(),
    loadouts: [graph, null, null],
    loadout: 0,
  };
}

/** A spell with only the Source (an empty loadout slot). */
export function emptyGraph(): SpellGraph {
  return { rootUid: ROOT_UID, nodes: [{ uid: ROOT_UID, defId: SOURCE_ID }], links: [] };
}

/** Start the next act: its seeded map, back to row 1. Max mana and everything owned carry over. */
export function advanceAct(run: RunState): RunState {
  const act = Math.min(ACTS, run.act + 1);
  return { ...run, act, map: generateMap(run.seed, act), at: null, floor: 1 };
}

/** Make slot `slot` the active spell: the current graph is stored in its own slot first. An empty slot is the Source alone. */
export function switchLoadout(run: RunState, slot: number): RunState {
  if (slot < 0 || slot >= LOADOUT_SLOTS || slot === run.loadout) return run;
  const loadouts = padLoadouts(run.loadouts);
  loadouts[run.loadout] = run.graph;
  const graph = loadouts[slot] ?? emptyGraph();
  loadouts[slot] = graph;
  return { ...run, loadouts, loadout: slot, graph };
}

function padLoadouts(l: (SpellGraph | null)[] | undefined): (SpellGraph | null)[] {
  return Array.from({ length: LOADOUT_SLOTS }, (_, i) => l?.[i] ?? null);
}

/** Every loadout graph with the active slot synced to `run.graph`. */
export function allLoadouts(run: RunState): (SpellGraph | null)[] {
  const l = padLoadouts(run.loadouts);
  l[run.loadout] = run.graph;
  return l;
}

/** True when the loadout slot holds a spell with at least one rune besides the Source. */
export function loadoutUsed(run: RunState, slot: number): boolean {
  return (allLoadouts(run)[slot]?.nodes.length ?? 0) > 1;
}

/** Applies `fn` to the active graph and to every stored loadout graph (used for removing and forging runes). */
export function mapGraphs(run: RunState, fn: (g: SpellGraph) => SpellGraph): RunState {
  const loadouts = allLoadouts(run).map((g) => (g ? fn(g) : g));
  return { ...run, graph: loadouts[run.loadout] as SpellGraph, loadouts };
}

/** Remove `uid` (and runes that depend on it) from the active spell and every loadout. */
export function removeFromLoadouts(run: RunState, uid: string): RunState {
  return mapGraphs(run, (g) => (g.nodes.some((n) => n.uid === uid) ? removeRune(g, uid) : g));
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
  const next = mapGraphs(run, (g) => ({ ...g, nodes: g.nodes.map(mark) }));
  return { ...next, owned: run.owned.map(mark) };
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

let discarded = false;
/** True once after loadRun threw away an old-format save (so the title screen can say so). */
export function takeDiscardNotice(): boolean {
  const d = discarded;
  discarded = false;
  return d;
}

function sanitizeGraph(g: unknown, uids: Set<string>): SpellGraph | null {
  const r = g as SpellGraph | null | undefined;
  if (!r || r.rootUid !== ROOT_UID || !Array.isArray(r.nodes) || !Array.isArray(r.links)) return null;
  if (!r.nodes.every((n) => !!n && typeof n.uid === 'string' && uids.has(n.uid) && (n.uid === ROOT_UID || (typeof n.defId === 'string' && !!CATALOG[n.defId])))) return null;
  if (!r.nodes.some((n) => n.uid === ROOT_UID)) return null;
  const placed = new Set(r.nodes.map((n) => n.uid));
  if (!r.links.every((l) => !!l && !!l.from && placed.has(l.from.uid) && placed.has(l.toUid))) return null;
  return r;
}

export function loadRun(): SavedRun | null {
  try {
    for (const k of OLD_KEYS) {
      if (localStorage.getItem(k) !== null) { discarded = true; localStorage.removeItem(k); }
    }
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
    const daily = typeof r.daily === 'string' ? r.daily : null;
    const act = isNum(r.act) ? Math.max(1, Math.min(ACTS, Math.round(r.act))) : 1;
    const ability = ABILITY_IDS.includes(r.ability as AbilityId) ? (r.ability as AbilityId) : DEFAULT_ABILITY;
    const loadout = isNum(r.loadout) && r.loadout >= 0 && r.loadout < LOADOUT_SLOTS ? Math.round(r.loadout) : 0;
    const loadouts = padLoadouts(Array.isArray(r.loadouts) ? r.loadouts.map((g) => sanitizeGraph(g, uids)) : undefined);
    loadouts[loadout] = r.graph;
    const run: RunState = {
      ...r, act, ability, loadout, loadouts, boons: r.boons.filter((b) => typeof b === 'string' && !!BOONS[b]), daily, stats: sanitizeStats(r.stats),
    };
    if (s.phase !== 'map' && !run.at) return null;
    const visited = Array.isArray(s.visited) ? s.visited.filter((v): v is string => typeof v === 'string') : [];
    const sold = Array.isArray(s.sold) ? s.sold.filter(isNum) : [];
    const ns = sanitizeNodeState(s.ns);
    return { run, phase: s.phase as Phase, visited, sold, ns };
  } catch { return null; }
}
