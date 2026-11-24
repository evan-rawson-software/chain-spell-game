import './run.css';
import { compileSpell, validateSpell } from '../spell';
import { CATALOG, ROOT_UID, SOURCE_ID, runeTooltip } from '../data/runes';
import { mountEditor } from '../editor';
import { mountBattle } from '../battle';
import { COLOR_HEX } from '../types';
import type { BattleResult, Reward, RunState, RuneDef, SpellGraph } from '../types';
import { FLOOR_COUNT, floorDef } from './floors';
import { createRng } from './rng';
import { rollRewards } from './rewards';
import { applyReward, clearRun, loadRun, newRun, saveRun } from './state';

export { FLOOR_COUNT, floorDef } from './floors';
export { rollRewards } from './rewards';
export { newRun, applyReward } from './state';

type Cleanup = () => void;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls?: string, text?: string, parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

function button(label: string, cls: string, onClick: () => void, parent?: HTMLElement): HTMLButtonElement {
  const b = el('button', cls, label, parent);
  b.addEventListener('click', onClick);
  return b;
}

function pips(colors: RuneDef['inputs'], parent: HTMLElement): void {
  const wrap = el('span', 'rn-pips', undefined, parent);
  for (const c of colors) {
    const p = el('span', 'rn-pip', undefined, wrap);
    p.style.background = COLOR_HEX[c];
  }
}

const RARITY_LABEL: Record<string, string> = { starter: 'Starter', common: 'Common', uncommon: 'Uncommon', rare: 'Rare' };

export function startApp(root: HTMLElement): void {
  let cleanup: Cleanup | null = null;
  let run: RunState = newRun();

  function show(build: (screen: HTMLElement) => Cleanup | void): void {
    try { cleanup?.(); } catch (e) { console.error(e); }
    cleanup = null;
    root.innerHTML = '';
    const screen = el('div', 'rn-screen', undefined, root);
    cleanup = build(screen) ?? null;
  }

  // ------------------------------------------------------------ Title
  function title(): void {
    show((s) => {
      s.classList.add('rn-center');
      const box = el('div', 'rn-title', undefined, s);
      el('h1', 'rn-logo', 'Chain Spell', box);
      el('p', 'rn-pitch',
        'Wire runes into a branching spell graph, then unleash it on waves of enemies in real time. '
        + 'Colors link runes together, augments flow down the chain, and every floor you clear gives you '
        + 'new runes to rebuild your spell. Ten floors. One wizard. Build something terrible and wonderful.', box);
      const row = el('div', 'rn-row', undefined, box);
      const saved = loadRun();
      if (saved) {
        button(`Continue run (floor ${Math.min(saved.run.floor, FLOOR_COUNT)})`,
          'rn-btn primary', () => {
            run = saved.run;
            if (saved.phase === 'reward') rewardScreen(); else prepare();
          }, row);
      }
      button('New Run', saved ? 'rn-btn' : 'rn-btn primary', () => {
        run = newRun();
        saveRun(run, 'prepare');
        prepare();
      }, row);
    });
  }

  // ------------------------------------------------------------ Prepare
  function prepare(): void {
    saveRun(run, 'prepare');
    show((s) => {
      s.classList.add('rn-col');
      const f = floorDef(run.floor);
      const bar = el('div', 'rn-topbar', undefined, s);
      const left = el('div', 'rn-topleft', undefined, bar);
      el('span', 'rn-floor', `Floor ${run.floor}/${FLOOR_COUNT}`, left);
      if (f.kind !== 'normal') el('span', `rn-tag ${f.kind}`, f.kind === 'elite' ? 'Elite' : 'Boss', left);
      el('span', 'rn-note', `HP resets every floor (${run.wizardMaxHp} HP)`, left);
      el('span', 'rn-note', `Max mana ${run.maxMana}`, left);
      const right = el('div', 'rn-topright', undefined, bar);
      const reason = el('span', 'rn-reason', undefined, right);
      button('Abandon run', 'rn-btn danger', () => {
        if (!confirm('Abandon this run?')) return;
        clearRun();
        title();
      }, right);
      const begin = button(`Begin Floor ${run.floor}`, 'rn-btn primary', () => battle(), right);

      const holder = el('div', 'rn-editor', undefined, s);

      const refresh = (): void => {
        let why = '';
        try {
          const v = validateSpell(run.graph, CATALOG, run.maxMana);
          if (!v.valid) why = v.errors[0] ?? 'Spell is invalid';
          else if (compileSpell(run.graph, CATALOG).shots.length === 0) why = 'Spell has no terminal rune that fires';
        } catch (e) {
          why = 'Spell is invalid';
          console.error(e);
        }
        begin.disabled = why !== '';
        begin.title = why;
        reason.textContent = why;
      };
      refresh();

      const handle = mountEditor(holder, {
        catalog: CATALOG,
        owned: run.owned,
        root: { uid: ROOT_UID, defId: SOURCE_ID },
        graph: run.graph,
        maxMana: run.maxMana,
        onChange: (g: SpellGraph) => {
          run = { ...run, graph: g };
          saveRun(run, 'prepare');
          refresh();
        },
      });
      return () => handle.destroy();
    });
  }

  // ------------------------------------------------------------ Battle
  function battle(): void {
    show((s) => {
      s.classList.add('rn-col');
      const holder = el('div', 'rn-battle', undefined, s);
      let done = false;
      let handle: { destroy(): void } | null = null;
      const plan = compileSpell(run.graph, CATALOG);
      handle = mountBattle(holder, {
        plan,
        floor: floorDef(run.floor),
        wizardMaxHp: run.wizardMaxHp,
        onEnd: (r: BattleResult) => {
          if (done) return;
          done = true;
          // Defer so the battle module can finish its own callback before teardown.
          setTimeout(() => {
            if (!r.won) defeat();
            else if (run.floor >= FLOOR_COUNT) victory();
            else { saveRun(run, 'reward'); rewardScreen(); }
          }, 0);
        },
      });
      return () => { done = true; handle?.destroy(); };
    });
  }

  // ------------------------------------------------------------ Reward
  function rewardScreen(): void {
    saveRun(run, 'reward');
    show((s) => {
      s.classList.add('rn-center');
      const f = floorDef(run.floor);
      const rewards = rollRewards(f, createRng((run.seed + run.floor * 7919) >>> 0));
      const box = el('div', 'rn-rewardbox', undefined, s);
      el('h2', 'rn-h2', `Floor ${run.floor} cleared`, box);
      el('p', 'rn-sub', 'Choose a reward', box);
      const cards = el('div', 'rn-cards', undefined, box);

      const pick = (r: Reward | null): void => {
        if (r) run = applyReward(run, r);
        run = { ...run, floor: run.floor + 1 };
        prepare();
      };

      for (const r of rewards) {
        const card = el('button', 'rn-card', undefined, cards);
        if (r.kind === 'maxMana') {
          card.classList.add('mana');
          el('div', 'rn-card-name', `+${r.amount} Max Mana`, card);
          el('div', 'rn-card-rarity', 'Upgrade', card);
          el('div', 'rn-card-desc', `Raise your mana budget from ${run.maxMana} to ${run.maxMana + r.amount}, so bigger spells fit.`, card);
        } else {
          const def = CATALOG[r.defId];
          if (!def) continue;
          card.classList.add(def.rarity);
          el('div', 'rn-card-name', def.name, card);
          el('div', 'rn-card-rarity', RARITY_LABEL[def.rarity] ?? def.rarity, card);
          const io = el('div', 'rn-card-io', undefined, card);
          el('span', 'rn-io-label', 'In', io);
          pips(def.inputs, io);
          el('span', 'rn-io-label', 'Out', io);
          if (def.outputs.length) pips(def.outputs, io); else el('span', 'rn-io-none', 'none', io);
          el('div', 'rn-card-desc', runeTooltip(def), card);
          el('div', 'rn-card-cost', `Mana ${def.mana}`, card);
        }
        card.addEventListener('click', () => pick(r));
      }
      button('Skip', 'rn-btn', () => pick(null), box);
    });
  }

  // ------------------------------------------------------------ End screens
  function summary(parent: HTMLElement, cleared: number): void {
    const names = new Map<string, number>();
    for (const o of run.owned) names.set(o.defId, (names.get(o.defId) ?? 0) + 1);
    const stats = el('div', 'rn-stats', undefined, parent);
    el('div', undefined, `Floors cleared: ${cleared}/${FLOOR_COUNT}`, stats);
    el('div', undefined, `Runes owned: ${run.owned.length}`, stats);
    el('div', undefined, `Max mana: ${run.maxMana}`, stats);
    const list = el('div', 'rn-runelist', undefined, parent);
    for (const [id, n] of names) el('span', 'rn-chip', `${CATALOG[id]?.name ?? id}${n > 1 ? ` x${n}` : ''}`, list);
  }

  function endScreen(titleText: string, cls: string, cleared: number): void {
    clearRun();
    show((s) => {
      s.classList.add('rn-center');
      const box = el('div', 'rn-title', undefined, s);
      el('h1', `rn-logo ${cls}`, titleText, box);
      summary(box, cleared);
      const row = el('div', 'rn-row', undefined, box);
      button('New Run', 'rn-btn primary', () => { run = newRun(); saveRun(run, 'prepare'); prepare(); }, row);
      button('Title', 'rn-btn', () => title(), row);
    });
  }

  function victory(): void { endScreen('Victory!', 'win', FLOOR_COUNT); }
  function defeat(): void { endScreen('Defeated', 'lose', run.floor - 1); }

  title();
}
