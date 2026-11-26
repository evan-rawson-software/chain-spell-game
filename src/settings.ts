/**
 * Player settings (DESIGN.md, Settings). Any module may read them; the run module owns the
 * settings screen. Stored in localStorage; safe when storage is unavailable.
 */
export interface Settings {
  /** 0..1 */
  master: number;
  /** 0..1 */
  sfx: number;
  /** 0..1 */
  music: number;
  /** 0..1 screen shake strength multiplier (reduced-motion still scales it down further) */
  shake: number;
  /** damage-number size multiplier, 0.75..1.5 */
  numberSize: number;
  /** draw a shape per color on sockets and pips (COLOR_SHAPE) */
  colorblind: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8, sfx: 1, music: 0.6, shake: 1, numberSize: 1, colorblind: false,
};

const KEY = 'chain-spell-settings';
const listeners = new Set<(s: Settings) => void>();

function clamp(v: unknown, lo: number, hi: number, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
}

function sanitize(raw: Partial<Settings> | null | undefined): Settings {
  const r = raw ?? {};
  const d = DEFAULT_SETTINGS;
  return {
    master: clamp(r.master, 0, 1, d.master),
    sfx: clamp(r.sfx, 0, 1, d.sfx),
    music: clamp(r.music, 0, 1, d.music),
    shake: clamp(r.shake, 0, 1, d.shake),
    numberSize: clamp(r.numberSize, 0.75, 1.5, d.numberSize),
    colorblind: typeof r.colorblind === 'boolean' ? r.colorblind : d.colorblind,
  };
}

let current: Settings = (() => {
  try { return sanitize(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return { ...DEFAULT_SETTINGS }; }
})();

export function getSettings(): Settings { return current; }

export function setSettings(patch: Partial<Settings>): void {
  current = sanitize({ ...current, ...patch });
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* ignore */ }
  for (const fn of listeners) { try { fn(current); } catch (e) { console.error(e); } }
}

/** Subscribe to changes; returns an unsubscribe function. */
export function onSettings(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
