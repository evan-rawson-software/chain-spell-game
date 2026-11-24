/**
 * Shared contract between all modules. See DESIGN.md for the rules.
 * Modules: spell/ (engine), data/ (rune catalog), editor/ (rune editor UI),
 * battle/ (real-time arena), run/ (floors, rewards, screen flow).
 *
 * Do not change this file from inside a module; ask the orchestrator.
 */

// ---------------------------------------------------------------- Colors

/** Primary: R, G, B. Complex: Y = R+G, P = R+B, T = G+B, W = R+G+B. */
export type Color = 'R' | 'G' | 'B' | 'Y' | 'P' | 'T' | 'W';

/** Bitmask form of a color: R=1, G=2, B=4. Complex colors are ORs of primaries. */
export const COLOR_BITS: Record<Color, number> = { R: 1, G: 2, B: 4, Y: 3, P: 5, T: 6, W: 7 };

export const COLOR_HEX: Record<Color, string> = {
  R: '#e5484d', G: '#46a758', B: '#3e83f7', Y: '#f5c518', P: '#9b5de5', T: '#14b8a6', W: '#f1f1f1',
};

// ---------------------------------------------------------------- Elements & statuses

export type Element = 'fire' | 'frost' | 'nature' | 'lightning' | 'arcane' | 'storm' | 'pure';

export type StatusKind =
  | 'burn'   // damage over time; potency = damage per second
  | 'poison' // stacking damage over time; potency = dps per stack, stacks add up
  | 'slow'   // movement slow; potency = fraction 0..1
  | 'freeze' // full stop; potency ignored
  | 'wet'    // lightning hits on a wet enemy deal +potency fraction bonus damage
  | 'weaken';// enemy takes +potency fraction more damage from all sources

export interface StatusApplication {
  kind: StatusKind;
  potency: number;
  /** seconds */
  duration: number;
}

// ---------------------------------------------------------------- Modifiers

/** Per-shot stats a modifier can touch. */
export type ShotStat =
  | 'damage'
  | 'speed'          // px/s
  | 'aoeRadius'      // px, 0 = single target
  | 'count'          // number of projectiles in the shot
  | 'spreadDeg'      // fan angle when count > 1
  | 'pierce'         // extra enemies passed through
  | 'homing'         // turn rate, 0 = none (radians/s)
  | 'chain'          // extra jumps to nearby enemies after hit
  | 'statusPotency'  // scales potency of all statuses on the shot
  | 'statusDuration';// scales duration of all statuses on the shot

/** Spell-wide stats. */
export type SpellStat = 'castTime' | 'manaCost';

export type ModOp =
  | 'flat'      // added to the base value
  | 'increased' // summed with other 'increased' on the same stat, then applied as (1 + sum)
  | 'more';     // multiplied: value 0.5 means x1.5, -0.2 means x0.8

export interface Modifier {
  stat: ShotStat | SpellStat;
  op: ModOp;
  value: number;
  /** Only applies to shots of this element. */
  element?: Element;
}

// ---------------------------------------------------------------- Runes

export type Rarity = 'starter' | 'common' | 'uncommon' | 'rare';

/** Base stats of a terminal rune's shot. */
export interface ShotBase {
  element: Element;
  damage: number;
  speed: number;
  /** projectile body radius in px (visual + collision) */
  size: number;
  aoeRadius: number;
  count: number;
  spreadDeg: number;
  pierce: number;
  homing: number;
  chain: number;
  statuses: StatusApplication[];
}

export interface RuneDef {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  /** At least 1, except the Source rune (0). Terminals may have several. */
  inputs: Color[];
  /** 0..2 */
  outputs: Color[];
  mana: number;
  /** seconds added to the spell's cast time (may be negative) */
  castTime: number;
  /** Branching runes: modifiers applied to every descendant terminal. 'manaCost' flat mods reduce descendants' mana. */
  augments?: Modifier[];
  /** Terminal runes (0 outputs): the shot this rune fires. Omit for pure "global" terminals. */
  shot?: ShotBase;
  /** Terminal runes only: modifiers applied to EVERY shot in the spell, plus spell-wide stats. */
  globals?: Modifier[];
}

export type RuneCatalog = Record<string, RuneDef>;

// ---------------------------------------------------------------- Spell graph

/** A specific owned copy of a rune. */
export interface RuneInstance {
  uid: string;
  defId: string;
}

/** Points at an output socket of a placed rune. */
export interface OutputRef {
  uid: string;
  output: number;
}

/**
 * One link feeds one output into one input. A complex-color input fed by a
 * combination of primaries has several links pointing at the same (toUid, toInput).
 */
export interface Link {
  from: OutputRef;
  toUid: string;
  toInput: number;
}

export interface SpellGraph {
  rootUid: string;
  /** Placed runes, including the root. Order within a level = left-to-right display order. */
  nodes: RuneInstance[];
  links: Link[];
}

// ---------------------------------------------------------------- Compiled spell

/** A fully resolved shot (terminal rune with all augments + globals applied). */
export interface ResolvedShot extends Omit<ShotBase, 'count'> {
  count: number;
  sourceUid: string;
  runeName: string;
}

export interface CastPlan {
  /** seconds to charge between casts (min 0.15) */
  castTime: number;
  manaUsed: number;
  /** In firing order (depth-first, left-to-right). */
  shots: ResolvedShot[];
  /** seconds between consecutive shots in one cast */
  stagger: number;
}

// ---------------------------------------------------------------- Encounters

export type EnemyKind = 'grunt' | 'runner' | 'brute' | 'archer' | 'shaman' | 'elite_knight' | 'boss_lich';

export interface SpawnGroup {
  kind: EnemyKind;
  count: number;
  /** seconds after wave start for the first spawn */
  at: number;
  /** seconds between spawns in this group */
  interval: number;
}

export interface WaveDef {
  groups: SpawnGroup[];
}

export interface FloorDef {
  floor: number; // 1-based
  kind: 'normal' | 'elite' | 'boss';
  waves: WaveDef[];
  /** enemy HP multiplier for scaling */
  hpScale: number;
}

export interface BattleResult {
  won: boolean;
  kills: number;
  damageTaken: number;
  durationSec: number;
}

// ---------------------------------------------------------------- Run state

export interface RunState {
  floor: number; // next floor to play, 1-based
  /** Every rune the player owns (not including the root Source). */
  owned: RuneInstance[];
  /** Current spell. Nodes other than the root must be uids from `owned`. */
  graph: SpellGraph;
  maxMana: number;
  wizardMaxHp: number;
  seed: number;
}

export type Reward =
  | { kind: 'rune'; defId: string }
  | { kind: 'maxMana'; amount: number };
