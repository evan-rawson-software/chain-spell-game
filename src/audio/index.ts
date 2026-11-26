/**
 * Sound effects. Every module plays sounds only through `sfx(name)`.
 * Safe to call at any time: before audio is unlocked by a user gesture, while muted,
 * or before the files have loaded, it does nothing.
 */

export type SfxName =
  // UI / run flow
  | 'uiClick' | 'uiHover' | 'uiConfirm' | 'uiBack' | 'uiError'
  | 'rewardSelect' | 'rewardTake' | 'floorClear' | 'runVictory' | 'runDefeat'
  // editor
  | 'runePick' | 'runePlace' | 'runeRemove' | 'undo'
  // battle
  | 'castCharged' | 'castFire' | 'shotFire' | 'shotFrost' | 'shotNature' | 'shotLightning'
  | 'shotArcane' | 'shotStorm' | 'shotPure' | 'hitFire' | 'hitFrost' | 'hitNature'
  | 'hitLightning' | 'hitArcane' | 'hitStorm' | 'hitPure' | 'explosion' | 'freeze'
  | 'enemyDie' | 'bossDie' | 'enemyShoot' | 'wardHit' | 'waveStart';

export interface SfxOptions {
  /** 0..1, multiplied with the master volume. */
  volume?: number;
  /** Playback-rate multiplier; small random variation is added by default. */
  pitch?: number;
}

interface Def {
  /** Clip variants (file names in public/sfx); one is picked at random per play. */
  files: string[];
  /** Base volume 0..1. */
  vol?: number;
  /** Minimum ms between plays of this name. */
  gap?: number;
  /** Max simultaneous voices of this name. */
  voices?: number;
  /** Random pitch variation (+/- fraction). Default 0.06. */
  var?: number;
}

const HIT = { gap: 40, voices: 8 };
const SHOT = { gap: 40, voices: 8 };

const DEFS: Record<SfxName, Def> = {
  uiClick: { files: ['ui-click-a.ogg', 'ui-click-b.ogg'], vol: 0.7, gap: 30 },
  uiHover: { files: ['ui-hover.ogg'], vol: 0.35, gap: 60 },
  uiConfirm: { files: ['ui-confirm.ogg'], vol: 0.8 },
  uiBack: { files: ['ui-back.ogg'], vol: 0.7 },
  uiError: { files: ['ui-error.ogg'], vol: 0.7 },
  rewardSelect: { files: ['reward-select.ogg'], vol: 0.8 },
  rewardTake: { files: ['reward-take.ogg'], vol: 0.9 },
  floorClear: { files: ['floor-clear.ogg'], vol: 0.8, var: 0 },
  runVictory: { files: ['run-victory.ogg'], vol: 0.9, var: 0 },
  runDefeat: { files: ['run-defeat.ogg'], vol: 0.9, var: 0 },

  runePick: { files: ['rune-pick.ogg'], vol: 0.7, gap: 30 },
  runePlace: { files: ['rune-place.ogg'], vol: 0.8, gap: 30 },
  runeRemove: { files: ['rune-remove.ogg'], vol: 0.7, gap: 30 },
  undo: { files: ['undo.ogg'], vol: 0.7, gap: 30 },

  castCharged: { files: ['cast-charged.ogg'], vol: 0.25, gap: 150, voices: 2 },
  castFire: { files: ['cast-fire.wav'], vol: 0.45, gap: 80, voices: 4 },
  shotFire: { files: ['shot-fire-a.wav', 'shot-fire-b.wav'], vol: 0.5, ...SHOT },
  shotFrost: { files: ['shot-frost-a.wav', 'shot-frost-b.wav'], vol: 0.5, ...SHOT },
  shotNature: { files: ['shot-nature.wav'], vol: 0.5, ...SHOT },
  shotLightning: { files: ['shot-lightning-a.wav', 'shot-lightning-b.wav'], vol: 0.45, ...SHOT },
  shotArcane: { files: ['shot-arcane.wav'], vol: 0.5, ...SHOT },
  shotStorm: { files: ['shot-storm.wav'], vol: 0.45, ...SHOT },
  shotPure: { files: ['shot-pure.wav'], vol: 0.5, ...SHOT },
  hitFire: { files: ['hit-fire.ogg'], vol: 0.6, ...HIT },
  hitFrost: { files: ['hit-frost.ogg'], vol: 0.6, ...HIT },
  hitNature: { files: ['hit-nature.ogg'], vol: 0.6, ...HIT },
  hitLightning: { files: ['hit-lightning.ogg'], vol: 0.5, ...HIT },
  hitArcane: { files: ['hit-arcane.ogg'], vol: 0.6, ...HIT },
  hitStorm: { files: ['hit-storm.ogg'], vol: 0.6, ...HIT },
  hitPure: { files: ['hit-pure.ogg'], vol: 0.6, ...HIT },
  explosion: { files: ['explosion.wav'], vol: 0.7, gap: 60, voices: 5 },
  freeze: { files: ['freeze.wav'], vol: 0.55, gap: 120, voices: 3 },
  enemyDie: { files: ['enemy-die.wav'], vol: 0.55, gap: 60, voices: 5 },
  bossDie: { files: ['boss-die.wav'], vol: 0.9, gap: 500, voices: 1 },
  enemyShoot: { files: ['enemy-shoot.wav'], vol: 0.4, gap: 80, voices: 4 },
  wardHit: { files: ['ward-hit.ogg'], vol: 0.8, gap: 90, voices: 3 },
  waveStart: { files: ['wave-start.ogg'], vol: 0.8, gap: 300, voices: 1, var: 0 },
};

const MUTE_KEY = 'chain-spell-muted';
const MASTER = 0.6;

let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* ignore */ }

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let unlockBound = false;
let loadStarted = false;
const buffers = new Map<string, AudioBuffer>();
const lastPlay = new Map<SfxName, number>();
const active = new Map<SfxName, number>();

async function loadAll(): Promise<void> {
  if (loadStarted || !ctx) return;
  loadStarted = true;
  const c = ctx;
  const files = new Set<string>();
  for (const d of Object.values(DEFS)) for (const f of d.files) files.add(f);
  await Promise.all([...files].map(async (f) => {
    try {
      const res = await fetch(`./sfx/${f}`);
      if (!res.ok) return;
      const data = await res.arrayBuffer();
      buffers.set(f, await c.decodeAudioData(data));
    } catch { /* missing or undecodable clip: stay silent */ }
  }));
}

function unlock(): void {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = MASTER;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    void loadAll();
  } catch { /* ignore */ }
}

function bindUnlock(): void {
  if (unlockBound || typeof window === 'undefined') return;
  unlockBound = true;
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
}
bindUnlock();

/** Play a sound effect. */
export function sfx(name: SfxName, opts: SfxOptions = {}): void {
  if (muted || !ctx || !master || ctx.state !== 'running') return;
  try {
    const def = DEFS[name];
    if (!def) return;
    const now = performance.now();
    if (def.gap && now - (lastPlay.get(name) ?? -1e9) < def.gap) return;
    if ((active.get(name) ?? 0) >= (def.voices ?? 8)) return;
    const buf = buffers.get(def.files[Math.floor(Math.random() * def.files.length)]);
    if (!buf) return;
    lastPlay.set(name, now);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const v = def.var ?? 0.06;
    src.playbackRate.value = (opts.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * v);
    const g = ctx.createGain();
    g.gain.value = (def.vol ?? 0.7) * Math.max(0, Math.min(1, opts.volume ?? 1));
    src.connect(g);
    g.connect(master);
    active.set(name, (active.get(name) ?? 0) + 1);
    src.onended = () => {
      active.set(name, Math.max(0, (active.get(name) ?? 1) - 1));
      src.disconnect();
      g.disconnect();
    };
    src.start();
  } catch { /* ignore */ }
}

export function setMuted(m: boolean): void {
  muted = m;
  try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* ignore */ }
}

export function isMuted(): boolean { return muted; }
