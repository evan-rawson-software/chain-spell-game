import { sfx } from '../../audio';
import { CATALOG, SOURCE_ID } from '../../data/runes';
import { defOf } from '../../spell';
import { COLOR_HEX } from '../../types';
import type { ReactionKind, RunState, RuneInstance, SpellGraph } from '../../types';
import type { App } from '../app';
import { MAP_ROWS } from '../map';
import { clearRun } from '../state';
import { boonChip, button, el } from '../ui';

const NS = 'http://www.w3.org/2000/svg';
const REACTION_NAME: Record<ReactionKind, string> = {
  shatter: 'Shatter', melt: 'Melt', steam: 'Steam', combust: 'Combust', wildfire: 'Wildfire',
  electrocute: 'Electrocute', overload: 'Overload', unravel: 'Unravel',
};

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element, text?: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

/** Level of each placed rune: root 0, otherwise the deepest parent + 1. */
function levelsOf(graph: SpellGraph): Map<string, number> {
  const lv = new Map<string, number>([[graph.rootUid, 0]]);
  for (let pass = 0; pass < graph.nodes.length + 1; pass++) {
    let changed = false;
    for (const l of graph.links) {
      const from = lv.get(l.from.uid);
      if (from === undefined) continue;
      if ((lv.get(l.toUid) ?? -1) < from + 1) { lv.set(l.toUid, from + 1); changed = true; }
    }
    if (!changed) break;
  }
  return lv;
}

/** Compact read-only picture of the final spell: levels left to right, links in the color they carry. */
function spellSvg(graph: SpellGraph, parent: HTMLElement): void {
  const lv = levelsOf(graph);
  const cols: RuneInstance[][] = [];
  for (const n of graph.nodes) {
    const l = lv.get(n.uid);
    if (l === undefined) continue;
    (cols[l] ??= []).push(n);
  }
  const W = 100;
  const H = 22;
  const GX = 26;
  const GY = 6;
  const rows = Math.max(1, ...cols.map((c) => c?.length ?? 0));
  const width = cols.length * (W + GX) - GX;
  const height = rows * (H + GY) - GY;
  const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, width, height, class: 'rn-spellsvg', role: 'img', 'aria-label': 'Final spell graph', preserveAspectRatio: 'xMidYMid meet' }, parent);
  const box = new Map<string, { x: number; y: number }>();
  cols.forEach((col, ci) => {
    const offset = ((rows - col.length) * (H + GY)) / 2;
    col.forEach((n, ri) => box.set(n.uid, { x: ci * (W + GX), y: offset + ri * (H + GY) }));
  });
  const defs = new Map<string, ReturnType<typeof defOf>>();
  for (const n of graph.nodes) defs.set(n.uid, defOf(CATALOG, n) ?? (n.defId === SOURCE_ID ? CATALOG[SOURCE_ID] : undefined));
  for (const l of graph.links) {
    const a = box.get(l.from.uid);
    const b = box.get(l.toUid);
    if (!a || !b) continue;
    const color = defs.get(l.from.uid)?.outputs[l.from.output];
    const x1 = a.x + W;
    const y1 = a.y + H / 2;
    const x2 = b.x;
    const y2 = b.y + H / 2;
    const mid = (x1 + x2) / 2;
    svg('path', { d: `M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`, fill: 'none', stroke: color ? COLOR_HEX[color] : '#888', 'stroke-width': 2, opacity: 0.9 }, root);
  }
  for (const n of graph.nodes) {
    const p = box.get(n.uid);
    const def = defs.get(n.uid);
    if (!p) continue;
    const g = svg('g', { transform: `translate(${p.x} ${p.y})` }, root);
    const name = def?.name ?? n.defId;
    svg('title', {}, g, name);
    svg('rect', { width: W, height: H, rx: 5, fill: '#1b1730', stroke: n.plus ? '#f5c518' : '#5d567a', 'stroke-width': 1.5 }, g);
    svg('text', { x: W / 2, y: H / 2 + 4, 'text-anchor': 'middle' }, g, name.length > 16 ? `${name.slice(0, 15)}…` : name);
  }
}

/** Name for a damage-bar key (a rune instance uid), even if the rune was since sold. */
function runeName(run: RunState, uid: string): string {
  const inst = run.owned.find((o) => o.uid === uid) ?? run.graph.nodes.find((o) => o.uid === uid);
  if (inst) return defOf(CATALOG, inst)?.name ?? inst.defId;
  const m = /^(.*)-\d+$/.exec(uid);
  return (m && CATALOG[m[1]]?.name) || uid;
}

export function endScreen(app: App, won: boolean): void {
  const run = app.run;
  // On defeat the floor is the row being fought, so rows cleared = floor - 1.
  const cleared = won ? MAP_ROWS : Math.max(0, run.floor - 1);
  clearRun();
  sfx(won ? 'runVictory' : 'runDefeat');
  app.show((s) => {
    s.classList.add('rn-center');
    const box = el('div', 'rn-sumscroll', undefined, s);
    const logo = el('h1', `rn-logo ${won ? 'win' : 'lose'}`, won ? 'Victory!' : 'Defeated', box);
    logo.style.fontSize = '40px';
    logo.style.textAlign = 'center';

    const card = el('div', 'rn-sumcard compact', undefined, box);
    const stats = el('div', 'rn-stats wrap small', undefined, card);
    const st = run.stats;
    const totals: [string, string][] = [
      ['Rows cleared', `${cleared}/${MAP_ROWS}`], ['Battles', String(st.battles)], ['Kills', String(st.kills)],
      ['Best hit', String(Math.round(st.bestHit))], ['Gold', String(run.gold)], ['Boons', String(run.boons.length)],
      ['Runes', String(run.owned.length)], ['Max mana', String(run.maxMana)],
    ];
    for (const [label, val] of totals) {
      const sb = el('div', 'rn-statbox', undefined, stats);
      el('div', 'rn-statval', val, sb);
      el('div', 'rn-statlabel', label, sb);
    }
    el('div', 'rn-note', run.daily ? `Daily run ${run.daily}` : `Seed ${run.seed}`, card);
    if (run.boons.length) {
      const boons = el('div', 'rn-runelist', undefined, card);
      for (const id of run.boons) { const d = app.boons[id]; if (d) boonChip(d, boons); }
    }

    const spell = el('div', 'rn-sumcard compact', undefined, box);
    el('div', 'rn-sumhead', 'Final spell', spell);
    spellSvg(run.graph, spell);

    const dmg = Object.entries(st.runeDamage).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const dcard = el('div', 'rn-sumcard compact', undefined, box);
    el('div', 'rn-sumhead', 'Damage per rune', dcard);
    if (!dmg.length) el('div', 'rn-note', 'No damage recorded.', dcard);
    const top = dmg[0]?.[1] ?? 1;
    for (const [uid, v] of dmg.slice(0, 10)) {
      const r = el('div', 'rn-dmgrow', undefined, dcard);
      const label = el('span', undefined, runeName(run, uid), r);
      label.title = uid;
      const bar = el('div', 'rn-dmgbar', undefined, r);
      const fill = el('i', undefined, undefined, bar);
      fill.style.width = `${Math.max(2, (v / top) * 100)}%`;
      el('span', 'rn-dmgval', String(Math.round(v)), r);
    }

    const rcard = el('div', 'rn-sumcard compact', undefined, box);
    el('div', 'rn-sumhead', 'Reactions', rcard);
    const reacts = Object.entries(st.reactions).filter(([, n]) => (n ?? 0) > 0).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
    if (!reacts.length) el('div', 'rn-note', 'No reactions triggered.', rcard);
    const rl = el('div', 'rn-runelist', undefined, rcard);
    for (const [k, n] of reacts) el('span', 'rn-chip', `${REACTION_NAME[k as ReactionKind] ?? k} x${n}`, rl);

    const row = el('div', 'rn-row', undefined, box);
    button('New Run', 'rn-btn primary', () => { app.dailyPending = null; app.goto.school(); }, row);
    button('Title', 'rn-btn', () => app.goto.title(), row);
  });
}
