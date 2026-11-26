import { CATALOG } from '../../data/runes';
import { sfx } from '../../audio';
import type { App } from '../app';
import { floorDef } from '../floors';
import { nodeSeed, rollRewards } from '../rewards';
import { createRng } from '../rng';
import { applyReward, forgeRune, removeBoon, spendGold } from '../state';
import { boonChip, button, el, forgePreview, rowLabel, runePicker, runePickerMulti, runeCard, topBar } from '../ui';
import type { RuneInstance } from '../../types';
import { cutCount, dropRune, instTier, runeLabel, sellRune, sellValue, transmute } from '../trade';

export const RUNE_PRICE: Record<string, number> = { starter: 30, common: 30, uncommon: 50, rare: 80 };
export const FORGE_PRICE = 40;
export const CURSE_PRICE = 50;
export const SHOP_STOCK = 5;

type Service = null | 'forge' | 'curse' | 'sell' | 'transmute';

export function shopScreen(app: App): void {
  app.save('shop');
  const node = app.node();
  if (!node) { app.goto.map(); return; }
  app.show((s) => {
    s.classList.add('rn-col');
    const stock = rollRewards(floorDef(node.row), createRng(nodeSeed(app.run.seed, node.id, 2)), SHOP_STOCK);
    let service: Service = null;
    let pendingForge: string | null = null;
    let pendingSell: string | null = null;
    let pendingTrans: string[] = [];
    let message: string | null = null;

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
      if (message) el('div', 'rn-managain', message, box);

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

      const sellSvc = el('div', 'rn-service', undefined, services);
      el('div', 'rn-card-name', 'Sell a rune', sellSvc);
      el('div', 'rn-card-desc', 'Common 15, uncommon 25, rare 40 gold; +10 if forged.', sellSvc);
      button('Sell...', 'rn-btn', () => { service = service === 'sell' ? null : 'sell'; pendingSell = null; render(); }, sellSvc)
        .disabled = app.run.owned.length === 0;

      const transSvc = el('div', 'rn-service', undefined, services);
      el('div', 'rn-card-name', 'Transmute runes', transSvc);
      el('div', 'rn-card-desc', 'Merge two runes of the same rarity into a random rune one rarity higher (two rares: a random rare or keystone). Free.', transSvc);
      const tb = button('Transmute...', 'rn-btn', () => { service = service === 'transmute' ? null : 'transmute'; pendingTrans = []; render(); }, transSvc);
      tb.disabled = !hasPair(app.run.owned);

      const inGraphAll = new Set(app.run.graph.nodes.map((n) => n.uid));
      if (service === 'sell' && app.run.owned.length) {
        const panel = el('div', 'rn-panel', undefined, box);
        el('div', 'rn-sub', 'Choose a rune to sell', panel);
        runePicker(panel, app.run.owned, inGraphAll, pendingSell, (uid) => { pendingSell = uid; render(); });
        const target = app.run.owned.find((o) => o.uid === pendingSell);
        if (target) {
          const cut = inGraphAll.has(target.uid) ? cutCount(app.run, target.uid) : 0;
          if (cut > 0) {
            el('div', 'rn-warn', cut > 1
              ? `Warning: this rune is in your spell. Selling it removes it and ${cut - 1} rune${cut === 2 ? ' that depends' : 's that depend'} on it from the spell (they stay in your inventory).`
              : 'Warning: this rune is in your spell. Selling it removes it from the spell.', panel);
          }
          button(`Sell ${runeLabel(target)} for ${sellValue(target)} gold`, 'rn-btn primary', () => {
            const res = sellRune(app.run, target.uid);
            if (!res) return;
            app.setRun(res.run);
            app.save('shop');
            sfx('buy');
            message = `Sold ${runeLabel(target)} for ${res.gold} gold.`;
            service = null;
            pendingSell = null;
            render();
          }, panel, 'coin');
        }
      }
      if (service === 'transmute') {
        const panel = el('div', 'rn-panel', undefined, box);
        el('div', 'rn-sub', 'Choose two runes of the same rarity', panel);
        const first = app.run.owned.find((o) => o.uid === pendingTrans[0]);
        runePickerMulti(panel, app.run.owned, inGraphAll, pendingTrans,
          (inst) => pendingTrans.length < 2 && (!first || instTier(inst) === instTier(first)),
          (uid) => { pendingTrans = pendingTrans.includes(uid) ? pendingTrans.filter((u) => u !== uid) : [...pendingTrans, uid]; render(); });
        if (pendingTrans.length === 2) {
          const d1 = dropRune(app.run, pendingTrans[0]);
          const cutN = d1.cut.length + dropRune(d1.run, pendingTrans[1]).cut.length;
          if (cutN) el('div', 'rn-warn', `Warning: ${cutN} rune${cutN === 1 ? '' : 's'} will be removed from your spell (the transmuted ones and any that depend on them).`, panel);
          button('Transmute', 'rn-btn primary', () => {
            const ops = app.ns.ops ?? 0;
            const res = transmute(app.run, pendingTrans[0], pendingTrans[1], createRng(nodeSeed(app.run.seed, node.id, 20 + ops)));
            if (!res) return;
            app.ns = { ...app.ns, ops: ops + 1 };
            app.setRun(res.run);
            app.save('shop');
            sfx('forge');
            message = `Transmuted into ${res.result.name} (${res.result.rarity}).`;
            service = null;
            pendingTrans = [];
            render();
          }, panel, 'forge');
        }
      }

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

/** Whether any two owned runes share a rarity tier. */
function hasPair(owned: RuneInstance[]): boolean {
  const seen = new Set<string>();
  for (const o of owned) {
    const t = instTier(o);
    if (seen.has(t)) return true;
    seen.add(t);
  }
  return false;
}
