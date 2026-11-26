# Chain Spell — Prototype Design

A roguelite "spell-builder": the player is a warden who assembles runes into a spell graph,
then defends against real-time waves by aiming that spell. Between floors they earn new runes
and freely rebuild the spell.

Items marked **[default]** are proposals filled in by Claude, not yet confirmed.

---

## 1. Runes

Every rune has:

| Property | Description |
|---|---|
| **Inputs** | ≥ 1 (except the Source rune). Each has a color and links to an open output on the previous level. Terminal runes may need more inputs than any single parent can supply (e.g. R + R + B), drawing on outputs from several parents. |
| **Outputs** | 0–3, each colored. Open outputs are where later runes attach. |
| **Effect** | Terminal runes (0 outputs) have a **base effect**. Branching runes (≥ 1 output) have an **augment** applied to all descendants. |
| **Mana cost** | Counts against the player's max mana (build budget). |
| **Cast time** | Added to the spell's total cast time. |

### Colors

- Primary: **Red**, **Green**, **Blue**
- Complex: **Purple** (R+B), **Yellow** (R+G), **Teal** (G+B), **White** (R+G+B)

A complex input is satisfied by either:
1. a single output of that exact color, **or**
2. a combination of open outputs from runes on the **same tree level** whose colors add up to it
   (e.g. a Red output + a Blue output on level 2 → one Purple input on level 3).

A complex output can also feed a **primary** input that is one of its components
(Purple → Red or Blue; White → any primary). It can't feed a different complex input
(Purple can't feed Yellow or White on its own).

**[default]** Color ↔ element: Red = Fire, Blue = Frost, Green = Nature/Poison,
Yellow = Lightning, Purple = Arcane, Teal = Storm, White = Pure.

### Structure

- The **Source** rune is placed by default at level 0. It has no input. **[default]** The starter
  Source has 3 outputs: Red + Blue + Green.
- A rune's level = its parents' level + 1. Merging only happens across runes on the same level,
  so a merged rune's level is still well-defined.
- **[default]** All of a rune's inputs must come from runes on one level, whether combined into a
  complex color or used as separate inputs. That keeps every rune's level well-defined.
- Because merges and multi-input terminals give a rune several parents, the spell is a **DAG**, not a strict tree.
- **Open outputs are allowed.** They do nothing when cast.

## 2. Spell evaluation

When the spell is cast:

1. Find every **terminal rune** (0 outputs).
2. For each terminal, collect the **union of all its ancestors** across every parent path.
   A shared ancestor is counted **once** (no double-dipping through a merge).
3. Apply those ancestors' augments to the terminal's base effect. A branching rune's augment
   affects **only its descendants**, never sibling branches.
   Exception: some **global terminal runes** affect the whole spell (e.g. "Catalyst: all Fire
   terminals +20%"). Global effects are applied to every terminal after its own ancestor augments.
4. Terminals fire **in sequence**: **[default]** depth-first, following the order runes are
   stacked in each level of the editor (drag a rune to reorder its level), with a short
   stagger (~0.1 s) between them, so order-dependent combos are possible (apply Wet, then
   Lightning).

**[default] Stacking order** (per terminal):
1. Flat additions (`+10 damage`)
2. Summed "% increased" modifiers (`+30%` and `+20%` → ×1.5)
3. Multiplied "× more" modifiers (rare runes: `×1.5`, `×2`)

## 3. Limits on spell size

- **Mana (static build budget):** total rune mana cost must fit under the player's max mana.
  Not spent in combat. Max mana rises automatically after each cleared floor (+2, or +3 after
  the elite floor).
- **Cast time:** spell cast time = base + sum of rune cast times. Bigger spells fire less often.
  Some runes reduce cast time or mana cost as a tradeoff.

## 4. Combat: real-time waves

- The player is a stationary magic circle on the ground; enemies come in waves. The circle grows
  more animated as the spell charges and pulses when it fires.
- **Melee enemies** walk to the ward circle and damage on arrival/contact.
- **Ranged enemies** stop at a distance and fire projectiles.
- **Auto-cast:** the spell charges over its cast time and fires as soon as it is charged: toward
  the cursor when it is over the arena, otherwise at the nearest enemy.
- Ward HP **resets to full at the start of each floor**. Reaching 0 during a floor ends the run.

### Elemental reactions
A hit checks the enemy's statuses **before** applying its own, so shot order matters (Frost Bolt
then Fireball melts; reorder a level in the editor to change it). Reaction damage never triggers
further reactions, and is scaled by the reaction-damage battle mod.

| Reaction | Enemy has | Hit element | Effect | Consumes |
|---|---|---|---|---|
| Shatter | Freeze | any but frost | hit deals ×2 | freeze |
| Melt | Slow | fire | hit deals ×1.5 | slow |
| Steam | Burn | frost | cloud (r 80): Wet 50% 3 s and Slow 30% 2 s on everyone inside | burn |
| Combust | Poison | fire | remaining poison damage ×1.5, dealt at once to the target and everyone within 80 | poison |
| Wildfire | Burn | nature | the burn spreads to everyone within 100 | — |
| Electrocute | Wet | lightning | arcs to every other wet enemy within 180 for 50% of the hit | wet (all hit) |
| Overload | Burn | lightning | blast (r 70) for 40% of the hit | burn |
| Unravel | 2+ status kinds | arcane | +25% damage per status kind | all statuses |

The existing Wet bonus to lightning still applies to the triggering hit.

### Keystones
Rare terminal runes that fire nothing and change a combat rule instead of adding numbers.
Several copies of the same keystone in one spell count once.

| Rune | In | Rule |
|---|---|---|
| Echo Glyph | P | Every 3rd cast fires the whole spell again 0.3 s later. |
| Hydra Sigil | Y | A shot that kills an enemy splits into 2 homing shards (50% damage; shards don't split). |
| Eternal Knot | T | Reactions don't consume statuses. |
| Cascade Core | W | Reaction damage can trigger further reactions (up to 3 deep). |
| Frostfire Seal | R + B | Fire hits also slow (30%, 1.5 s); frost hits also burn (5 dps, 2 s). |
| Momentum | R | +10% damage per cast since the ward was last hit, up to +100%; resets when hit. |

### Big spell moments
- Screen shake from explosions, reactions, big hits, ward hits and elite/boss deaths (reduced
  under `prefers-reduced-motion`).
- Brief hit-stop on big hits and elite kills; slow motion and a flash when an elite or the boss dies.
- Multi-kill callouts (3+ kills within 0.5 s) and a combo counter for steady kills.
- Damage numbers grow with damage; reaction hits get a named callout.
- Large casts (many projectiles or high total damage) get a bigger circle shockwave.

### Effect categories in scope

| Category | Examples |
|---|---|
| Damage + augments | Fireball (base 40), Amplify (+30% damage), Empower (×1.5 more) |
| Elements & status | Burn (DoT), Slow/Freeze, Poison stacks, Chain lightning; enemy resistances/weaknesses |
| Shape modifiers | Split into N projectiles, Pierce, AoE radius, Homing |
| Branching | Every routing rune has two or three outputs (Split, Pierce, Prism Fork, Photosynth…); mergers combine primaries (Prism Merge R+B → P,P; Prismatic Heart R+G+B → W) |
| Cast-time / mana | Quicken (−cast time, −damage), Thrift (−mana cost), Overload (+damage, +cast time) |

## 5. Run structure

### Map
- **Branching map.** 10 rows, seeded from the run seed. Row *r* uses floor *r*'s difficulty
  (waves and HP scaling). The player picks one node per row, moving along the map's edges.
- Row 1: 3 battle nodes. Rows 2–8: 2–4 nodes each, at least one battle per row, elites only from
  row 4 and always at least one on row 5. Row 9: a rest row (shop / forge / shrine only). Row 10: a single boss node.
- Edges link each node to 1–2 nodes in nearby columns of the next row, without crossing. Every
  node in rows 2–10 has a way in and every node in rows 1–9 has a way out.
- Node kinds:

| Node | What happens |
|---|---|
| **Battle** | Prepare (rune editor) → fight. Win: gold, pick 2 of 5 runes, +2 max mana. |
| **Elite** | Harder fight (an Elite Knight joins, HP +10%). Win: more gold, rarer runes, +3 max mana, and pick 1 of 3 blessings. |
| **Shop** | Spend gold: 5 runes for sale, a forge service, and removing a curse. Purchases persist. |
| **Forge** | Upgrade one owned rune for free. |
| **Shrine** | Pick 1 of 2 blessings, **or** take a Dark Bargain: a random curse plus a random rare rune and gold. |
| **Boss** | Final fight. Winning ends the run in victory. |

- Shop, forge and shrine nodes grant +1 max mana when left. Gold starts at 20.
- **[default]** Prices: common 30, uncommon 50, rare 80, forge 40, remove curse 50 (all × price boons).

### Forge
A forged rune is the same rune with a **+**: `upgradeDef` in `src/spell/`.
- Inputs, outputs and cast time are unchanged, so a placed rune stays valid. Mana −1 (min 0).
- Shot: damage ×1.5, status potency ×1.25.
- Augments and globals: beneficial values ×1.5 (positive for shot stats, negative for
  cast time / mana cost); a flat count, pierce or chain bonus gets +1 instead. Drawbacks are unchanged.
- A rune can be forged once. The Source can't be forged.

### Blessings and curses
Run-wide effects held in `RunState.boons` (data in `src/data/boons.ts`). Blessings come from the
starting school, elites and shrines; curses come from Dark Bargains and are removed at shops.
A boon can change shot stats for every shot (only shot stats, never cast time or mana, so the
editor's validation and combat always agree), battle multipliers (enemy HP / speed / damage,
reaction damage, ward regen), max ward HP, gold, shop prices, runes offered and mana gained.

### Run start: schools
Each run starts by picking a school, which sets the starter kit, starting spell and a blessing:

| School | Kit | Blessing |
|---|---|---|
| Elementalist | Amplify, Fireball, Frost Bolt | Catalysis (reactions +50%) |
| Pyromancer | Amplify, Fireball, Ember Dart | Ember Heart (+20% fire damage) |
| Cryomancer | Frost Focus, Frost Bolt, Ice Shard, Ember Dart | Frost Heart (+20% frost damage) |
| Druid | Bloom, Thorn Shot, Poison Cloud, Ember Dart | Verdant Heart (+25% nature status potency) |

- Between battles the player opens the **Rune Editor**: all owned runes sit in an inventory
  and the spell can be fully rebuilt.

### Starter kit **[default]**

| Rune | In | Out | Effect | Mana | Cast |
|---|---|---|---|---|---|
| Source | — | R, B | — | 0 | 0.5 s base |
| Amplify | R | R | +30% damage | 2 | 0.1 s |
| Fireball | R | — | 40 fire damage, small AoE | 2 | 0.2 s |
| Frost Bolt | B | — | 25 frost damage, slows | 2 | 0.2 s |

Starting spell: `Source →R→ Amplify →R→ Fireball` and `Source →B→ Frost Bolt`. Max mana 8.

## 6. Dev tools
Open the game with `?dev` in the URL for a dev panel: jump to any map node, add gold, runes or
boons, set max mana, and in battle win, lose or speed the game up. Not shown without the flag.

## 7. Tech

- TypeScript + Vite, no framework.
- Canvas 2D for the battle arena; DOM/SVG for the Rune Editor (node graph with drag-to-connect).
- Rune definitions as data (JSON/TS objects) so balance tweaks need no code changes.
- Spell evaluation as a pure, unit-tested module (graph → list of resolved terminal effects).

## 8. Scope decisions

- No meta-progression in the MVP: every run starts from a school's starter kit.
