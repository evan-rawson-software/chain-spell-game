# CLAUDE.md

Chain Spell is a roguelite spell-builder prototype. The player wires runes into a spell graph, then
aims that spell against real-time enemy waves across 3 acts of 6-row branching maps (battles,
elites, shops, forges, shrines, events, treasure, rest, an act boss), earning runes, gold, forge
upgrades, fusions and blessings/curses. **DESIGN.md is the game spec**; read it before changing game rules.

Live build: https://evan-rawson-software.github.io/chain-spell-game/

## Commands

```bash
npm run dev        # Vite dev server on :5173 (also .claude/launch.json "chain-spell-dev")
npm test           # Vitest (spell engine, rune catalog, rewards)
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production build to dist/
```

Pushing to `main` deploys to GitHub Pages (`.github/workflows/deploy.yml`, which runs the tests
and build first). `vite.config.ts` uses `base: './'` so assets resolve under the repo sub-path;
keep asset references relative.

## Architecture

TypeScript + Vite, no framework. Canvas 2D for battles, plain DOM + inline SVG for everything else.

| Path | Role |
|---|---|
| `src/types.ts` | Shared data types: colors, runes, modifiers, spell graph, cast plan, floors, run state |
| `src/contracts.ts` | Public API each module exports (`SpellEngine`, `MountEditor`, `MountBattle`) |
| `src/spell/` | Pure spell engine: placement, color merging, validation, compiling a graph into a `CastPlan` |
| `src/data/` | Rune catalog (`runes.ts`), schools (`schools.ts`), blessings/curses (`boons.ts`), fusion recipes (`fusions.ts`) |
| `src/editor/` | Rune editor UI: graph by level, placement previews, inventory, live spell stats |
| `src/battle/` | Real-time arena: enemies, projectiles, statuses, reactions (`reactions.ts`), juice, HUD; `dev.ts` has demo data |
| `src/audio/` | Sound effects `sfx(name)` and music `music(track)`, volumes from settings; clips in `public/sfx/`, loops in `public/music/` (built by `tools/build-sfx.py` / `tools/build-music.py`) |
| `src/settings.ts` | Player settings (volumes, shake, number size, colorblind) in localStorage; `getSettings`/`setSettings`/`onSettings` |
| `src/run/` | Run state, acts/map, floors, seeded rewards, node screens, loadouts, history, telemetry, settings screen, localStorage save (`chain-spell-run-v3`), screen flow (`startApp`) |
| `src/main.ts` | Entry point: `startApp(#app)` |

Data flow: `run` owns `RunState`. The editor edits `graph` through the spell engine, then
`compileSpell` produces a `CastPlan` that is handed to the battle, and the battle result drives the
reward or defeat screen.

### Module boundaries

- `types.ts` and `contracts.ts` are the contract between modules. Change them deliberately and
  update every affected module in the same change.
- Modules import each other only through the entry points named in `contracts.ts`.
- `src/spell/` stays pure (no DOM) and fully unit-tested. Rule changes go there with tests.
- Balance lives in data: rune stats in `src/data/runes.ts`, enemy stats in `src/battle/model.ts`,
  floor waves and HP scaling in `src/run/floors.ts`, reward weights in `src/run/rewards.ts`.

## Key rules (summary of DESIGN.md)

- Colors are bitmasks (R=1, G=2, B=4). A complex input (Y/P/T/W) takes one exact-color output or
  several disjoint primaries from runes on the **same level**. A complex output can feed a primary
input it contains (P → R or B, W → any); see `outputFeeds` in `src/spell/index.ts`.
- All of a rune's inputs come from a single level; rune level = parents' level + 1. Merges and
  multi-input terminals make the spell a DAG.
- Augments on branching runes apply only to descendants; a shared ancestor counts once.
  Terminal runes with `globals` affect every shot.
- Stacking: `(base + flat) * (1 + sum(increased)) * product(1 + more)`.
- Terminals fire depth-first; siblings fire in `graph.nodes` order (the editor's top-to-bottom
  order within a level, which the player can drag to change), `stagger` seconds apart.
- Mana is a static build budget that grows per cleared map node (`manaGain` in
  `src/run/state.ts`); cast time is the in-combat cost. Battles reward gold and runes (pick 2 of 5);
  elites and shrines give blessings; shops sell runes, forging and curse removal. Ward HP resets
  each floor.
- Socket bonuses (`RuneDef.socketBonus`) switch on extra mods when an input is fed by a matching
  output; share codes (`encodeSpell`/`decodeSpell`) are in `src/spell/`.
- Keystones (`RuneDef.keystone`) are shotless terminals that turn on a combat rule; `CastPlan.keystones`
  lists them and `src/battle/keystones.ts` implements them.
- Reactions: a hit checks the enemy's statuses before applying its own (`src/battle/reactions.ts`).
- Forged runes (`RuneInstance.plus`) resolve through `defOf`/`upgradeDef`; never read
  `catalog[inst.defId]` directly for an instance.
- No meta-progression in the MVP.

## Working conventions

- For larger coding tasks, act as orchestrator: split the work by module (the folders above own
  disjoint files) and run parallel Sonnet subagents, then integrate and verify.
- Verify gameplay changes in the browser (dev server), not just with tests: start a run, place a
  rune, fight a floor, and check the console for errors. Open `http://localhost:5173/?dev` for the
  dev panel (`src/run/dev.ts`): jump to any map node, grant gold/runes/boons, win/lose/speed up battles.
