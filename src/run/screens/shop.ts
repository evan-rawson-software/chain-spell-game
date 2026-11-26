import { CATALOG } from '../../data/runes';
import { sfx } from '../../audio';
import type { App } from '../app';
import { floorDef } from '../floors';
import { nodeSeed, rollRewards } from '../rewards';
import { createRng } from '../rng';
import { applyReward, forgeRune, removeBoon, spendGold } from '../state';
import { boonChip, button, el, forgePreview, rowLabel, runePicker, runeCard, topBar } from '../ui';

export const RUNE_PRICE: Record<string, number> = { starter: 30, common: 30, uncommon: 50, rare: 80 };
export const FORGE_PRICE = 40;
export const CURSE_PRICE = 50;
export const SHOP_STOCK = 5;

type Service = null | 'forge' | 'curse';

export function shopScreen(app: App): void {
  app.save('shop');
  const node = app.node();
  if (!node) { app.goto.map(); return; }
  app.show((s) => {
    s.classList.add('rn-col');
    const stock = rollRewards(floorDef(node.row), createRng(nodeSeed(app.run.seed, node.id, 2)), SHOP_STOCK);
    let service: Service = null;
    let pendingForge: string | null = null;

    const body = el('div', 'rn-scroll', undefined, s);
    const price = (base: number): number => Math.round(base * app.totals().priceMul);

    const render = (): void => {
      s.querySelector('.rn-topbar')?.remove();
      const { bar, right } = topBar(app, s, `Shop - ${rowLabel(node.row)}`);
      s.insertBefore(bar, body);
      button('Leave shop', 'rn-btn primary big', () => app.leaveNode(), right);

      body.innerHTML = '';
      const box = el('div', 'rn-rewardbox', undefined, body);
      el('p', 'rn-sub', `Gold: ${app.run.gold}. Prices already include your blessings and curses.`, box);

      const cards = el('div', 'rn-cards', undefined, box);
      stock.forEach((r, i) => {
        const def = CATALOG[r.defId];
        if (!def) return;
        const sold = app.sold.includes(i);
        const card = runeCard(def, cards, 'div');
        card.classList.add('static');
        if (sold) card.classList.add('sold');
        const cost = price(RUNE_PRICE[def.rarity] ?? 30);
        const b = button(sold ? 'Sold' : `Buy ● ${cost}`, 'rn-btn rn-buy', () => {
          app.setRun(applyReward(spendGold(app.run, cost), r));
          app.sold = [...app.sold, i];
          app.save('shop');
          sfx('buy');
          render();
        }, card, 'coin');
        b.disabled = sold || app.run.gold < cost;
        if (!sold && app.run.gold < cost) b.title = 'Not enough gold';
      });

      const services = el('div', 'rn-services', undefined, box);
      const forgeable = app.run.owned.filter((o) => !o.plus && !!CATALOG[o.defId]);
      const curses = app.run.boons.map((id) => app.boons[id]).filter((b) => b?.kind === 'curse');
      const forgeCost = price(FORGE_PRICE);
      const curseCost = price(CURSE_PRICE);

      const forgeSvc = el('div', 'rn-service', undefined, services);
      el('div', 'rn-card-name', 'Forge a rune', forgeSvc);
      el('div', 'rn-card-desc', 'Upgrade one of your runes to its + version.', forgeSvc);
      const fb = button(`Forge ● ${forgeCost}`, 'rn-btn', () => { service = service === 'forge' ? null : 'forge'; pendingForge = null; render(); }, forgeSvc);
      fb.disabled = app.run.gold < forgeCost || forgeable.length === 0;
      if (forgeable.length === 0) fb.title = 'Every rune is already forged';
      else if (app.run.gold < forgeCost) fb.title = 'Not enough gold';

      const curseSvc = el('div', 'rn-service', undefined, services);
      el('div', 'rn-card-name', 'Remove a curse', curseSvc);
      el('div', 'rn-card-desc', curses.length ? 'Lift one curse from your run.' : 'You carry no curses.', curseSvc);
      const cb = button(`Remove ● ${curseCost}`, 'rn-btn', () => { service = service === 'curse' ? null : 'curse'; render(); }, curseSvc);
      cb.disabled = app.run.gold < curseCost || curses.length === 0;
      if (curses.length && app.run.gold < curseCost) cb.title = 'Not enough gold';

      if (service === 'forge' && forgeable.length) {
        const panel = el('div', 'rn-panel', undefined, box);
        el('div', 'rn-sub', `Choose a rune to forge (● ${forgeCost})`, panel);
        const inGraph = new Set(app.run.graph.nodes.map((n) => n.uid));
        runePicker(panel, forgeable, inGraph, pendingForge, (uid) => { pendingForge = uid; render(); });
        const target = forgeable.find((o) => o.uid === pendingForge);
        if (target) {
          forgePreview(target, panel);
          button(`Forge for ${forgeCost} gold`, 'rn-btn primary', () => {
            app.setRun(forgeRune(spendGold(app.run, forgeCost), target.uid));
            app.save('shop');
            sfx('forge');
            service = null;
            pendingForge = null;
            render();
          }, panel, 'buy');
        }
      }
      if (service === 'curse' && curses.length) {
        const panel = el('div', 'rn-panel', undefined, box);
        el('div', 'rn-sub', `Choose a curse to remove (● ${curseCost})`, panel);
        const row = el('div', 'rn-boons', undefined, panel);
        for (const c of curses) {
          const chip = boonChip(c, row);
          chip.classList.add('pickable');
          chip.textContent = `${c.name} - ${c.description}`;
          chip.addEventListener('click', () => {
            app.setRun(removeBoon(spendGold(app.run, curseCost), c.id));
            app.save('shop');
            sfx('buy');
            service = null;
            render();
          });
        }
      }
    };
    render();
  });
}
