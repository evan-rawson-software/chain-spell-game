import { CATALOG } from '../../data/runes';
import { sfx } from '../../audio';
import type { Reward } from '../../types';
import type { App } from '../app';
import { floorDef } from '../floors';
import { ELITE_BLESSINGS, REROLL_COST, REROLL_SALT, REWARD_OFFER, REWARD_PICKS, goldReward, nodeSeed, rollBoons, rollRewards } from '../rewards';
import { createRng } from '../rng';
import { addBoon, addGold, applyReward, manaGain, spendGold } from '../state';
import { logOffer } from '../telemetry';
import { boonCard, button, el, fmtTime, rowLabel, runeCard } from '../ui';

export function rewardScreen(app: App, fresh = true): void {
  app.save('reward');
  if (fresh) sfx('floorClear');
  const node = app.node();
  if (!node) { app.goto.map(); return; }
  app.show((s) => {
    s.classList.add('rn-center');
    const totals = app.totals();
    const f = floorDef(node.row, node.kind, node.id, app.run.seed, app.run.act);
    // An act boss (acts 1 and 2) pays out like an elite.
    const payKind = node.kind === 'boss' ? 'elite' : node.kind;
    const rewards = rollRewards(f, createRng(nodeSeed(app.run.seed, node.id, app.ns.rerolled ? REROLL_SALT : 0)), REWARD_OFFER + totals.rewardOffer);
    const rerollCost = Math.round(REROLL_COST * totals.priceMul);
    const gold = Math.round(goldReward(payKind, f.floor) * totals.goldMul);
    const box = el('div', 'rn-rewardbox', undefined, s);
    el('h2', 'rn-h2', node.kind === 'boss' ? `Act ${app.run.act} boss defeated` : `${rowLabel(node.row, app.run.act)} cleared`, box);
    if (app.lastResult) {
      const r = app.lastResult;
      const line = el('div', 'rn-battlesum', undefined, box);
      const chips = [`${r.kills} kills`, `${Math.round(r.damageTaken)} damage taken`, `${fmtTime(r.durationSec)} time`];
      if (r.reactions) chips.push(`${r.reactions} reaction${r.reactions === 1 ? '' : 's'}`);
      if (r.bestHit) chips.push(`best hit ${Math.round(r.bestHit)}`);
      for (const t of chips) el('span', 'rn-chip', t, line);
    }
    const gains = el('div', 'rn-battlesum', undefined, box);
    el('div', 'rn-managain gold', `+${gold} gold`, gains);
    const gain = manaGain(payKind, totals);
    el('div', 'rn-managain', `Max mana ${app.run.maxMana} → ${app.run.maxMana + gain} (+${gain})`, gains);
    el('p', 'rn-sub', `Choose up to ${REWARD_PICKS} runes`, box);
    const cards = el('div', 'rn-cards', undefined, box);

    const selected: number[] = [];
    const cardEls: HTMLElement[] = [];

    const refresh = (): void => {
      cardEls.forEach((c, i) => {
        const on = selected.includes(i);
        c.classList.toggle('selected', on);
        c.setAttribute('aria-pressed', String(on));
      });
      const n = selected.length;
      confirm.textContent = n === 0 ? 'Continue' : `Take ${n} rune${n === 1 ? '' : 's'}`;
      counter.textContent = `${n} / ${REWARD_PICKS} selected`;
    };

    rewards.forEach((r, idx) => {
      const def = CATALOG[r.defId];
      if (!def) return;
      const card = runeCard(def, cards);
      el('span', 'rn-check', '✓', card);
      cardEls[idx] = card;
      card.addEventListener('click', () => {
        sfx('rewardSelect');
        const at = selected.indexOf(idx);
        if (at >= 0) selected.splice(at, 1);
        else { selected.push(idx); if (selected.length > REWARD_PICKS) selected.shift(); }
        refresh();
      });
    });
    const counter = el('div', 'rn-counter', undefined, box);
    const actions = el('div', 'rn-actions', undefined, box);
    const reroll = button(app.ns.rerolled ? 'Rerolled' : `Reroll runes ● ${rerollCost}`, 'rn-btn', () => {
      app.setRun(spendGold(app.run, rerollCost));
      app.ns = { ...app.ns, rerolled: true };
      app.save('reward'); // persist before re-render so a reload keeps the new set and the spent flag
      sfx('buy');
      rewardScreen(app, false);
    }, actions, 'coin');
    reroll.disabled = !!app.ns.rerolled || app.run.gold < rerollCost;
    reroll.title = app.ns.rerolled ? 'Already rerolled on this screen' : app.run.gold < rerollCost ? 'Not enough gold' : 'Replace the rune cards (once per reward screen)';
    const confirm = button('', 'rn-btn primary big', () => {
      let run = app.run;
      for (const i of selected) { const r = rewards[i] as Reward | undefined; if (r) run = applyReward(run, r); }
      run = addGold(run, goldReward(payKind, f.floor), totals);
      logOffer(app.run, { source: node.kind, row: node.row, offered: rewards.map((r) => r.defId), taken: selected.map((i) => rewards[i]?.defId).filter(Boolean) });
      app.setRun(run);
      if (node.kind === 'elite' || node.kind === 'boss') { app.save('blessing'); app.goto.blessing(); } else app.leaveNode();
    }, actions, 'rewardTake');
    refresh();
  });
}

/** Elite bonus: pick 1 of 3 blessings. The runes and gold are already applied by now. */
export function blessingScreen(app: App): void {
  app.save('blessing');
  const node = app.node();
  if (!node) { app.goto.map(); return; }
  app.show((s) => {
    s.classList.add('rn-center');
    const offers = rollBoons('blessing', app.run.boons, createRng(nodeSeed(app.run.seed, node.id, 1)), ELITE_BLESSINGS);
    const box = el('div', 'rn-rewardbox', undefined, s);
    el('h2', 'rn-h2', node.kind === 'boss' ? 'Boss defeated' : 'Elite defeated', box);
    el('p', 'rn-sub', offers.length ? 'Choose a blessing' : 'No blessings left to offer', box);
    const cards = el('div', 'rn-cards', undefined, box);
    let pick: string | null = null;
    const cardEls: [string, HTMLElement][] = [];
    const refresh = (): void => {
      for (const [id, c] of cardEls) c.classList.toggle('selected', id === pick);
      take.disabled = pick === null;
    };
    for (const b of offers) {
      const c = boonCard(b, cards);
      el('span', 'rn-check', '✓', c);
      cardEls.push([b.id, c]);
      c.addEventListener('click', () => { sfx('rewardSelect'); pick = b.id; refresh(); });
    }
    const actions = el('div', 'rn-actions', undefined, box);
    const take = button('Take blessing', 'rn-btn primary big', () => {
      if (pick) { app.setRun(addBoon(app.run, pick)); sfx('blessing'); }
      app.leaveNode();
    }, actions, 'rewardTake');
    button('Skip', 'rn-btn', () => app.leaveNode(), actions);
    refresh();
  });
}
