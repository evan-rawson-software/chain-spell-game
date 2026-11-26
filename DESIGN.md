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

### Active ability
Picked at run start (after the school) and used in battle with **Space**, **right-click** or the
HUD button. One ability per run:
- **Overcast** (20 s cooldown): fires the whole spell immediately as an extra cast; the next
  charge then takes twice as long.
- **Ward Pulse** (18 s): a shockwave from the circle knocks enemies within 300 px back 200 px,
  slows them 50% for 2 s and destroys enemy projectiles inside it.
- **Detonate** (22 s): every status on every enemy is consumed for burst damage: burn deals 3 s of
  its damage ×2, poison its remaining damage ×1.5, slow or freeze 30 frost, wet 20 lightning,
  weaken 25 arcane. Scaled by reaction damage; it never triggers reactions.

### Directions
Spawn groups can enter from the top or bottom edge (anywhere from x 350 to 900) as well as the
right. Act 1 uses only the right edge; act 2 sends some groups from the top or bottom; act 3 more.

### Shot timing
Within one cast, a shot never overtakes the shot fired before it: its speed is capped at the
previous shot's (already capped) speed. The editor order therefore decides which shot lands first,
so a combo like Frost Bolt → Fireball reliably Melts. Echo volleys count as a separate cast;
Hydra shards are exempt.

### Enemies
| Enemy | Question it asks | Rule |
|---|---|---|
| Shield Bearer | Many small hits? | A shield absorbs the first hit completely (one projectile, blast or arc). It regrows after 4 s without being hit. Damage over time ignores the shield. |
| Splitter | Area damage? | Splits into 3 Splitlings on death (small, fast, low HP). |
| Cleanser | Burst it first? | Stops at range; every 4 s strips all statuses from enemies within 150 (visible pulse). |
| Armored | Freeze or weaken it? | Takes 60% less damage unless it is frozen or weakened. |
| Swarmer | Pierce / chain? | Arrives in packs of 8–12; tiny, fast, 12 HP. |

### Elite traits
Every elite floor rolls one trait for its elite enemies, shown on the map before you pick:
Hasted (+40% speed), Reflective (15% of damage taken hits the ward, max 5 per hit),
Regenerating (heals 2% max HP/s after 2 s without being hit), Burn-immune (no burn, fire −50%).

### Bosses
Each act ends in one of the three bosses (all three per run, seeded order); the map shows which.
- **Lich King:** ranged volleys and summons (the original boss).
- **Stone Golem:** slow melee; its shell cuts damage by 75%. A Shatter, Combust or Overload on it
  breaks the shell for 6 s. Every 8 s it stomps, sending a shockwave that damages the ward.
- **Hydra:** at 66% and 33% HP it grows 2 Hydra Heads (stationary spitters, 15% of the boss's
  max HP each).

### Hazards
Some battle floors (row 3+, ~30%, seeded per node) carry a hazard, shown on the map:
- **Rain:** every enemy is permanently Wet; fire damage −25%.
- **Heatwave:** every 5 s all enemies start Burning (3 dps, 3 s); slows are half as strong.
- **Fog:** enemies more than 570 px from the ward are hidden until hit; auto-aim only targets visible enemies.

### Practice range
A **Practice** toggle in the editor splits the canvas: the graph on top, a practice arena below.
Three training dummies (one strafes slowly) with huge HP that refills, statuses shown. The spell
auto-fires (at the cursor if over the arena, else the nearest dummy) and updates on every edit.
Shows damage per second (last 5 s), reaction callouts and a per-shot damage tally. Nothing
attacks the ward, so Momentum keeps climbing.

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

### Acts and map
- A run is **3 acts**. Each act has its own seeded 6-row map: row 1 battles, rows 2–4 mixed, row 5
  a rest row (shop / forge / shrine / rest), row 6 that act's boss. Every run fights all three
  bosses (Lich King, Stone Golem, Hydra) in a seeded order; beating the act-3 boss wins the run.
- Each act has its own arena look: **I. The Crypt** (stone), **II. The Frozen Marsh** (blue-green,
  mist), **III. The Storm Spire** (violet, lightning flashes). A short title card opens each act.
- Difficulty follows depth d = (act − 1) × 6 + row (1..18): wave tables and HP scaling stretch over
  the whole run; featured enemies unlock by depth; act 2 adds top/bottom entries, act 3 more.
- Rows 2–4 have 2–4 nodes each with at least one battle; treasure and rest from row 2; at least one
  elite on row 3 or 4. Edges link each node to 1–2 nodes in nearby columns of the next row
  without crossing; every node is reachable and every non-boss node has a way out.
- Node kinds:

| Node | What happens |
|---|---|
| **Battle** | Prepare (rune editor) → fight. Win: gold, pick 2 of 5 runes, +2 max mana. |
| **Elite** | Harder fight (an Elite Knight joins, HP +10%). Win: more gold, rarer runes, +3 max mana, and pick 1 of 3 blessings. |
| **Shop** | Spend gold: 5 runes for sale, a forge service, and removing a curse. Purchases persist. |
| **Forge** | Upgrade one owned rune for free, **or** fuse two runes (see Fusion). |
| **Shrine** | Pick 1 of 2 blessings, **or** take a Dark Bargain: a random curse plus a random rare rune and gold. |
| **Event (?)** | A short choice with a tradeoff (see Events). |
| **Treasure** | Pick 1 of 3 rare runes; at least one is a keystone. |
| **Rest** | +10 max ward HP, **or** forge one rune for free. |
| **Boss** | Final fight. Winning ends the run in victory. |

- Map weights: battle 50, elite 12, shop 13, forge 12, shrine 13, event 10, treasure 4, rest 6.
- Battle and elite nodes preview their featured enemy, hazard and elite trait; the boss node shows
  the run's boss. Each battle node features one enemy type unlocked by its row (Shield Bearer and
  Swarmer from row 2, Splitter from row 3, Armored and Cleanser from row 4) mixed into its waves.
- Non-combat nodes (shop, forge, shrine, event, treasure, rest) grant +1 max mana when left. Gold
  starts at 20.
- **Reward reroll:** once per reward screen, pay 15 gold (× price boons) to reroll the rune cards.
- **Shop extras:** sell a rune (common/starter 15, uncommon 25, rare 40, +10 if forged), or
  transmute two runes of the same rarity into a random rune one rarity higher (two rares → a
  random rare or keystone).

### Events
Seeded per node. Each offers its choice or Leave.
- **Wounded Mage:** pay half your gold (min 10) for a random uncommon or rare rune.
- **Rune Altar:** sacrifice a rune to forge two other random unforged runes.
- **Cursed Tome:** take a random curse to forge every rune in your spell.
- **Wandering Merchant:** trade a rune for a random rune one rarity higher.
- **Gambler's Dice:** pay 25 gold; 50% chance to win 60.
- **Fountain:** +15 max ward HP, or remove a random curse.
- **Alchemist:** fuse two runes using any recipe you can make, for 20 gold.

### Daily seed and run summary
- **Daily run** on the title screen: the seed comes from today's local date, so everyone gets the
  same map, bosses and offers that day. The top bar marks it as daily.
- The end screen (victory or defeat) shows the final spell graph, damage dealt per rune, reactions
  by type, and run totals (battles, kills, best hit, gold, boons, seed or daily date).
- **[default]** Prices: common 30, uncommon 50, rare 80, forge 40, remove curse 50 (all × price boons).

### Socket bonuses
Some runes carry a **socket bonus**: extra modifiers that switch on when any of their inputs is fed
by a matching output (an exact color, a specific rune, or any complex color). A branching rune's
bonus adds augments for its descendants; a terminal's bonus modifies its own shot. The editor
shows each bonus and whether it is active.

### Fusion
Recipes in `src/data/fusions.ts` turn two owned runes into one unique **fused** rune (rarity
`fused`, never offered as a reward). At a forge you may fuse instead of upgrading: one copy of each
ingredient is consumed (removed from the spell and loadouts if placed). The forge shows the recipe
book: a recipe's result stays "???" until you own both ingredients. The Alchemist event also fuses.

### Loadouts
Up to 3 saved spell layouts, switched on the prepare screen before a fight. Switching stores the
current spell in its slot and loads the other (an empty slot starts as the Source alone). Selling,
transmuting or fusing a rune removes it from every loadout.

### Share codes
A spell can be copied as a short code (`CS1.` + URL-safe base64 of its runes, forged flags and
links). Importing a code previews it in the practice range; **Use** applies it when you own enough
copies of each rune (forged ones must be forged) and it fits your mana.

### Run history and telemetry
- **History** (title screen): the last 30 runs: date, school, ability, seed or daily date, result
  and how far you got, boss reached, best hit, kills, top rune, and the final spell's share code.
- **Telemetry** (local only): per run, rewards offered and taken, shop purchases, final spell,
  damage share per rune, reactions, and where the run ended. Kept in localStorage (last 200 runs);
  the `?dev` panel can export it as JSON or clear it. Never sent anywhere.

### Settings
A settings screen (title screen and the ⚙ in the top bar): master, sound-effect and music volume,
screen-shake strength, damage-number size, and **colorblind mode**, which draws a shape on every
socket and color pip (R ▲, G ●, B ■, Y ◆, P ✚, T ⬟, W ✱). Stored in `src/settings.ts`.

### Music
Looping tracks for the title, map/editor, battles and bosses, crossfading on screen changes,
following the music volume and mute.

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
Each run starts by picking a school (starter kit, starting spell and a blessing), then an active
ability:

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
