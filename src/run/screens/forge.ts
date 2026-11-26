import { sfx } from '../../audio';
import type { App } from '../app';
import { forgeRune } from '../state';
import { button, el, forgePreview, rowLabel, runePicker } from '../ui';

export function forgeScreen(app: App): void {
  app.save('forge');
  const node = app.node();
  if (!node) { app.goto.map(); return; }
  app.show((s) => {
    s.classList.add('rn-center');
    const box = el('div', 'rn-rewardbox', undefined, s);
    el('h2', 'rn-h2', `Forge - ${rowLabel(node.row)}`, box);
    const candidates = app.run.owned.filter((o) => !o.plus);
    el('p', 'rn-sub', candidates.length
      ? 'Choose one rune to upgrade for free. A rune can be forged once.'
      : 'Every rune you own is already forged.', box);
    const inGraph = new Set(app.run.graph.nodes.map((n) => n.uid));
    let selected: string | null = null;
    const holder = el('div', 'rn-forgeholder', undefined, box);
    const actions = el('div', 'rn-actions', undefined, box);

    const render = (): void => {
      holder.innerHTML = '';
      actions.innerHTML = '';
      if (candidates.length) runePicker(holder, candidates, inGraph, selected, (uid) => { selected = uid; render(); });
      const target = candidates.find((c) => c.uid === selected);
      if (target) forgePreview(target, holder);
      if (target) {
        button('Forge this rune', 'rn-btn primary big', () => {
          app.setRun(forgeRune(app.run, target.uid));
          sfx('forge');
          app.leaveNode();
        }, actions, 'forge');
      }
      button('Leave without forging', 'rn-btn', () => app.leaveNode(), actions);
    };
    render();
  });
}
