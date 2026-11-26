import { sfx } from '../../audio';
import type { MapNode } from '../../types';
import type { App } from '../app';
import { MAP_ROWS, reachable } from '../map';
import { NODE_INFO, abandonControl, el, rowLabel, topBar } from '../ui';

const NS = 'http://www.w3.org/2000/svg';
const W = 600;
const ROW_GAP = 50;
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
    const { right } = topBar(app, s, `${rowLabel(Math.min(app.run.floor, MAP_ROWS))} - choose your path`);
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
        svg('title', {}, g, `${info.label}${canPick ? ' (click to go)' : ''}: ${info.desc}`);
        if (canPick) svg('circle', { r: 24, class: 'ring' }, g);
        svg('circle', { r: 18, class: 'body' }, g);
        svg('text', { class: 'glyph', y: 6, 'text-anchor': 'middle' }, g, info.glyph);
        if (canPick) {
          g.setAttribute('tabindex', '0');
          g.setAttribute('role', 'button');
          g.setAttribute('aria-label', `${info.label}, row ${n.row}`);
          const go = (): void => { sfx('mapStep'); app.goto.pickNode(n); };
          g.addEventListener('click', go);
          g.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') { e.preventDefault(); go(); } });
        }
      }
    }

    const legend = el('div', 'rn-legend', undefined, body);
    el('div', 'rn-legend-title', 'Legend', legend);
    for (const k of ['battle', 'elite', 'shop', 'forge', 'shrine', 'boss'] as const) {
      const info = NODE_INFO[k];
      const row = el('div', 'rn-legend-row', undefined, legend);
      el('span', `rn-legend-glyph ${k}`, info.glyph, row);
      const t = el('div', undefined, undefined, row);
      el('div', 'rn-legend-name', info.label, t);
      el('div', 'rn-legend-desc', info.desc, t);
    }
  });
}
