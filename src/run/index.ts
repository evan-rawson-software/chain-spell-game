import './run.css';
import { BOONS, combineBoons } from '../data/boons';
import { isMuted, music, setMuted, sfx } from '../audio';
import type { MusicTrack } from '../contracts';
import type { AbilityId, BattleResult, MapNode, RunState } from '../types';
import type { App, Cleanup } from './app';
import { abilityScreen } from './screens/ability';
import { actScreen } from './screens/act';
import { endScreen } from './screens/end';
import { historyScreen } from './screens/history';
import { settingsScreen } from './screens/settings';
import { eventScreen } from './screens/event';
import { restScreen } from './screens/rest';
import { treasureScreen } from './screens/treasure';
import { forgeScreen } from './screens/forge';
import { mapScreen } from './screens/map';
import { battleScreen, prepareScreen } from './screens/prepare';
import { blessingScreen, rewardScreen } from './screens/reward';
import { schoolScreen } from './screens/school';
import { shopScreen } from './screens/shop';
import { shrineScreen } from './screens/shrine';
import { titleScreen } from './screens/title';
import { findNode } from './map';
import { advanceAct, dailySeed, manaGain, newRun, saveRun, type Phase } from './state';
import { updateTelemetry } from './telemetry';
import { installDevPanel } from './dev';
import { el } from './ui';

export { FLOOR_COUNT, floorDef, nodePreview } from './floors';
export { rollRewards } from './rewards';
export { newRun, applyReward } from './state';

export function startApp(root: HTMLElement): void {
  let cleanup: Cleanup | null = null;
  let lastResult: BattleResult | null = null;

  const app: App = {
    run: newRun(),
    visited: [],
    sold: [],
    ns: {},
    dailyPending: null,
    schoolPending: null,
    settingsBack: null,
    openSettings(back: () => void): void {
      app.settingsBack = back;
      app.goto.settings();
    },
    get lastResult(): BattleResult | null { return lastResult; },
    set lastResult(r: BattleResult | null) { lastResult = r; },
    battle: null,
    current: 'title',
    boons: BOONS,
    totals: () => combineBoons(app.run.boons),
    node: () => findNode(app.run.map, app.run.at),
    setRun(run: RunState): void { app.run = run; },
    show(build): void {
      try { cleanup?.(); } catch (e) { console.error(e); }
      cleanup = null;
      root.innerHTML = '';
      const screen = el('div', 'rn-screen', undefined, root);
      screen.dataset.act = String(app.run.act);
      cleanup = build(screen) ?? null;
    },
    save(phase: Phase): void { saveRun(app.run, phase, app.visited, app.sold, app.ns); },
    leaveNode(): void {
      const node = app.node();
      if (!node) { app.goto.map(); return; }
      // An act boss (acts 1 and 2) pays out like an elite; the final boss never reaches here (it ends the run).
      const gain = manaGain(node.kind === 'boss' ? 'elite' : node.kind, app.totals());
      app.run = { ...app.run, maxMana: app.run.maxMana + gain, floor: node.row + 1 };
      app.sold = [];
      app.ns = {};
      if (node.kind === 'boss' && app.run.act < 3) {
        app.run = advanceAct(app.run);
        app.visited = [];
        app.save('map');
        app.goto.act();
        return;
      }
      app.save('map');
      app.goto.map();
    },
    goto: {
      title: () => titleScreen(app),
      school: () => schoolScreen(app),
      ability: () => abilityScreen(app),
      history: () => historyScreen(app),
      settings: () => settingsScreen(app),
      act: () => actScreen(app),
      map: () => { app.save('map'); mapScreen(app); },
      prepare: () => prepareScreen(app),
      battle: () => battleScreen(app),
      reward: () => rewardScreen(app),
      blessing: () => blessingScreen(app),
      shop: () => shopScreen(app),
      forge: (mode?: 'upgrade' | 'fuse') => forgeScreen(app, mode),
      shrine: () => shrineScreen(app),
      event: () => eventScreen(app),
      treasure: () => treasureScreen(app),
      rest: () => restScreen(app),
      resume(phase: Phase): void {
        // A battle can't be resumed mid-fight; prepare is the safe re-entry point.
        const screens: Record<Phase, () => void> = {
          map: app.goto.map, prepare: app.goto.prepare, reward: app.goto.reward, shop: app.goto.shop,
          forge: app.goto.forge, shrine: app.goto.shrine, blessing: app.goto.blessing,
          event: app.goto.event, treasure: app.goto.treasure, rest: app.goto.rest,
        };
        screens[phase]();
      },
      newRun(schoolId: string, ability: AbilityId): void {
        const daily = app.dailyPending;
        app.dailyPending = null;
        app.schoolPending = null;
        app.run = daily ? newRun(dailySeed(daily), schoolId, daily, ability) : newRun(undefined, schoolId, null, ability);
        app.visited = [];
        app.sold = [];
        app.ns = {};
        app.lastResult = null;
        try { updateTelemetry(app.run, (t) => t); } catch (e) { console.error(e); }
        app.save('map');
        app.goto.act();
      },
      end: (won: boolean, record = true) => endScreen(app, won, record),
      pickNode(node: MapNode): void {
        app.visited = [...app.visited, node.id];
        app.sold = [];
        app.ns = {};
        app.lastResult = null;
        app.run = { ...app.run, at: node.id, floor: node.row };
        const next: Record<MapNode['kind'], () => void> = {
          battle: app.goto.prepare, elite: app.goto.prepare, boss: app.goto.prepare,
          shop: app.goto.shop, forge: app.goto.forge, shrine: app.goto.shrine,
          event: app.goto.event, treasure: app.goto.treasure, rest: app.goto.rest,
        };
        next[node.kind]();
      },
    },
  };

  /** Music per screen (DESIGN.md, Music); null on the end screens. */
  const trackFor = (name: string): MusicTrack | null => {
    switch (name) {
      case 'title': case 'school': case 'ability': case 'settings': case 'history': return 'title';
      case 'battle': return app.node()?.kind === 'boss' ? 'boss' : 'battle';
      case 'end': return null;
      default: return 'map';
    }
  };

  // Track the current screen for the dev panel (resume/newRun/pickNode delegate to the others).
  for (const name of Object.keys(app.goto) as (keyof App['goto'])[]) {
    if (name === 'resume' || name === 'newRun' || name === 'pickNode') continue;
    const fn = app.goto[name] as (...a: unknown[]) => void;
    (app.goto as unknown as Record<string, (...a: unknown[]) => void>)[name] = (...a: unknown[]): void => {
      app.current = name;
      try { music(trackFor(name)); } catch (e) { console.error(e); }
      fn(...a);
      app.onScreen?.();
    };
  }

  // Mute toggle: lives on <body> so it survives screen changes.
  const muteBtn = document.createElement('button');
  muteBtn.className = 'rn-mute';
  const syncMute = (): void => {
    muteBtn.textContent = isMuted() ? '\u{1F507}' : '\u{1F50A}';
    muteBtn.title = isMuted() ? 'Sound off (click to unmute)' : 'Sound on (click to mute)';
    muteBtn.setAttribute('aria-label', muteBtn.title);
  };
  muteBtn.addEventListener('click', () => {
    setMuted(!isMuted());
    syncMute();
    sfx('uiClick');
  });
  syncMute();
  document.body.appendChild(muteBtn);

  if (new URLSearchParams(location.search).has('dev')) installDevPanel(app);
  app.goto.title();
}
