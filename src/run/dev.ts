import { BOONS } from '../data/boons';
import { CATALOG, SOURCE_ID } from '../data/runes';
import type { MapNode } from '../types';
import type { App } from './app';
import { findNode } from './map';
import { newRun } from './state';

const SCREENS_WITHOUT_RUN = ['title', 'school', 'end'];
const KIND_LABEL: Record<string, string> = { battle: 'Battle', elite: 'Elite', shop: 'Shop', forge: 'Forge', shrine: 'Shrine', boss: 'Boss' };

/** ?dev panel: jump around the map, grant things, drive the battle. Only installed when the flag is set. */
export function installDevPanel(app: App): void {
  const style = document.createElement('style');
  style.textContent = `
.dv-toggle { position: fixed; right: 8px; bottom: 46px; z-index: 60; font: 11px monospace; padding: 3px 6px; background: #1a1a1a;
  color: #7f7; border: 1px solid #484; border-radius: 3px; cursor: pointer; opacity: .85; }
.dv-panel { position: fixed; right: 8px; bottom: 72px; z-index: 60; width: 290px; max-height: calc(100vh - 90px); overflow-y: auto;
  font: 11px/1.35 monospace; background: rgba(12,12,12,.96); color: #ccc; border: 1px solid #484; border-radius: 4px; padding: 6px; }
.dv-panel[hidden] { display: none; }
.dv-panel h4 { margin: 6px 0 3px; font-size: 11px; color: #7f7; text-transform: uppercase; }
.dv-panel h4:first-child { margin-top: 0; }
.dv-panel button, .dv-panel select, .dv-panel input { font: 11px monospace; background: #222; color: #ddd; border: 1px solid #555;
  border-radius: 2px; padding: 2px 5px; margin: 1px 1px 1px 0; }
.dv-panel button { cursor: pointer; }
.dv-panel button:hover { background: #333; }
.dv-panel button.on, .dv-panel button.cur { border-color: #fc4; color: #fc4; }
.dv-panel button:disabled { opacity: .4; cursor: default; }
.dv-panel select { max-width: 100%; }
.dv-panel input[type=number] { width: 50px; }
.dv-panel input[type=search] { width: 100px; }
.dv-row { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; }
`;
  document.head.appendChild(style);

  const toggle = document.createElement('button');
  toggle.className = 'dv-toggle';
  toggle.textContent = 'DEV';
  const panel = document.createElement('div');
  panel.className = 'dv-panel';
  panel.hidden = true;
  document.body.append(toggle, panel);
  toggle.addEventListener('click', () => { panel.hidden = !panel.hidden; render(); });

  let speed = 1;
  let runeFilter = '';
  let runeSel = '';
  let runeForged = false;
  let boonSel = '';

  const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    parent.appendChild(e);
    return e;
  };
  const row = (parent: HTMLElement): HTMLElement => { const r = mk('div', parent); r.className = 'dv-row'; return r; };
  const btn = (parent: HTMLElement, label: string, fn: () => void, cls = ''): HTMLButtonElement => {
    const b = mk('button', parent, label);
    if (cls) b.className = cls;
    b.addEventListener('click', fn);
    return b;
  };

  const needsFreshRun = (): boolean => SCREENS_WITHOUT_RUN.includes(app.current);
  const ensureRun = (): void => {
    if (needsFreshRun()) { app.setRun(newRun()); app.visited = []; app.sold = []; app.lastResult = null; }
  };
  /** Re-open the current screen so the new run state shows (that screen saves it). */
  const rerender = (): void => {
    if (needsFreshRun() || app.current === 'battle') return;
    (app.goto as unknown as Record<string, () => void>)[app.current]?.();
  };
  const mutate = (fn: () => void): void => { ensureRun(); fn(); rerender(); render(); };

  /** Make `node` the active node, with a plausible visited path back to row 1. */
  const activate = (node: MapNode): void => {
    const path: string[] = [node.id];
    let cur = node;
    for (let r = node.row - 1; r >= 1; r--) {
      const prev = app.run.map.rows[r - 1].find((n) => n.next.includes(cur.id));
      if (!prev) break;
      path.unshift(prev.id);
      cur = prev;
    }
    app.visited = path;
    app.sold = [];
    app.lastResult = null;
    app.setRun({ ...app.run, at: node.id, floor: node.row });
  };
  const jump = (node: MapNode): void => {
    ensureRun();
    activate(node);
    const go = app.goto;
    const target = { battle: go.prepare, elite: go.prepare, boss: go.prepare, shop: go.shop, forge: go.forge, shrine: go.shrine }[node.kind];
    target();
  };
  /** The active node, or (when none, or of the wrong kind) the first node of `kind`, made active. */
  const currentOr = (kind?: MapNode['kind']): void => {
    ensureRun();
    const at = findNode(app.run.map, app.run.at);
    if (at && (!kind || at.kind === kind)) return;
    const n = (kind ? app.run.map.rows.flat().find((x) => x.kind === kind) : undefined) ?? at ?? app.run.map.rows[0][0];
    activate(n);
  };

  function render(): void {
    if (panel.hidden) return;
    panel.innerHTML = '';
    const run = app.run;

    mk('h4', panel, `${app.current} | gold ${run.gold} | mana ${run.maxMana} | row ${run.floor}`);

    if (app.current === 'battle') {
      mk('h4', panel, 'Battle');
      const r = row(panel);
      const dbg = app.battle?.debug;
      const w = btn(r, 'Win', () => dbg?.win());
      const l = btn(r, 'Lose', () => dbg?.lose());
      if (!dbg) { w.disabled = true; l.disabled = true; w.title = 'battle exposes no debug handle'; }
      for (const x of [1, 2, 4, 8]) {
        const b = btn(r, `${x}x`, () => { speed = x; dbg?.setSpeed(x); render(); }, speed === x ? 'on' : '');
        b.disabled = !dbg;
      }
    }

    mk('h4', panel, 'Jump to node');
    for (const nodes of run.map.rows) {
      const line = row(panel);
      mk('span', line, String(nodes[0].row).padStart(2, ' ') + ' ');
      for (const n of nodes) btn(line, `${n.id} ${KIND_LABEL[n.kind]}`, () => jump(n), n.id === run.at ? 'cur' : '');
    }

    mk('h4', panel, 'Screens');
    const sc = row(panel);
    btn(sc, 'Reward', () => { currentOr(); app.goto.reward(); });
    btn(sc, 'Elite blessing', () => { currentOr('elite'); app.goto.blessing(); });
    btn(sc, 'Victory', () => { ensureRun(); app.goto.end(true); });
    btn(sc, 'Defeat', () => { ensureRun(); app.goto.end(false); });
    btn(sc, 'Map', () => { ensureRun(); app.goto.map(); });

    mk('h4', panel, 'Grant');
    const g = row(panel);
    btn(g, '+100 gold', () => mutate(() => app.setRun({ ...app.run, gold: app.run.gold + 100 })));
    const mana = mk('input', g);
    mana.type = 'number';
    mana.min = '0';
    mana.value = String(run.maxMana);
    btn(g, 'Set max mana', () => mutate(() => app.setRun({ ...app.run, maxMana: Math.max(0, Math.round(Number(mana.value) || 0)) })));

    mk('h4', panel, 'Add rune');
    const rf = row(panel);
    const search = mk('input', rf);
    search.type = 'search';
    search.placeholder = 'filter';
    search.value = runeFilter;
    const forged = mk('input', rf);
    forged.type = 'checkbox';
    forged.checked = runeForged;
    forged.addEventListener('change', () => { runeForged = forged.checked; });
    mk('span', rf, 'forged');
    const sel = mk('select', panel);
    const fill = (): void => {
      sel.innerHTML = '';
      const q = runeFilter.toLowerCase();
      for (const d of Object.values(CATALOG)) {
        if (d.id === SOURCE_ID || (q && !`${d.name} ${d.id}`.toLowerCase().includes(q))) continue;
        const o = mk('option', sel, `${d.name} (${d.rarity})`);
        o.value = d.id;
      }
      if (![...sel.options].some((o) => o.value === runeSel)) runeSel = sel.options[0]?.value ?? '';
      sel.value = runeSel;
    };
    fill();
    search.addEventListener('input', () => { runeFilter = search.value; fill(); });
    sel.addEventListener('change', () => { runeSel = sel.value; });
    btn(panel, 'Add rune', () => {
      if (!runeSel) return;
      mutate(() => {
        const used = new Set(app.run.owned.map((o) => o.uid));
        let n = app.run.owned.length;
        while (used.has(`${runeSel}-${n}`)) n++;
        app.setRun({ ...app.run, owned: [...app.run.owned, { uid: `${runeSel}-${n}`, defId: runeSel, ...(runeForged ? { plus: true } : {}) }] });
      });
    });

    mk('h4', panel, 'Boons');
    const bs = mk('select', panel);
    for (const b of Object.values(BOONS)) {
      const o = mk('option', bs, `${b.kind === 'curse' ? '[curse] ' : ''}${b.name}`);
      o.value = b.id;
    }
    if (!BOONS[boonSel]) boonSel = bs.options[0]?.value ?? '';
    bs.value = boonSel;
    bs.addEventListener('change', () => { boonSel = bs.value; });
    btn(panel, 'Add boon', () => mutate(() => {
      if (boonSel && !app.run.boons.includes(boonSel)) app.setRun({ ...app.run, boons: [...app.run.boons, boonSel] });
    }));
    const held = row(panel);
    for (const id of run.boons) {
      btn(held, `x ${BOONS[id]?.name ?? id}`, () => mutate(() => app.setRun({ ...app.run, boons: app.run.boons.filter((b) => b !== id) })));
    }
  }

  app.onScreen = () => {
    if (app.current === 'battle') speed = 1; // every fight starts at normal speed
    render();
  };
}
