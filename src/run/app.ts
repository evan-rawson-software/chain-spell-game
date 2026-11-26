import type { BattleHandle, BoonTotals } from '../contracts';
import type { AbilityId, BattleResult, BoonDef, MapNode, RunState } from '../types';

export type Cleanup = () => void;

/** Shared controller state handed to every screen. Screens import only this type, never each other. */
export interface App {
  /** Current run; replace through setRun. */
  run: RunState;
  /** Map node ids visited so far, in order (includes the node being played). */
  visited: string[];
  /** Shop stock indexes already bought at the current shop. */
  sold: number[];
  /** Per-node state that must survive a reload (reroll flag, event outcome, shop ops). Reset per node. */
  ns: import('./state').NodeState;
  /** Set by the title's Daily button: the next run started from the school screen is this daily date. */
  dailyPending: string | null;
  /** School chosen on the school screen, waiting for the ability pick. */
  schoolPending: string | null;
  /** Where the settings screen returns to. */
  settingsBack: (() => void) | null;
  /** Open the settings screen; its Back button runs `back`. */
  openSettings(back: () => void): void;
  lastResult: BattleResult | null;
  /** Live battle (set by the battle screen, null otherwise); used by the ?dev panel. */
  battle: BattleHandle | null;
  /** Name of the screen last opened through `goto` (dev panel use). */
  current: string;
  /** Called after every `goto` screen change (dev panel use). */
  onScreen?: () => void;
  boons: Record<string, BoonDef>;
  /** Combined effects of the held blessings/curses. */
  totals(): BoonTotals;
  /** The node being played (or last cleared when on the map). */
  node(): MapNode | undefined;
  setRun(run: RunState): void;
  show(build: (screen: HTMLElement) => Cleanup | void): void;
  /** Persist with the given phase (visited/sold included). */
  save(phase: import('./state').Phase): void;
  /** Apply the mana gain for the current node, advance the floor, and return to the map. */
  leaveNode(): void;
  goto: {
    title(): void;
    school(): void;
    ability(): void;
    history(): void;
    settings(): void;
    /** The title card that opens an act (Continue goes to the map). */
    act(): void;
    map(): void;
    prepare(): void;
    battle(): void;
    reward(): void;
    blessing(): void;
    shop(): void;
    forge(mode?: 'upgrade' | 'fuse'): void;
    shrine(): void;
    event(): void;
    treasure(): void;
    rest(): void;
    /** Resume a loaded save in its phase. */
    resume(phase: import('./state').Phase): void;
    newRun(schoolId: string, ability: AbilityId): void;
    /** record = false skips the history/telemetry write (dev panel). */
    end(won: boolean, record?: boolean): void;
    pickNode(node: MapNode): void;
  };
}
