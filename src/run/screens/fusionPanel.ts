import { sfx } from '../../audio';
import type { FusionRecipe } from '../../contracts';
import { CATALOG } from '../../data/runes';
import { FUSIONS } from '../../data/fusions';
import type { RuneInstance } from '../../types';
import type { App } from '../app';
import { fuse, fusionCut, ingredients, recipeBook } from '../fusion';
import { isPlaced } from '../trade';
import { button, el, runeCard } from '../ui';

export interface FusionPanelOpts {
  /** gold charged per fusion (Alchemist); 0 at the forge */
  cost?: number;
  /** called after the fusion was applied to app.run */
  onFused(recipe: FusionRecipe, result: NonNullable<ReturnType<typeof fuse>>): void;
}

const nameOf = (id: string): string => CATALOG[id]?.name ?? id;

/** The recipe book: every fusion, the result hidden ("???") until you own both ingredients; craftable ones can be fused. */
export function fusionPanel(app: App, parent: HTMLElement, opts: FusionPanelOpts): void {
  const cost = opts.cost ?? 0;
  const root = el('div', 'rn-recipebook', undefined, parent);
  let confirming: number | null = null;

  const render = (): void => {
    root.innerHTML = '';
    const run = app.run;
    const book = recipeBook(run, FUSIONS);
    if (cost > 0) el('p', 'rn-sub', `Each fusion costs ${cost} gold. You have ${run.gold}.`, root);
    const list = el('div', 'rn-recipes', undefined, root);
    book.forEach((st, i) => {
      const r = st.recipe;
      const row = el('div', `rn-recipe${st.craftable ? ' craftable' : ''}${st.known ? ' known' : ''}`, undefined, list);
      const ing = el('div', 'rn-recipe-ing', undefined, row);
      [r.a, r.b].forEach((id, k) => {
        const have = run.owned.filter((o) => o.defId === id).length;
        const chip = el('span', `rn-chip ${have ? 'have' : 'missing'}`, `${nameOf(id)}${have ? ` x${have}` : ''}`, ing);
        chip.title = have ? 'You own this rune' : 'You do not own this rune yet';
        if (k === 0) el('span', 'rn-plus', '+', ing);
      });
      el('span', 'rn-forgearrow', '→', row);
      const out = el('div', 'rn-recipe-out', undefined, row);
      if (st.known && st.result) {
        const card = runeCard(st.result, out, 'div');
        card.classList.add('static', 'compact');
      } else {
        el('div', 'rn-recipe-hidden', '???', out);
        el('div', 'rn-note', 'Own both ingredients to reveal', out);
      }
      const act = el('div', 'rn-recipe-act', undefined, row);
      if (confirming === i && st.craftable) {
        const pair = ingredients(run, r) as [RuneInstance, RuneInstance];
        const inActive = pair.filter((p) => run.graph.nodes.some((n) => n.uid === p.uid));
        const cut = fusionCut(run, r);
        const other = pair.some((p) => isPlaced(run, p.uid)) && inActive.length === 0;
        el('div', 'rn-warn', inActive.length
          ? `Warning: ${inActive.map((p) => nameOf(p.defId)).join(' and ')} ${inActive.length > 1 ? 'are' : 'is'} in your spell. Fusing removes ${cut} rune${cut === 1 ? '' : 's'} (including dependents) from it.`
          : other ? 'Warning: an ingredient is saved in another spell slot and will be removed from it.' : '', act);
        button('Fuse anyway', 'rn-btn primary', () => doFuse(i), act, 'forge');
        button('Cancel', 'rn-btn', () => { confirming = null; render(); }, act, 'uiBack');
        return;
      }
      const b = button(cost ? `Fuse ● ${cost}` : 'Fuse', 'rn-btn primary', () => {
        const pair = ingredients(app.run, r);
        const placed = !!pair && pair.some((p) => isPlaced(app.run, p.uid));
        if (placed) { confirming = i; render(); } else doFuse(i);
      }, act, 'forge');
      b.disabled = !st.craftable || run.gold < cost;
      b.title = !st.craftable ? 'You need one copy of each ingredient' : run.gold < cost ? 'Not enough gold' : 'Consume both ingredients and create the fused rune';
    });
  };

  const doFuse = (i: number): void => {
    const r = FUSIONS[i];
    const res = fuse(app.run, r);
    if (!res) return;
    app.setRun({ ...res.run, gold: res.run.gold - (opts.cost ?? 0) });
    sfx('forge');
    opts.onFused(r, res);
  };

  render();
}
