/**
 * Module APIs. Each module implements its part; others import only these
 * entry points. Do not edit from inside a module; ask the orchestrator.
 *
 *   src/spell/index.ts   -> SpellEngine functions (named exports)
 *   src/data/runes.ts    -> `export const CATALOG: RuneCatalog`, `export const SOURCE_ID`,
 *                           `export const STARTER_KIT: string[]` (defIds, excluding Source),
 *                           `export function starterGraph(owned: RuneInstance[]): SpellGraph`
 *   src/editor/index.ts  -> `export const mountEditor: MountEditor`
 *   src/battle/index.ts  -> `export const mountBattle: MountBattle`
 *   src/run/index.ts     -> run flow + screens; `export function startApp(root: HTMLElement): void`
 *   src/audio/index.ts   -> `sfx(name, opts?)`, `setMuted`, `isMuted` (any module may play sounds)
 */
import type {
  BattleResult, CastPlan, Color, FloorDef, OutputRef, RuneCatalog, RuneDef, RuneInstance, SpellGraph,
} from './types';

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
  /** Resolve every terminal into a shot. Assumes a valid graph. */
  compileSpell(graph: SpellGraph, catalog: RuneCatalog): CastPlan;
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
  wardMaxHp: number;
  onEnd(result: BattleResult): void;
}

export interface BattleHandle {
  destroy(): void;
}

export type MountBattle = (container: HTMLElement, opts: BattleOptions) => BattleHandle;
