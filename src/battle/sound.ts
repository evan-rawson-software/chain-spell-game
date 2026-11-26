import { sfx as rawSfx, type SfxName, type SfxOptions } from '../audio';

/**
 * Battle-side sfx entry point. Normally a pass-through; the practice range installs a filter
 * so its constant firing stays quiet. Only one battle or practice runs at a time.
 */
type Filter = (name: SfxName, opts?: SfxOptions) => SfxOptions | null;
let filter: Filter | null = null;

export function setSoundFilter(f: Filter | null): void { filter = f; }

export function sfx(name: SfxName, opts?: SfxOptions): void {
  if (!filter) { rawSfx(name, opts); return; }
  const o = filter(name, opts);
  if (o) rawSfx(name, o);
}
