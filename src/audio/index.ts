/**
 * Sound effects and music. Every module plays sounds only through `sfx(name)` and `music(track)`.
 * Safe to call at any time: before audio is unlocked by a user gesture, while muted,
 * or before the files have loaded, sfx do nothing; music requests are remembered and start
 * once audio is unlocked and the track has loaded.
 */

import type { MusicTrack } from '../contracts';
import { getSettings, onSettings } from '../settings';

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
  | 'enemyDie' | 'bossDie' | 'enemyShoot' | 'wardHit' | 'waveStart'
  // reactions & big moments
  | 'reaction' | 'shatter' | 'multiKill' | 'bigHit'
  // map, shop, forge, shrine
  | 'mapStep' | 'coin' | 'buy' | 'forge' | 'blessing' | 'curse';

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

  // These reuse existing clips at other pitches/volumes (pass `pitch` for variety).
  reaction: { files: ['hit-arcane.ogg'], vol: 0.7, gap: 50, voices: 6, var: 0.1 },
  shatter: { files: ['freeze.wav'], vol: 0.8, gap: 60, voices: 4, var: 0.08 },
  multiKill: { files: ['reward-take.ogg'], vol: 0.6, gap: 250, voices: 1, var: 0 },
  bigHit: { files: ['explosion.wav'], vol: 0.8, gap: 120, voices: 2, var: 0.05 },
  mapStep: { files: ['rune-place.ogg'], vol: 0.7 },
  coin: { files: ['reward-select.ogg'], vol: 0.6, gap: 40, var: 0.15 },
  buy: { files: ['reward-take.ogg'], vol: 0.8 },
  forge: { files: ['explosion.wav'], vol: 0.5, var: 0 },
  blessing: { files: ['floor-clear.ogg'], vol: 0.7, var: 0 },
  curse: { files: ['run-defeat.ogg'], vol: 0.5, var: 0 },
};

const MUTE_KEY = 'chain-spell-muted';
const MUSIC_FADE = 1;
const MUSIC_VOL = 0.7;

let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* ignore */ }

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
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
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.connect(master);
      applyLevels();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    void loadAll();
    applyMusic();
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
  if (muted || !ctx || !sfxBus || ctx.state !== 'running') return;
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
    g.connect(sfxBus);
    active.set(name, (active.get(name) ?? 0) + 1);
    src.onended = () => {
      active.set(name, Math.max(0, (active.get(name) ?? 1) - 1));
      src.disconnect();
      g.disconnect();
    };
    src.start();
  } catch { /* ignore */ }
}

function applyLevels(): void {
  if (!ctx || !master || !sfxBus || !musicBus) return;
  const s = getSettings();
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(muted ? 0 : s.master, t, 0.02);
  sfxBus.gain.setTargetAtTime(s.sfx, t, 0.02);
  musicBus.gain.setTargetAtTime(s.music * MUSIC_VOL, t, 0.02);
}
onSettings(applyLevels);

// ---- music ----
let wanted: MusicTrack | null = null;
let playing: { track: MusicTrack; src: AudioBufferSourceNode; gain: GainNode } | null = null;
const trackBuffers = new Map<MusicTrack, AudioBuffer>();
const trackLoads = new Map<MusicTrack, Promise<AudioBuffer | null>>();

function loadTrack(track: MusicTrack): Promise<AudioBuffer | null> {
  const c = ctx;
  if (!c) return Promise.resolve(null);
  let p = trackLoads.get(track);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch(`./music/${track}.wav`);
        if (!res.ok) return null;
        const buf = await c.decodeAudioData(await res.arrayBuffer());
        trackBuffers.set(track, buf);
        return buf;
      } catch { return null; }
    })();
    trackLoads.set(track, p);
    void p.then((b) => { if (!b) trackLoads.delete(track); });
  }
  return p;
}

function fadeOutAndStop(p: NonNullable<typeof playing>): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  p.gain.gain.cancelScheduledValues(t);
  p.gain.gain.setValueAtTime(p.gain.gain.value, t);
  p.gain.gain.linearRampToValueAtTime(0, t + MUSIC_FADE);
  p.src.stop(t + MUSIC_FADE + 0.05);
  p.src.onended = () => { p.src.disconnect(); p.gain.disconnect(); };
}

function startTrack(track: MusicTrack, buf: AudioBuffer): void {
  if (!ctx || !musicBus) return;
  const old = playing;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const gain = ctx.createGain();
  const t = ctx.currentTime;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(1, t + MUSIC_FADE);
  src.connect(gain);
  gain.connect(musicBus);
  src.start();
  playing = { track, src, gain };
  if (old) fadeOutAndStop(old);
}

function applyMusic(): void {
  if (!ctx || ctx.state === 'closed') return;
  if (wanted === null) {
    if (playing) { fadeOutAndStop(playing); playing = null; }
    return;
  }
  if (playing?.track === wanted) return;
  const track = wanted;
  const ready = trackBuffers.get(track);
  if (ready) { startTrack(track, ready); return; }
  void loadTrack(track).then((buf) => {
    if (buf && wanted === track && playing?.track !== track) startTrack(track, buf);
  });
}

/** Play a looping music track (crossfaded); `null` fades out. Requesting the current track is a no-op. */
export function music(track: MusicTrack | null): void {
  if (track === wanted) return;
  wanted = track;
  try { applyMusic(); } catch { /* ignore */ }
}

export function setMuted(m: boolean): void {
  muted = m;
  applyLevels();
  try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* ignore */ }
}

export function isMuted(): boolean { return muted; }
