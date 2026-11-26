import { CATALOG } from '../data/runes';
import type { ReactionKind, RunState } from '../types';

/** Local-only run telemetry (DESIGN.md, Run history and telemetry). Never sent anywhere. */
export const TELEMETRY_KEY = 'chain-spell-telemetry';
export const TELEMETRY_MAX = 200;

export type RunOutcome = 'won' | 'lost' | 'abandoned';

export interface OfferRecord {
  /** where the offer came from: battle, elite, boss, treasure */
  source: string;
  act: number;
  row: number;
  offered: string[];
  taken: string[];
}
export interface PurchaseRecord {
  act: number;
  row: number;
  /** 'rune' | 'forge' | 'curse' | 'sell' | 'transmute' */
  kind: string;
  defId?: string;
  /** gold spent (negative = gold gained) */
  gold: number;
}
export interface FusionRecord { act: number; row: number; a: string; b: string; result: string; gold: number }

export interface TelemetryRun {
  id: string;
  startedAt: string;
  school: string;
  ability: string;
  seed: number;
  daily: string | null;
  offers: OfferRecord[];
  purchases: PurchaseRecord[];
  fusions: FusionRecord[];
  /** defIds of the final spell (forged ones end with "+") */
  finalSpell: string[];
  /** share of total damage per rune defId, 0..1 */
  damageShare: Record<string, number>;
  reactions: Partial<Record<ReactionKind, number>>;
  end?: { act: number; row: number; result: RunOutcome };
}

export function newTelemetryRun(run: RunState, now: Date = new Date()): TelemetryRun {
  return {
    id: `${run.seed}-${now.getTime()}`,
    startedAt: now.toISOString(),
    school: run.school,
    ability: run.ability,
    seed: run.seed,
    daily: run.daily,
    offers: [], purchases: [], fusions: [],
    finalSpell: [], damageShare: {}, reactions: {},
  };
}

/** Maps a damage key (rune instance uid) to its defId, even if the rune was since sold. */
export function defIdOfUid(run: RunState, uid: string): string | null {
  const inst = run.owned.find((o) => o.uid === uid) ?? run.graph.nodes.find((o) => o.uid === uid);
  if (inst) return inst.defId;
  const m = /^(.*)-\d+$/.exec(uid);
  return m && CATALOG[m[1]] ? m[1] : null;
}

/** Total damage per rune defId over the run. */
export function damageByDef(run: RunState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [uid, v] of Object.entries(run.stats.runeDamage)) {
    const id = defIdOfUid(run, uid);
    if (id && v > 0) out[id] = (out[id] ?? 0) + v;
  }
  return out;
}

/** Damage per defId as fractions of the total (sums to about 1; empty when no damage). */
export function damageShare(run: RunState): Record<string, number> {
  const d = damageByDef(run);
  const total = Object.values(d).reduce((a, b) => a + b, 0);
  if (total <= 0) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(d)) out[k] = Math.round((v / total) * 10000) / 10000;
  return out;
}

export function recordOffer(t: TelemetryRun, rec: OfferRecord): TelemetryRun {
  return { ...t, offers: [...t.offers, rec] };
}
export function recordPurchase(t: TelemetryRun, rec: PurchaseRecord): TelemetryRun {
  return { ...t, purchases: [...t.purchases, rec] };
}
export function recordFusion(t: TelemetryRun, rec: FusionRecord): TelemetryRun {
  return { ...t, fusions: [...t.fusions, rec] };
}

/** Final fields: spell, damage share, reactions, where it ended and how. */
export function finishRun(t: TelemetryRun, run: RunState, outcome: RunOutcome, act: number, row: number): TelemetryRun {
  const finalSpell = run.graph.nodes.filter((n) => n.uid !== run.graph.rootUid).map((n) => `${n.defId}${n.plus ? '+' : ''}`);
  return { ...t, finalSpell, damageShare: damageShare(run), reactions: { ...run.stats.reactions }, end: { act, row, result: outcome } };
}

/** Keep the newest `max` runs (the list is oldest first). */
export function capRuns(runs: TelemetryRun[], max: number = TELEMETRY_MAX): TelemetryRun[] {
  return runs.length > max ? runs.slice(runs.length - max) : runs;
}

/** Index of the newest unfinished record of this run (same seed, school and ability), or -1. */
export function findOpen(runs: TelemetryRun[], run: RunState): number {
  for (let i = runs.length - 1; i >= 0; i--) {
    const r = runs[i];
    if (!r.end && r.seed === run.seed && r.school === run.school && r.ability === run.ability) return i;
  }
  return -1;
}

export function loadTelemetry(): TelemetryRun[] {
  try {
    const raw = JSON.parse(localStorage.getItem(TELEMETRY_KEY) ?? 'null') as { runs?: unknown } | null;
    return Array.isArray(raw?.runs) ? (raw.runs as TelemetryRun[]).filter((r) => !!r && typeof r.seed === 'number') : [];
  } catch { return []; }
}

function saveTelemetry(runs: TelemetryRun[]): void {
  try { localStorage.setItem(TELEMETRY_KEY, JSON.stringify({ v: 1, runs: capRuns(runs) })); } catch { /* ignore */ }
}

/** Apply fn to the open record of this run (created on first use, so resumed runs work) and store it. */
export function updateTelemetry(run: RunState, fn: (t: TelemetryRun) => TelemetryRun): void {
  const runs = loadTelemetry();
  const i = findOpen(runs, run);
  if (i < 0) runs.push(fn(newTelemetryRun(run)));
  else runs[i] = fn(runs[i]);
  saveTelemetry(runs);
}

export function clearTelemetry(): void {
  try { localStorage.removeItem(TELEMETRY_KEY); } catch { /* ignore */ }
}

/** JSON text for the dev panel's export. */
export function exportTelemetry(): string {
  return JSON.stringify({ exportedAt: new Date().toISOString(), runs: loadTelemetry() }, null, 2);
}

// Convenience wrappers used by the screens (best effort: they never throw).

const safe = (fn: () => void): void => { try { fn(); } catch (e) { console.error(e); } };

export const logOffer = (run: RunState, rec: Omit<OfferRecord, 'act'>): void =>
  safe(() => updateTelemetry(run, (t) => recordOffer(t, { ...rec, act: run.act })));
export const logPurchase = (run: RunState, rec: Omit<PurchaseRecord, 'act'>): void =>
  safe(() => updateTelemetry(run, (t) => recordPurchase(t, { ...rec, act: run.act })));
export const logFusion = (run: RunState, rec: Omit<FusionRecord, 'act'>): void =>
  safe(() => updateTelemetry(run, (t) => recordFusion(t, { ...rec, act: run.act })));
export const logEnd = (run: RunState, outcome: RunOutcome, act: number, row: number): void =>
  safe(() => updateTelemetry(run, (t) => finishRun(t, run, outcome, act, row)));
