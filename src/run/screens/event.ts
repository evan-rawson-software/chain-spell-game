import { sfx } from '../../audio';
import type { App } from '../app';
import {
  DICE_COST, DICE_WIN, EVENT_INFO, FOUNTAIN_HP, canAltar, canDice, canFountainCurse, canMage, canTome, eventFor, eventRng,
  mageCost, resolveAltar, resolveDice, resolveFountain, resolveMage, resolveMerchant, resolveTome, type EventResult,
} from '../events';
import type { Rng } from '../rng';
import { cutCount, runeLabel } from '../trade';
import { button, el, rowLabel, runePicker } from '../ui';

export function eventScreen(app: App): void {
  app.save('event');
  const node = app.node();
  if (!node) { app.goto.map(); return; }
  app.show((s) => {
    s.classList.add('rn-center');
    const id = eventFor(app.run.seed, node.id);
    const info = EVENT_INFO[id];
    const box = el('div', 'rn-rewardbox rn-event', undefined, s);
    el('h2', 'rn-h2', `${info.name} - ${rowLabel(node.row)}`, box);
    el('p', 'rn-event-text', info.text, box);
    const body = el('div', 'rn-choices', undefined, box);
    let picked: string | null = null;

    const finish = (res: EventResult | null): void => {
      if (!res) return;
      app.setRun(res.run);
      app.ns = { ...app.ns, outcome: res.lines };
      app.save('event'); // outcome + new run state persist together, so a reload shows the result instead of a second roll
      sfx('buy');
      render();
    };
    const rng = (): Rng => eventRng(app.run.seed, node.id);
    const choice = (label: string, ok: boolean, why: string, fn: () => void, cls = 'rn-btn primary'): void => {
      const wrap = el('div', 'rn-choice', undefined, body);
      const b = button(label, cls, fn, wrap);
      b.disabled = !ok;
      if (!ok && why) el('div', 'rn-choice-note', why, wrap);
    };
    const runeChoice = (verb: string, check: (uid: string) => boolean, whyNot: string, go: (uid: string) => void): void => {
      const inGraph = new Set(app.run.graph.nodes.map((n) => n.uid));
      const panel = el('div', 'rn-panel', undefined, body);
      runePicker(panel, app.run.owned, inGraph, picked, (uid) => { picked = uid; render(); });
      const target = app.run.owned.find((o) => o.uid === picked);
      if (!target) { el('div', 'rn-choice-note', 'Pick a rune.', panel); return; }
      const cut = inGraph.has(target.uid) ? cutCount(app.run, target.uid) : 0;
      if (cut > 0) {
        el('div', 'rn-warn', cut > 1
          ? `Warning: this rune is in your spell. Giving it up also removes ${cut - 1} dependent rune${cut === 2 ? '' : 's'} from the spell.`
          : 'Warning: this rune is in your spell and will be removed from it.', panel);
      }
      const ok = check(target.uid);
      const b = button(`${verb} ${runeLabel(target)}`, 'rn-btn primary', () => go(target.uid), panel);
      b.disabled = !ok;
      if (!ok) el('div', 'rn-choice-note', whyNot, panel);
    };

    const render = (): void => {
      body.innerHTML = '';
      if (app.ns.outcome) {
        const out = el('div', 'rn-outcome', undefined, body);
        el('div', 'head', 'Outcome', out);
        for (const l of app.ns.outcome) el('div', undefined, l, out);
        button('Continue', 'rn-btn primary big', () => app.leaveNode(), body);
        return;
      }
      const run = app.run;
      switch (id) {
        case 'mage': {
          const cost = mageCost(run);
          choice(`Pay ${cost} gold for a random uncommon or rare rune`, canMage(run), `Needs ${cost} gold.`, () => finish(resolveMage(app.run, rng())));
          break;
        }
        case 'altar':
          runeChoice('Sacrifice', (uid) => canAltar(app.run, uid), 'You need another unforged rune for the altar to temper.',
            (uid) => finish(resolveAltar(app.run, uid, rng())));
          break;
        case 'tome':
          choice('Read it: take a random curse, forge every rune in your spell', canTome(run),
            'Needs a rune in your spell to forge and a curse you do not hold.', () => finish(resolveTome(app.run, rng())));
          break;
        case 'merchant':
          runeChoice('Trade', () => true, '', (uid) => finish(resolveMerchant(app.run, uid, rng())));
          break;
        case 'dice':
          choice(`Stake ${DICE_COST} gold: 50% to win ${DICE_WIN}`, canDice(run), `Needs ${DICE_COST} gold.`, () => finish(resolveDice(app.run, rng())));
          break;
        case 'fountain':
          choice(`Drink: +${FOUNTAIN_HP} max ward HP`, true, '', () => finish(resolveFountain(app.run, 'hp', rng())));
          choice('Wash: remove a random curse', canFountainCurse(run), 'You carry no curses.', () => finish(resolveFountain(app.run, 'curse', rng())), 'rn-btn');
          break;
      }
      button('Leave', 'rn-btn', () => app.leaveNode(), body);
    };
    render();
  });
}
