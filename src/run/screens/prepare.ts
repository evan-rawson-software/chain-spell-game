import { CATALOG, ROOT_UID, SOURCE_ID } from '../../data/runes';
import { mountBattle } from '../../battle';
import { mountEditor } from '../../editor';
import { compileSpell, validateSpell } from '../../spell';
import type { BattleResult, SpellGraph } from '../../types';
import type { App } from '../app';
import { floorDef } from '../floors';
import { MAP_ROWS } from '../map';
import { effectiveWardHp } from '../state';
import { abandonControl, button, el, rowLabel, topBar } from '../ui';

export function prepareScreen(app: App): void {
  app.save('prepare');
  const node = app.node();
  const kind = node?.kind ?? 'battle';
  app.show((s) => {
    s.classList.add('rn-col');
    const totals = app.totals();
    const tag = kind === 'elite' ? 'elite' : kind === 'boss' ? 'boss' : undefined;
    const { right } = topBar(app, s, rowLabel(Math.min(app.run.floor, MAP_ROWS)), tag);
    const reason = el('span', 'rn-reason', undefined, right);
    reason.hidden = true;
    abandonControl(app, right);
    const begin = button(`Begin ${kind === 'boss' ? 'Boss Fight' : kind === 'elite' ? 'Elite Fight' : 'Battle'}`, 'rn-btn primary big', () => app.goto.battle(), right);

    const holder = el('div', 'rn-editor', undefined, s);

    const refresh = (): void => {
      let why = '';
      try {
        const v = validateSpell(app.run.graph, CATALOG, app.run.maxMana);
        if (!v.valid) why = v.errors[0] ?? 'Spell is invalid';
        else if (compileSpell(app.run.graph, CATALOG, totals.spell).shots.length === 0) why = 'Spell has no terminal rune that fires';
      } catch (e) {
        why = 'Spell is invalid';
        console.error(e);
      }
      begin.disabled = why !== '';
      begin.title = why;
      reason.textContent = why;
      reason.hidden = why === '';
    };
    refresh();

    const handle = mountEditor(holder, {
      catalog: CATALOG,
      owned: app.run.owned,
      root: { uid: ROOT_UID, defId: SOURCE_ID },
      graph: app.run.graph,
      maxMana: app.run.maxMana,
      extraGlobals: totals.spell,
      onChange: (g: SpellGraph) => {
        app.setRun({ ...app.run, graph: g });
        app.save('prepare');
        refresh();
      },
    });
    return () => handle.destroy();
  });
}

export function battleScreen(app: App): void {
  const node = app.node();
  const kind = node?.kind ?? 'battle';
  app.show((s) => {
    s.classList.add('rn-col');
    const holder = el('div', 'rn-battle', undefined, s);
    let done = false;
    const totals = app.totals();
    const plan = compileSpell(app.run.graph, CATALOG, totals.spell);
    app.lastResult = null;
    const handle = mountBattle(holder, {
      plan,
      graph: app.run.graph,
      catalog: CATALOG,
      floor: floorDef(node?.row ?? app.run.floor, kind),
      wardMaxHp: effectiveWardHp(app.run, totals),
      mods: totals.battle,
      onEnd: (r: BattleResult) => {
        if (done) return;
        done = true;
        app.lastResult = r;
        // Defer so the battle module can finish its own callback before teardown.
        setTimeout(() => {
          if (!r.won) app.goto.end(false);
          else if (kind === 'boss') app.goto.end(true);
          else app.goto.reward();
        }, 0);
      },
    });
    app.battle = handle;
    return () => { done = true; app.battle = null; handle.destroy(); };
  });
}
