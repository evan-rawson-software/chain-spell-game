import { sfx } from '../../audio';
import type { MapNode } from '../../types';
import type { App } from '../app';
import { nodePreview } from '../floors';
import { MAP_ROWS, reachable } from '../map';
import { NODE_INFO, abandonControl, el, gearButton, previewLines, rowLabel, topBar } from '../ui';

const NS = 'http://www.w3.org/2000/svg';
const W = 600;
const ROW_GAP = 64;
const PAD = 38;
const H = PAD * 2 + (MAP_ROWS - 1) * ROW_GAP;
const COL_GAP = 120;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element, text?: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

export function mapScreen(app: App): void {
  app.show((s) => {
    s.classList.add('rn-col');
    const { right } = topBar(app, s, `${rowLabel(Math.min(app.run.floor, MAP_ROWS), app.run.act)} - choose your path`);
    gearButton(app, right, () => app.goto.map());
    abandonControl(app, right);

    const body = el('div', 'rn-mapbody', undefined, s);
    const holder = el('div', 'rn-mapholder', undefined, body);
    const map = app.run.map;
    const visited = new Set(app.visited);
    const options = new Set(reachable(map, app.run.at).map((n) => n.id));

    const pos = (n: MapNode): { x: number; y: number } => {
      const count = map.rows[n.row - 1].length;
      return { x: W / 2 + (n.col - (count - 1) / 2) * COL_GAP, y: H - PAD - (n.row - 1) * ROW_GAP };
    };
    const byId = new Map<string, MapNode>();
    for (const row of map.rows) for (const n of row) byId.set(n.id, n);

    const touch = typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;
    const goFns = new Map<string, () => void>();
    let selectedId: string | null = null; // touch: first tap selects, second tap (or Go) enters
    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'rn-map', preserveAspectRatio: 'xMidYMid meet', role: 'group', 'aria-label': 'Run map' }, holder);

    for (let r = 1; r <= MAP_ROWS; r++) {
      const y = H - PAD - (r - 1) * ROW_GAP;
      svg('text', { x: 14, y: y + 4, class: 'rn-maprow' }, root, String(r));
    }
    const edges = svg('g', {}, root);
    for (const row of map.rows) {
      for (const n of row) {
        for (const id of n.next) {
          const t = byId.get(id);
          if (!t) continue;
          const a = pos(n);
          const b = pos(t);
          const taken = visited.has(n.id) && visited.has(t.id);
          const open = n.id === app.run.at && options.has(t.id);
          svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: `rn-edge${taken ? ' taken' : ''}${open ? ' open' : ''}` }, edges);
        }
      }
    }
    for (const row of map.rows) {
      for (const n of row) {
        const { x, y } = pos(n);
        const info = NODE_INFO[n.kind];
        const isHere = n.id === app.run.at;
        const canPick = options.has(n.id);
        const cls = ['rn-mn', n.kind, visited.has(n.id) ? 'visited' : '', isHere ? 'here' : '', canPick ? 'reach' : ''].filter(Boolean).join(' ');
        const g = svg('g', { class: cls, transform: `translate(${x} ${y})` }, root);
        const lines = previewLines(nodePreview(n.row, n.kind, n.id, app.run.seed, app.run.act));
        const tip = [`${info.label}${canPick ? ' (click to go)' : ''}: ${info.desc}`, ...lines.map((l) => `${l.kind}: ${l.name} - ${l.rule}`)];
        svg('title', {}, g, tip.join(' | '));
        if (!touch) {
          g.addEventListener('mouseenter', () => showDetail(n));
          g.addEventListener('focus', () => showDetail(n));
          g.addEventListener('mouseleave', () => showDetail(null));
        }
        if (canPick) svg('circle', { r: 24, class: 'ring' }, g);
        if (canPick) svg('circle', { r: 31, class: 'hit' }, g); // oversized, invisible touch target
        svg('circle', { r: 18, class: 'body' }, g);
        svg('text', { class: 'glyph', y: 6, 'text-anchor': 'middle' }, g, info.glyph);
        // Preview markers: one small badge per featured enemy / hazard / trait under the node.
        const marks = lines.filter((l) => l.kind !== 'Boss');
        marks.forEach((l, i) => {
          const b = svg('g', { class: 'badge', transform: `translate(${(i - (marks.length - 1) / 2) * 15} 24)` }, g);
          svg('circle', { r: 6.5 }, b);
          svg('text', { y: 3, 'text-anchor': 'middle' }, b, l.glyph);
        });
        const boss = lines.find((l) => l.kind === 'Boss');
        if (boss) svg('text', { class: 'bosslabel', y: 33, 'text-anchor': 'middle' }, g, boss.name);
        if (canPick) {
          g.setAttribute('tabindex', '0');
          g.setAttribute('role', 'button');
          g.setAttribute('aria-label', `${info.label}, row ${n.row}`);
          const go = (): void => { sfx('mapStep'); app.goto.pickNode(n); };
          goFns.set(n.id, go);
          g.addEventListener('click', () => {
            if (!touch || selectedId === n.id) { go(); return; }
            selectedId = n.id;
            root.querySelectorAll('.rn-mn.sel').forEach((x) => x.classList.remove('sel'));
            g.classList.add('sel');
            showDetail(n);
          });
          g.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') { e.preventDefault(); go(); } });
        }
      }
    }

    const legend = el('div', 'rn-legend', undefined, body);
    const detail = el('div', 'rn-detail', undefined, legend);
    const fold = document.createElement('details');
    fold.className = 'rn-legend-fold';
    fold.open = window.innerWidth > 760;
    const showDetail = (n: MapNode | null): void => {
      detail.innerHTML = '';
      if (!n) { el('div', 'rn-detail-line', touch ? 'Tap a glowing node to see what awaits there.' : 'Hover a node to see what awaits there.', detail); return; }
      const info = NODE_INFO[n.kind];
      const name = el('div', `rn-detail-name ${n.kind}`, `${info.label} - row ${n.row}`, detail);
      name.title = info.desc;
      el('div', 'rn-detail-line', info.desc, detail);
      for (const l of previewLines(nodePreview(n.row, n.kind, n.id, app.run.seed, app.run.act))) {
        const line = el('div', 'rn-detail-line', undefined, detail);
        el('b', undefined, `${l.glyph} ${l.kind}: ${l.name}. `, line);
        line.appendChild(document.createTextNode(l.rule));
      }
      const go = goFns.get(n.id);
      if (touch && go) {
        const b = el('button', 'rn-btn primary rn-go', 'Go', detail);
        b.addEventListener('click', go);
      }
    };
    showDetail(null);
    legend.appendChild(fold);
    el('summary', 'rn-legend-title', 'Legend', fold);
    for (const k of ['battle', 'elite', 'shop', 'forge', 'shrine', 'event', 'treasure', 'rest', 'boss'] as const) {
      const info = NODE_INFO[k];
      const row = el('div', 'rn-legend-row', undefined, fold);
      el('span', `rn-legend-glyph ${k}`, info.glyph, row);
      const t = el('div', undefined, undefined, row);
      el('div', 'rn-legend-name', info.label, t);
      el('div', 'rn-legend-desc', info.desc, t);
    }
    el('div', 'rn-legend-desc', 'Small badges under a node show its featured enemy, hazard and elite trait; the boss is named under its node.', fold);
  });
}
