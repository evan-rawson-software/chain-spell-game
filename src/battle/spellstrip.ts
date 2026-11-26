import type { CastPlan, Color, RuneCatalog, SpellGraph } from '../types';
import { COLOR_HEX } from '../types';
import { defOf as resolveDef } from '../spell';
import { ELEMENT_COLOR } from './model';

export interface StripState {
  /** 0..1 charge progress */
  progress: number;
  ready: boolean;
  hasShots: boolean;
  /** seconds remaining to charge (for label) */
  remaining: number;
  time: number;
  /** uid -> world time of the last time a shot from this terminal fired */
  flashes: Map<string, number>;
}

interface NodeBox {
  uid: string;
  name: string;
  label: string;
  accent: string;
  terminal: boolean;
  x: number; y: number; w: number; h: number;
}

interface LinkCurve {
  fromUid: string;
  x1: number; y1: number; x2: number; y2: number;
  color: string;
}

export interface SpellStrip {
  /** Compute layout for a panel of the given CSS-pixel size. */
  layout(ctx: CanvasRenderingContext2D, width: number, height: number): void;
  /** Draw at (ox, oy) in CSS pixels. */
  draw(ctx: CanvasRenderingContext2D, ox: number, oy: number, s: StripState): void;
}

const FLASH_DUR = 0.45;

export function createSpellStrip(graph: SpellGraph, catalog: RuneCatalog, _plan: CastPlan): SpellStrip {
  // levels = longest path from root
  const lv: Record<string, number> = { [graph.rootUid]: 0 };
  for (let pass = 0; pass <= graph.nodes.length; pass++) {
    let changed = false;
    for (const l of graph.links) {
      const from = lv[l.from.uid];
      if (from === undefined) continue;
      if ((lv[l.toUid] ?? -1) < from + 1) { lv[l.toUid] = from + 1; changed = true; }
    }
    if (!changed) break;
  }
  const cols: string[][] = [];
  for (const n of graph.nodes) {
    const L = lv[n.uid] ?? 0;
    (cols[L] ??= []).push(n.uid);
  }
  for (let i = 0; i < cols.length; i++) cols[i] ??= [];
  const colCount = Math.max(1, cols.length);
  const maxRows = Math.max(1, ...cols.map((c) => c.length));

  const defOf = (uid: string) => {
    const n = graph.nodes.find((x) => x.uid === uid);
    return n ? resolveDef(catalog, n) : undefined;
  };

  let boxes: NodeBox[] = [];
  const boxByUid = new Map<string, NodeBox>();
  let curves: LinkCurve[] = [];
  let panelW = 1, panelH = 1;
  let leftEdge = 0, rightEdge = 1;
  let fontPx = 11;

  function layout(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    panelW = width; panelH = height;
    const padX = Math.max(12, width * 0.025);
    const top = 20, bottom = 8;
    const innerW = Math.max(40, width - padX * 2);
    const innerH = Math.max(20, height - top - bottom);
    const bw = Math.max(52, Math.min(124, innerW / (colCount * 1.55)));
    const rowPitch = innerH / maxRows;
    const bh = Math.max(14, Math.min(32, rowPitch * 0.82));
    fontPx = Math.max(9, Math.min(13, Math.round(bh * 0.42)));
    const colPitch = colCount > 1 ? (innerW - bw) / (colCount - 1) : 0;
    const startX = colCount > 1 ? padX : padX + (innerW - bw) / 2;

    boxes = []; boxByUid.clear();
    ctx.save();
    ctx.font = `600 ${fontPx}px sans-serif`;
    cols.forEach((uids, ci) => {
      const colH = uids.length * rowPitch;
      const y0 = top + (innerH - colH) / 2;
      uids.forEach((uid, ri) => {
        const def = defOf(uid);
        const name = def?.name ?? '?';
        let label = name;
        const max = bw - 10;
        if (ctx.measureText(label).width > max) {
          while (label.length > 1 && ctx.measureText(label + '…').width > max) label = label.slice(0, -1);
          label = label.trimEnd() + '…';
        }
        const terminal = !!def?.shot;
        let accent = '#8890b8';
        if (def?.shot) accent = ELEMENT_COLOR[def.shot.element];
        else if (def?.outputs[0]) accent = COLOR_HEX[def.outputs[0] as Color];
        const b: NodeBox = {
          uid, name, label, accent, terminal,
          x: startX + ci * colPitch, y: y0 + ri * rowPitch + (rowPitch - bh) / 2, w: bw, h: bh,
        };
        boxes.push(b); boxByUid.set(uid, b);
      });
    });
    ctx.restore();

    leftEdge = boxes.length ? Math.min(...boxes.map((b) => b.x)) : 0;
    rightEdge = boxes.length ? Math.max(...boxes.map((b) => b.x + b.w)) : width;

    curves = [];
    for (const l of graph.links) {
      const a = boxByUid.get(l.from.uid), b = boxByUid.get(l.toUid);
      if (!a || !b) continue;
      const fd = defOf(l.from.uid);
      const outs = fd?.outputs.length ?? 1;
      const td = defOf(l.toUid);
      const ins = td?.inputs.length ?? 1;
      const oy = (l.from.output - (outs - 1) / 2) * Math.min(6, a.h * 0.28);
      const iy = (l.toInput - (ins - 1) / 2) * Math.min(6, b.h * 0.28);
      const col = fd?.outputs[l.from.output];
      curves.push({
        fromUid: l.from.uid,
        x1: a.x + a.w, y1: a.y + a.h / 2 + oy, x2: b.x, y2: b.y + b.h / 2 + iy,
        color: col ? COLOR_HEX[col] : '#8890b8',
      });
    }
  }

  function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw(ctx: CanvasRenderingContext2D, ox: number, oy: number, s: StripState): void {
    ctx.save();
    ctx.translate(ox, oy);
    const pulse = 0.5 + 0.5 * Math.sin(s.time * 6);
    const ready = s.ready && s.hasShots;

    // panel
    ctx.fillStyle = 'rgba(8,10,22,0.82)';
    rr(ctx, 0, 0, panelW, panelH, 10); ctx.fill();
    ctx.lineWidth = ready ? 2 : 1;
    ctx.strokeStyle = ready ? `rgba(255,226,122,${0.45 + 0.5 * pulse})` : 'rgba(140,150,220,0.35)';
    if (ready) { ctx.shadowColor = '#ffe27a'; ctx.shadowBlur = 8 + 8 * pulse; }
    rr(ctx, 0.5, 0.5, panelW - 1, panelH - 1, 10); ctx.stroke();
    ctx.shadowBlur = 0;

    // header label
    ctx.font = '700 12px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#9aa0c8';
    ctx.fillText('SPELL', 12, 11);
    ctx.textAlign = 'right';
    if (s.hasShots) {
      ctx.fillStyle = ready ? '#ffe27a' : '#9fc4ff';
      ctx.fillText(ready ? 'Casting…' : `Charging ${Math.max(0, s.remaining).toFixed(1)}s`, panelW - 12, 11);
    }

    const barX = leftEdge + (rightEdge - leftEdge) * (ready ? 1 : Math.max(0, Math.min(1, s.progress)));
    const passedAll = ready;

    // links
    ctx.lineCap = 'round';
    for (const c of curves) {
      const src = boxByUid.get(c.fromUid)!;
      const lit = passedAll || barX >= src.x + src.w / 2;
      const dx = Math.max(10, (c.x2 - c.x1) * 0.5);
      ctx.globalAlpha = lit ? 1 : 0.45;
      ctx.strokeStyle = c.color;
      ctx.lineWidth = lit ? 2.2 : 1.5;
      ctx.beginPath();
      ctx.moveTo(c.x1, c.y1);
      ctx.bezierCurveTo(c.x1 + dx, c.y1, c.x2 - dx, c.y2, c.x2, c.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // nodes
    ctx.font = `600 ${fontPx}px sans-serif`;
    ctx.textAlign = 'center';
    for (const b of boxes) {
      const passed = passedAll || barX >= b.x + b.w / 2;
      const ft = s.flashes.get(b.uid);
      const fk = ft === undefined ? 0 : Math.max(0, 1 - (s.time - ft) / FLASH_DUR);
      ctx.save();
      if (fk > 0) { ctx.shadowColor = b.accent; ctx.shadowBlur = 18 * fk; }
      else if (passed) { ctx.shadowColor = b.accent; ctx.shadowBlur = 7; }
      ctx.fillStyle = fk > 0 ? mix(b.accent, fk) : passed ? 'rgba(52,58,104,0.97)' : 'rgba(24,27,52,0.95)';
      rr(ctx, b.x, b.y, b.w, b.h, 6); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = fk > 0 ? 2.5 : passed ? 2 : 1.2;
      ctx.strokeStyle = b.accent;
      ctx.globalAlpha = passed || fk > 0 ? 1 : 0.6;
      rr(ctx, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, 6); ctx.stroke();
      ctx.restore();
      // accent bar on left
      ctx.fillStyle = b.accent;
      ctx.globalAlpha = passed || fk > 0 ? 1 : 0.6;
      ctx.fillRect(b.x + 3, b.y + 4, 3, b.h - 8);
      ctx.globalAlpha = 1;
      ctx.fillStyle = fk > 0.35 ? '#10121c' : passed ? '#ffffff' : '#aab0d4';
      ctx.fillText(b.label, b.x + b.w / 2 + 2, b.y + b.h / 2 + 0.5);
    }

    // playhead
    if (s.hasShots) {
      const g = ctx.createLinearGradient(barX - 7, 0, barX + 7, 0);
      const c = ready ? '255,226,122' : '170,205,255';
      g.addColorStop(0, `rgba(${c},0)`);
      g.addColorStop(0.5, `rgba(${c},${ready ? 0.35 + 0.3 * pulse : 0.4})`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(barX - 7, 3, 14, panelH - 6);
      ctx.fillStyle = ready ? '#fff2b0' : '#e6f0ff';
      ctx.fillRect(barX - 1, 4, 2, panelH - 8);
    }
    ctx.restore();
  }

  return { layout, draw };
}

/** Blend an accent hex toward white-ish by k (1 = bright accent). */
function mix(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = 0.35 * (1 - k);
  const f = (v: number) => Math.round(v + (255 - v) * t);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
