import './run.css';
import { BOONS, combineBoons } from '../data/boons';
import { isMuted, setMuted, sfx } from '../audio';
import type { BattleResult, MapNode, RunState } from '../types';
import type { App, Cleanup } from './app';
import { endScreen } from './screens/end';
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
import { dailySeed, manaGain, newRun, saveRun, type Phase } from './state';
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
      cleanup = build(screen) ?? null;
    },
    save(phase: Phase): void { saveRun(app.run, phase, app.visited, app.sold, app.ns); },
    leaveNode(): void {
      const node = app.node();
      if (!node) { app.goto.map(); return; }
      const gain = manaGain(node.kind, app.totals());
      app.run = { ...app.run, maxMana: app.run.maxMana + gain, floor: node.row + 1 };
      app.sold = [];
      app.ns = {};
      app.save('map');
      app.goto.map();
    },
    goto: {
      title: () => titleScreen(app),
      school: () => schoolScreen(app),
      map: () => { app.save('map'); mapScreen(app); },
      prepare: () => prepareScreen(app),
      battle: () => battleScreen(app),
      reward: () => rewardScreen(app),
      blessing: () => blessingScreen(app),
      shop: () => shopScreen(app),
      forge: () => forgeScreen(app),
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
      newRun(schoolId: string): void {
        const daily = app.dailyPending;
        app.dailyPending = null;
        app.run = daily ? newRun(dailySeed(daily), schoolId, daily) : newRun(undefined, schoolId);
        app.visited = [];
        app.sold = [];
        app.ns = {};
        app.lastResult = null;
        app.goto.map();
      },
      end: (won: boolean) => endScreen(app, won),
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

  // Track the current screen for the dev panel (resume/newRun/pickNode delegate to the others).
  for (const name of Object.keys(app.goto) as (keyof App['goto'])[]) {
    if (name === 'resume' || name === 'newRun' || name === 'pickNode') continue;
    const fn = app.goto[name] as (...a: unknown[]) => void;
    (app.goto as unknown as Record<string, (...a: unknown[]) => void>)[name] = (...a: unknown[]): void => {
      app.current = name;
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
