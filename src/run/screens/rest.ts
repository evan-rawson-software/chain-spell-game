import { sfx } from '../../audio';
import type { App } from '../app';
import { forgeRune } from '../state';
import { button, el, forgePreview, rowLabel, runePicker } from '../ui';

export const REST_HP = 10;

export function restScreen(app: App): void {
  app.save('rest');
  const node = app.node();
  if (!node) { app.goto.map(); return; }
  app.show((s) => {
    s.classList.add('rn-center');
    const box = el('div', 'rn-rewardbox', undefined, s);
    el('h2', 'rn-h2', `Rest - ${rowLabel(node.row)}`, box);
    el('p', 'rn-sub', 'A quiet clearing. Choose how to spend the time.', box);
    const candidates = app.run.owned.filter((o) => !o.plus);
    const inGraph = new Set(app.run.graph.nodes.map((n) => n.uid));
    let forging = false;
    let selected: string | null = null;
    const holder = el('div', 'rn-forgeholder', undefined, box);
    const actions = el('div', 'rn-actions', undefined, box);

    const render = (): void => {
      holder.innerHTML = '';
      actions.innerHTML = '';
      if (!forging) {
        button(`Rest: +${REST_HP} max ward HP (now ${app.run.wardMaxHp})`, 'rn-btn primary big', () => {
          app.setRun({ ...app.run, wardMaxHp: app.run.wardMaxHp + REST_HP });
          sfx('blessing');
          app.leaveNode();
        }, actions);
        const f = button('Forge a rune for free', 'rn-btn big', () => { forging = true; selected = null; render(); }, actions);
        f.disabled = candidates.length === 0;
        if (!candidates.length) f.title = 'Every rune is already forged';
        button('Leave', 'rn-btn', () => app.leaveNode(), actions);
        return;
      }
      runePicker(holder, candidates, inGraph, selected, (uid) => { selected = uid; render(); });
      const target = candidates.find((c) => c.uid === selected);
      if (target) {
        forgePreview(target, holder);
        button('Forge this rune', 'rn-btn primary big', () => {
          app.setRun(forgeRune(app.run, target.uid));
          sfx('forge');
          app.leaveNode();
        }, actions, 'forge');
      }
      button('Back', 'rn-btn', () => { forging = false; render(); }, actions, 'uiBack');
    };
    render();
  });
}
