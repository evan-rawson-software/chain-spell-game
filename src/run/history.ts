import { encodeSpell } from '../spell';
import type { RunState } from '../types';
import { bossFor, type BossKind } from './floors';
import { MAP_ROWS, findNode } from './map';
import { damageByDef, logEnd, type RunOutcome } from './telemetry';

export const HISTORY_KEY = 'chain-spell-history';
export const HISTORY_MAX = 30;

export interface HistoryEntry {
  /** ISO date-time */
  date: string;
  school: string;
  ability: string;
  seed: number;
  /** 'YYYY-MM-DD' for a daily run */
  daily: string | null;
  outcome: RunOutcome;
  /** furthest act and row reached */
  act: number;
  row: number;
  /** the last boss met (fought or being fought), if any */
  boss: BossKind | null;
  bestHit: number;
  kills: number;
  topRune: { defId: string; damage: number } | null;
  /** final spell share code */
  code: string;
}

/** Where a run ended: the act and row reached. */
export function reached(run: RunState, outcome: RunOutcome): { act: number; row: number } {
  if (outcome === 'won') return { act: 3, row: MAP_ROWS };
  return { act: run.act, row: Math.max(1, Math.min(MAP_ROWS, run.floor)) };
}

/** The last boss met: this act's if you are on its boss node, otherwise the previous act's (if any). */
export function bossReached(run: RunState, outcome: RunOutcome): BossKind | null {
  if (outcome === 'won') return bossFor(run.seed, 3);
  if (findNode(run.map, run.at)?.kind === 'boss') return bossFor(run.seed, run.act);
  return run.act > 1 ? bossFor(run.seed, run.act - 1) : null;
}

export function buildEntry(run: RunState, outcome: RunOutcome, now: Date = new Date()): HistoryEntry {
  const dmg = Object.entries(damageByDef(run)).sort((a, b) => b[1] - a[1])[0];
  const { act, row } = reached(run, outcome);
  let code = '';
  try { code = encodeSpell(run.graph); } catch (e) { console.error(e); }
  return {
    date: now.toISOString(),
    school: run.school,
    ability: run.ability,
    seed: run.seed,
    daily: run.daily,
    outcome,
    act, row,
    boss: bossReached(run, outcome),
    bestHit: Math.round(run.stats.bestHit),
    kills: run.stats.kills,
    topRune: dmg ? { defId: dmg[0], damage: Math.round(dmg[1]) } : null,
    code,
  };
}

/** Newest first, capped at 30. */
export function addEntry(list: HistoryEntry[], entry: HistoryEntry, max: number = HISTORY_MAX): HistoryEntry[] {
  return [entry, ...list].slice(0, max);
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? 'null') as unknown;
    return Array.isArray(raw)
      ? (raw as HistoryEntry[]).filter((e) => !!e && typeof e.date === 'string' && typeof e.school === 'string').slice(0, HISTORY_MAX)
      : [];
  } catch { return []; }
}

export function clearHistory(): void {
  try { localStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ }
}

/** Write the history entry and close the telemetry record for a finished (or abandoned) run. */
export function recordRunEnd(run: RunState, outcome: RunOutcome): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(addEntry(loadHistory(), buildEntry(run, outcome))));
  } catch { /* ignore */ }
  const { act, row } = reached(run, outcome);
  logEnd(run, outcome, act, row);
}
