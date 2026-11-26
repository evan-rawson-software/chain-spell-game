/**
 * Module APIs. Each module implements its part; others import only these
 * entry points. Do not edit from inside a module; ask the orchestrator.
 *
 *   src/spell/index.ts   -> SpellEngine functions (named exports)
 *   src/data/runes.ts    -> `export const CATALOG: RuneCatalog`, `export const SOURCE_ID`, `ROOT_UID`,
 *                           `export const STARTER_KIT: string[]` (defIds, excluding Source),
 *                           `export function starterGraph(owned: RuneInstance[], schoolId?: string): SpellGraph`
 *                           (uses the school's kit; default = STARTER_KIT layout),
 *                           `runeTooltip(def)` (works on upgraded defs too)
 *   src/data/schools.ts  -> `export const SCHOOLS: SchoolDef[]`, `export const DEFAULT_SCHOOL: string`
 *   src/data/boons.ts    -> `export const BOONS: Record<string, BoonDef>`,
 *                           `export const NEUTRAL_MODS: BattleMods`,
 *                           `export function combineBoons(ids: string[]): BoonTotals`
 *   src/editor/index.ts  -> `export const mountEditor: MountEditor`
 *   src/battle/index.ts  -> `export const mountBattle: MountBattle`, `export const mountPractice: MountPractice`
 *   src/run/index.ts     -> run flow + screens; `export function startApp(root: HTMLElement): void`
 *   src/audio/index.ts   -> `sfx(name, opts?)`, `setMuted`, `isMuted` (any module may play sounds)
 */
import type {
  BattleMods, BattleResult, CastPlan, Color, FloorDef, Modifier, OutputRef, RuneCatalog, RuneDef, RuneInstance,
  SpellGraph,
} from './types';

// ---------------------------------------------------------------- data/boons.ts

/** Sum of every held boon's effects. */
export interface BoonTotals {
  spell: Modifier[];
  battle: BattleMods;
  wardHp: number;
  goldMul: number;
  priceMul: number;
  rewardOffer: number;
  manaGain: number;
}

// ---------------------------------------------------------------- spell/

export interface OpenOutput extends OutputRef {
  color: Color;
  level: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  manaUsed: number;
  castTime: number;
  /** uid -> level (root = 0) */
  levels: Record<string, number>;
}

/** A legal way to place `def`: for each input index, the outputs feeding it (several for a combined complex color). */
export interface Placement {
  inputs: OutputRef[][];
  level: number;
}

export interface SpellEngine {
  /** True if the OR of `parts`' bits equals `target` and every part is a non-empty, non-overlapping subset. */
  colorsCombine(parts: Color[], target: Color): boolean;
  /** Outputs on placed runes with nothing linked to them. */
  openOutputs(graph: SpellGraph, catalog: RuneCatalog): OpenOutput[];
  /** Every legal way to place `def` onto the current open outputs (all inputs from one level). */
  findPlacements(graph: SpellGraph, catalog: RuneCatalog, def: RuneDef): Placement[];
  /** Returns a new graph with `inst` added via `placement`. Throws if illegal. */
  placeRune(graph: SpellGraph, catalog: RuneCatalog, inst: RuneInstance, placement: Placement): SpellGraph;
  /** Returns a new graph with `uid` and all runes that depend on it removed. Root can't be removed. */
  removeRune(graph: SpellGraph, uid: string): SpellGraph;
  /** Structural + mana checks. */
  validateSpell(graph: SpellGraph, catalog: RuneCatalog, maxMana: number): ValidationResult;
  /** Resolve every terminal into a shot. Assumes a valid graph. `extraGlobals` (blessings/curses) apply to every shot like terminal globals. */
  compileSpell(graph: SpellGraph, catalog: RuneCatalog, extraGlobals?: Modifier[]): CastPlan;
  /** The forged ("+") version of a rune. Pure; see DESIGN.md, Forge. */
  upgradeDef(def: RuneDef): RuneDef;
  /** The def an instance resolves to (upgraded when `inst.plus`). Undefined if unknown. */
  defOf(catalog: RuneCatalog, inst: RuneInstance): RuneDef | undefined;
}

// ---------------------------------------------------------------- editor/

export interface EditorOptions {
  catalog: RuneCatalog;
  /** All owned runes (root excluded). Ones not in the graph are shown in the inventory. */
  owned: RuneInstance[];
  /** Root instance (Source) so the editor can resolve its def. */
  root: RuneInstance;
  graph: SpellGraph;
  maxMana: number;
  /** Blessing/curse spell mods, so the live stats match combat. */
  extraGlobals?: Modifier[];
  /** Called with the new graph after every edit. */
  onChange(graph: SpellGraph): void;
}

export interface EditorHandle {
  destroy(): void;
}

export type MountEditor = (container: HTMLElement, opts: EditorOptions) => EditorHandle;

// ---------------------------------------------------------------- battle/

export interface BattleOptions {
  plan: CastPlan;
  /** The spell the plan was compiled from, shown as a live strip during combat. */
  graph: SpellGraph;
  catalog: RuneCatalog;
  floor: FloorDef;
  /** Effective max ward HP (base + boons). */
  wardMaxHp: number;
  /** Blessing/curse battle mods; defaults to neutral. */
  mods?: BattleMods;
  onEnd(result: BattleResult): void;
}

export interface BattleHandle {
  destroy(): void;
  /** Dev tools (?dev): end the fight now, or change the game speed (1 = normal). */
  debug?: { win(): void; lose(): void; setSpeed(x: number): void };
}

export type MountBattle = (container: HTMLElement, opts: BattleOptions) => BattleHandle;

/** Practice range: the spell auto-fires at training dummies; nothing attacks, nothing ends. */
export interface PracticeOptions {
  plan: CastPlan;
  graph: SpellGraph;
  catalog: RuneCatalog;
}

export interface PracticeHandle {
  /** Swap in a recompiled spell (called on every editor change). */
  setSpell(plan: CastPlan, graph: SpellGraph): void;
  destroy(): void;
}

export type MountPractice = (container: HTMLElement, opts: PracticeOptions) => PracticeHandle;
