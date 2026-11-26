import { CATALOG } from '../../data/runes';
import { sfx } from '../../audio';
import type { App } from '../app';
import { treasureOffers } from '../rewards';
import { applyReward } from '../state';
import { logOffer } from '../telemetry';
import { button, el, rowLabel, runeCard } from '../ui';

export function treasureScreen(app: App): void {
  app.save('treasure');
  const node = app.node();
  if (!node) { app.goto.map(); return; }
  app.show((s) => {
    s.classList.add('rn-center');
    const offers = treasureOffers(app.run.seed, node.id);
    const box = el('div', 'rn-rewardbox', undefined, s);
    el('h2', 'rn-h2', `Treasure - ${rowLabel(node.row, app.run.act)}`, box);
    el('p', 'rn-sub', 'Take one rare rune. Keystones change a combat rule instead of adding numbers.', box);
    const cards = el('div', 'rn-cards', undefined, box);
    let pick = -1;
    const els: HTMLElement[] = [];
    const refresh = (): void => {
      els.forEach((c, i) => { c.classList.toggle('selected', i === pick); c.setAttribute('aria-pressed', String(i === pick)); });
      take.disabled = pick < 0;
    };
    offers.forEach((r, i) => {
      const def = CATALOG[r.defId];
      if (!def) return;
      const c = runeCard(def, cards);
      el('span', 'rn-check', '✓', c);
      els[i] = c;
      c.addEventListener('click', () => { sfx('rewardSelect'); pick = i; refresh(); });
    });
    const actions = el('div', 'rn-actions', undefined, box);
    const take = button('Take rune', 'rn-btn primary big', () => {
      if (pick < 0) return;
      logOffer(app.run, { source: 'treasure', row: node.row, offered: offers.map((o) => o.defId), taken: [offers[pick].defId] });
      app.setRun(applyReward(app.run, offers[pick]));
      app.leaveNode();
    }, actions, 'rewardTake');
    button('Leave', 'rn-btn', () => app.leaveNode(), actions);
    refresh();
  });
}
