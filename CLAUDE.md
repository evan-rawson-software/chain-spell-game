# CLAUDE.md

Chain Spell is a roguelite spell-builder prototype. The player wires runes into a spell graph, then
aims that spell against real-time enemy waves across 10 linear floors, earning new runes between
floors. **DESIGN.md is the game spec**; read it before changing game rules.

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
| `src/data/runes.ts` | Rune catalog (`CATALOG`), starter kit and graph, `runeTooltip` |
| `src/editor/` | Rune editor UI: graph by level, placement previews, inventory, live spell stats |
| `src/battle/` | Real-time arena: enemies, projectiles, statuses, waves, HUD; `dev.ts` has demo data |
| `src/run/` | Run state, floors, seeded rewards, localStorage save, screen flow (`startApp`) |
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
- Terminals fire depth-first, left-to-right, `stagger` seconds apart.
- Mana is a static build budget that grows automatically per cleared floor (`manaGain` in
  `src/run/state.ts`); cast time is the in-combat cost. Rewards are runes only (pick 2 of 5). Wizard HP resets
  each floor.
- No meta-progression in the MVP.

## Working conventions

- For larger coding tasks, act as orchestrator: split the work by module (the folders above own
  disjoint files) and run parallel Sonnet subagents, then integrate and verify.
- Verify gameplay changes in the browser (dev server), not just with tests: start a run, place a
  rune, fight a floor, and check the console for errors.
