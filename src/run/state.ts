import { ROOT_UID, STARTER_KIT, starterGraph } from '../data/runes';
import type { FloorDef, Reward, RunState, RuneInstance } from '../types';

export const MAX_MANA_START = 8;
export const WARD_HP = 100;
const KEY = 'chain-spell-run-v1';

export type Phase = 'prepare' | 'reward';
export interface SavedRun { run: RunState; phase: Phase }

export function newRun(seed: number = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0): RunState {
  const owned: RuneInstance[] = STARTER_KIT.map((defId, i) => ({ uid: `${defId}-${i}`, defId }));
  return { floor: 1, owned, graph: starterGraph(owned), maxMana: MAX_MANA_START, wardMaxHp: WARD_HP, seed };
}

/** Max mana gained automatically for clearing a floor of this kind. */
export function manaGain(kind: FloorDef['kind']): number {
  return kind === 'normal' ? 2 : 3;
}

/** Pure: returns a new state with the reward applied (floor is NOT advanced here). */
export function applyReward(state: RunState, reward: Reward): RunState {
  const used = new Set(state.owned.map((o) => o.uid));
  let n = state.owned.length;
  while (used.has(`${reward.defId}-${n}`)) n++;
  return { ...state, owned: [...state.owned, { uid: `${reward.defId}-${n}`, defId: reward.defId }] };
}

export function saveRun(run: RunState, phase: Phase): void {
  try { localStorage.setItem(KEY, JSON.stringify({ run, phase })); } catch { /* ignore */ }
}

export function clearRun(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function loadRun(): SavedRun | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedRun;
    const r = s?.run;
    // Saves from before the wizard became a ward circle used `wizardMaxHp`.
    const legacy = r as unknown as { wizardMaxHp?: number } | undefined;
    if (r && typeof r.wardMaxHp !== 'number' && typeof legacy?.wizardMaxHp === 'number') {
      r.wardMaxHp = legacy.wizardMaxHp;
      delete legacy.wizardMaxHp;
    }
    if (!r || typeof r.floor !== 'number' || !Array.isArray(r.owned) || !r.graph || !Array.isArray(r.graph.nodes)
      || typeof r.maxMana !== 'number' || typeof r.wardMaxHp !== 'number' || typeof r.seed !== 'number') return null;
    if (r.graph.rootUid !== ROOT_UID) return null;
    return { run: r, phase: s.phase === 'reward' ? 'reward' : 'prepare' };
  } catch { return null; }
}
