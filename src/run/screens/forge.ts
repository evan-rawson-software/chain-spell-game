import { sfx } from '../../audio';
import type { App } from '../app';
import { forgeRune } from '../state';
import { logFusion } from '../telemetry';
import { runeLabel } from '../trade';
import { button, el, forgePreview, rowLabel, runePicker } from '../ui';
import { fusionPanel } from './fusionPanel';

type Mode = 'upgrade' | 'fuse';

export function forgeScreen(app: App, startMode: Mode = 'upgrade'): void {
  app.save('forge');
  const node = app.node();
  if (!node) { app.goto.map(); return; }
  app.show((s) => {
    s.classList.add('rn-center');
    const box = el('div', 'rn-rewardbox', undefined, s);
    el('h2', 'rn-h2', `Forge - ${rowLabel(node.row, app.run.act)}`, box);
    const candidates = app.run.owned.filter((o) => !o.plus);
    const tabs = el('div', 'rn-row rn-tabs', undefined, box);
    const sub = el('p', 'rn-sub', '', box);
    const inGraph = new Set(app.run.graph.nodes.map((n) => n.uid));
    let selected: string | null = null;
    let mode: Mode = startMode;
    const holder = el('div', 'rn-forgeholder', undefined, box);
    const actions = el('div', 'rn-actions', undefined, box);

    const render = (): void => {
      holder.innerHTML = '';
      actions.innerHTML = '';
      tabs.innerHTML = '';
      if (app.ns.outcome) {
        // A fusion already happened at this forge (kept in node state so a reload doesn't allow a second one).
        sub.textContent = '';
        const out = el('div', 'rn-outcome', undefined, holder);
        el('div', 'head', 'Fused', out);
        for (const l of app.ns.outcome) el('div', undefined, l, out);
        button('Continue', 'rn-btn primary big', () => app.leaveNode(), actions);
        return;
      }
      for (const [m, label] of [['upgrade', 'Upgrade'], ['fuse', 'Fuse']] as [Mode, string][]) {
        const t = button(label, `rn-btn rn-tab${mode === m ? ' active' : ''}`, () => { mode = m; selected = null; render(); }, tabs);
        t.setAttribute('aria-pressed', String(mode === m));
      }
      if (mode === 'fuse') {
        sub.textContent = 'Fuse two runes into one fused rune. Each ingredient is used up. Results stay hidden until you own both ingredients.';
        fusionPanel(app, holder, {
          onFused: (recipe, res) => {
            logFusion(app.run, { row: node.row, a: recipe.a, b: recipe.b, result: recipe.result, gold: 0 });
            const lines = [`${runeLabel(res.used[0])} and ${runeLabel(res.used[1])} fused into ${res.result.name}.`];
            if (res.cut.length) lines.push(`${res.cut.length} rune${res.cut.length === 1 ? '' : 's'} left your spell.`);
            app.ns = { ...app.ns, outcome: lines };
            app.save('forge');
            render();
          },
        });
        button('Leave without fusing', 'rn-btn', () => app.leaveNode(), actions);
        return;
      }
      sub.textContent = candidates.length
        ? 'Choose one rune to upgrade for free. A rune can be forged once.'
        : 'Every rune you own is already forged.';
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
