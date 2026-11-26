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
4. Terminals fire **in sequence**: **[default]** depth-first, left-to-right order, with a short
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

### Effect categories in scope

| Category | Examples |
|---|---|
| Damage + augments | Fireball (base 40), Amplify (+30% damage), Empower (×1.5 more) |
| Elements & status | Burn (DoT), Slow/Freeze, Poison stacks, Chain lightning; enemy resistances/weaknesses |
| Shape modifiers | Split into N projectiles, Pierce, AoE radius, Homing |
| Branching | Every routing rune has two or three outputs (Split, Pierce, Prism Fork, Photosynth…); mergers combine primaries (Prism Merge R+B → P,P; Prismatic Heart R+G+B → W) |
| Cast-time / mana | Quicken (−cast time, −damage), Thrift (−mana cost), Overload (+damage, +cast time) |

## 5. Run structure

- **Linear floors.** **[default]** 10 floors: elite on floor 5, boss on floor 10.
- After each floor: **[default]** pick 2 of 5 runes (rewards are always runes). Elites/bosses
  offer rarer runes. Max mana goes up automatically (+2 per floor, +3 after the elite).
- Between floors the player opens the **Rune Editor**: all owned runes sit in an inventory
  and the spell can be fully rebuilt.

### Starter kit **[default]**

| Rune | In | Out | Effect | Mana | Cast |
|---|---|---|---|---|---|
| Source | — | R, B | — | 0 | 0.5 s base |
| Amplify | R | R | +30% damage | 2 | 0.1 s |
| Fireball | R | — | 40 fire damage, small AoE | 2 | 0.2 s |
| Frost Bolt | B | — | 25 frost damage, slows | 2 | 0.2 s |

Starting spell: `Source →R→ Amplify →R→ Fireball` and `Source →B→ Frost Bolt`. Max mana 8.

## 6. Tech

- TypeScript + Vite, no framework.
- Canvas 2D for the battle arena; DOM/SVG for the Rune Editor (node graph with drag-to-connect).
- Rune definitions as data (JSON/TS objects) so balance tweaks need no code changes.
- Spell evaluation as a pure, unit-tested module (graph → list of resolved terminal effects).

## 7. Scope decisions

- No meta-progression in the MVP: every run starts from the same starter kit.
