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

/** Play a sound effect. Stub: implemented in src/audio/. */
export function sfx(_name: SfxName, _opts: SfxOptions = {}): void {}

export function setMuted(_muted: boolean): void {}
export function isMuted(): boolean { return false; }
