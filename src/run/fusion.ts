import type { FusionRecipe } from '../contracts';
import { FUSIONS } from '../data/fusions';
import { CATALOG } from '../data/runes';
import type { RunState, RuneDef, RuneInstance } from '../types';
import { applyReward, allLoadouts } from './state';
import { dropRune } from './trade';

/** Gold the Alchemist event charges per fusion. */
export const ALCHEMIST_COST = 20;

export interface RecipeStatus {
  recipe: FusionRecipe;
  /** you own at least one copy of the ingredient(s): the result is revealed */
  known: boolean;
  /** both ingredients can be taken from your runes (two copies when a === b) */
  craftable: boolean;
  /** the result def, if the catalog has it */
  result?: RuneDef;
}

/** Copy of `defId` to consume: prefers runes outside every spell, then unforged ones. */
function pickCopy(run: RunState, defId: string, exclude?: string): RuneInstance | undefined {
  const placed = new Set<string>();
  for (const g of allLoadouts(run)) for (const n of g?.nodes ?? []) placed.add(n.uid);
  const copies = run.owned.filter((o) => o.defId === defId && o.uid !== exclude);
  const score = (o: RuneInstance): number => (placed.has(o.uid) ? 2 : 0) + (o.plus ? 1 : 0);
  return copies.sort((x, y) => score(x) - score(y))[0];
}

/** The two runes a fusion would consume, or null when you lack an ingredient. */
export function ingredients(run: RunState, recipe: FusionRecipe): [RuneInstance, RuneInstance] | null {
  const a = pickCopy(run, recipe.a);
  if (!a) return null;
  const b = pickCopy(run, recipe.b, a.uid);
  return b ? [a, b] : null;
}

export function recipeStatus(run: RunState, recipe: FusionRecipe): RecipeStatus {
  const owns = (id: string): boolean => run.owned.some((o) => o.defId === id);
  const known = owns(recipe.a) && owns(recipe.b);
  const result = CATALOG[recipe.result];
  return { recipe, known, craftable: !!result && ingredients(run, recipe) !== null, result };
}

export function recipeBook(run: RunState, recipes: FusionRecipe[] = FUSIONS): RecipeStatus[] {
  return recipes.map((r) => recipeStatus(run, r));
}

export function craftableRecipes(run: RunState, recipes: FusionRecipe[] = FUSIONS): FusionRecipe[] {
  return recipeBook(run, recipes).filter((s) => s.craftable).map((s) => s.recipe);
}

/** How many runes would leave the active spell if this fusion were made (ingredients + their dependents). */
export function fusionCut(run: RunState, recipe: FusionRecipe): number {
  const pair = ingredients(run, recipe);
  if (!pair) return 0;
  const first = dropRune(run, pair[0].uid);
  const second = dropRune(first.run, pair[1].uid);
  return first.cut.length + second.cut.length;
}

/** Whether either ingredient is placed in the active spell. */
export function fusionTouchesSpell(run: RunState, recipe: FusionRecipe): boolean {
  const pair = ingredients(run, recipe);
  return !!pair && pair.some((p) => run.graph.nodes.some((n) => n.uid === p.uid));
}

/**
 * Consume one copy of each ingredient (removing them from the spell and every loadout) and add the result.
 * Returns null when the recipe isn't craftable.
 */
export function fuse(run: RunState, recipe: FusionRecipe): { run: RunState; result: RuneDef; cut: RuneInstance[]; used: [RuneInstance, RuneInstance] } | null {
  const result = CATALOG[recipe.result];
  const pair = ingredients(run, recipe);
  if (!result || !pair) return null;
  const first = dropRune(run, pair[0].uid);
  const second = dropRune(first.run, pair[1].uid);
  const next = applyReward(second.run, { kind: 'rune', defId: result.id });
  return { run: next, result, cut: [...first.cut, ...second.cut], used: pair };
}
