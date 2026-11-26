import { CATALOG, SOURCE_ID } from '../../data/runes';
import { sfx } from '../../audio';
import type { App } from '../app';
import { nodeSeed, rollBoons } from '../rewards';
import { createRng } from '../rng';
import { addBoon, addGold, applyReward } from '../state';
import { boonCard, button, el, rowLabel, runeCard } from '../ui';

export const BARGAIN_GOLD = 40;

export function shrineScreen(app: App): void {
  app.save('shrine');
  const node = app.node();
  if (!node) { app.goto.map(); return; }
  app.show((s) => {
    s.classList.add('rn-center');
    const totals = app.totals();
    const rng = createRng(nodeSeed(app.run.seed, node.id, 3));
    const blessings = rollBoons('blessing', app.run.boons, rng, 2);
    const curse = rollBoons('curse', app.run.boons, rng, 1)[0];
    const rares = Object.values(CATALOG).filter((d) => d.rarity === 'rare' && d.id !== SOURCE_ID);
    const rare = rares.length ? rng.pick(rares) : undefined;
    const gold = Math.round(BARGAIN_GOLD * totals.goldMul);

    const box = el('div', 'rn-rewardbox', undefined, s);
    el('h2', 'rn-h2', `Shrine - ${rowLabel(node.row)}`, box);
    el('p', 'rn-sub', 'Accept a blessing, or strike a Dark Bargain.', box);
    const cards = el('div', 'rn-cards', undefined, box);
    for (const b of blessings) {
      const c = boonCard(b, cards);
      c.addEventListener('click', () => {
        sfx('blessing');
        app.setRun(addBoon(app.run, b.id));
        app.leaveNode();
      });
    }

    const bargain = el('div', 'rn-card rn-bargain', undefined, cards);
    el('div', 'rn-card-name', 'Dark Bargain', bargain);
    el('div', 'rn-card-rarity', 'Risk and reward', bargain);
    const gives = el('div', 'rn-bargain-list', undefined, bargain);
    if (curse) {
      const row = el('div', 'rn-bargain-row bad', undefined, gives);
      el('strong', undefined, `Curse: ${curse.name}`, row);
      el('span', undefined, curse.description, row);
    }
    if (rare) {
      const row = el('div', 'rn-bargain-row good', undefined, gives);
      el('strong', undefined, `Rune: ${rare.name} (rare)`, row);
      const mini = el('div', 'rn-bargain-rune', undefined, row);
      runeCard(rare, mini, 'div').classList.add('static');
    }
    el('div', 'rn-bargain-row good', `+${gold} gold`, gives);
    button('Take the bargain', 'rn-btn danger solid', () => {
      sfx('curse');
      let run = app.run;
      if (curse) run = addBoon(run, curse.id);
      if (rare) run = applyReward(run, { kind: 'rune', defId: rare.id });
      run = addGold(run, BARGAIN_GOLD, totals);
      app.setRun(run);
      app.leaveNode();
    }, bargain, 'curse');

    const actions = el('div', 'rn-actions', undefined, box);
    button('Leave', 'rn-btn', () => app.leaveNode(), actions);
  });
}
