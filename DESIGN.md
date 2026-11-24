# Chain Spell — Prototype Design

A roguelite "spell-builder": the player is a wizard who assembles runes into a spell graph,
then defends against real-time waves by aiming that spell. Between floors they earn new runes
and freely rebuild the spell.

Items marked **[default]** are proposals filled in by Claude, not yet confirmed.

---

## 1. Runes

Every rune has:

| Property | Description |
|---|---|
| **Inputs** | ≥ 1 (except the Source rune). Each has a color and links to an open output on the previous level. Terminal runes may need more inputs than any single parent can supply (e.g. R + R + B), drawing on outputs from several parents. |
| **Outputs** | 0–2, each colored. Open outputs are where later runes attach. |
| **Effect** | Terminal runes (0 outputs) have a **base effect**. Branching runes (≥ 1 output) have an **augment** applied to all descendants. |
| **Mana cost** | Counts against the wizard's max mana (build budget). |
| **Cast time** | Added to the spell's total cast time. |

### Colors

- Primary: **Red**, **Green**, **Blue**
- Complex: **Purple** (R+B), **Yellow** (R+G), **Teal** (G+B), **White** (R+G+B)

A complex input is satisfied by either:
1. a single output of that exact color, **or**
2. a combination of open outputs from runes on the **same tree level** whose colors add up to it
   (e.g. a Red output + a Blue output on level 2 → one Purple input on level 3).

**[default]** Matching is strict: a Purple output cannot feed a Red input.

**[default]** Color ↔ element: Red = Fire, Blue = Frost, Green = Nature/Poison,
Yellow = Lightning, Purple = Arcane, Teal = Storm, White = Pure.

### Structure

- The **Source** rune is placed by default at level 0. It has no input. **[default]** The starter
  Source has 2 outputs: Red + Blue.
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

- **Mana (static build budget):** total rune mana cost must fit under the wizard's max mana.
  Not spent in combat. Some rewards raise max mana.
- **Cast time:** spell cast time = base + sum of rune cast times. Bigger spells fire less often.
  Some runes reduce cast time or mana cost as a tradeoff.

## 4. Combat: real-time waves

- Stationary wizard on one side of the arena; enemies come in waves.
- **Melee enemies** walk to the wizard and damage on arrival/contact.
- **Ranged enemies** stop at a distance and fire projectiles.
- **Aimed casting:** the spell charges over its cast time; once charged, the player clicks to
  fire toward the cursor. **[default]** Holding the mouse button auto-fires whenever charged.
- Wizard HP **resets to full at the start of each floor**. Reaching 0 during a floor ends the run.

### Effect categories in scope

| Category | Examples |
|---|---|
| Damage + augments | Fireball (base 40), Amplify (+30% damage), Empower (×1.5 more) |
| Elements & status | Burn (DoT), Slow/Freeze, Poison stacks, Chain lightning; enemy resistances/weaknesses |
| Shape modifiers | Split into N projectiles, Pierce, AoE radius, Homing |
| Cast-time / mana | Quicken (−cast time, −damage), Thrift (−mana cost), Overload (+damage, +cast time) |

## 5. Run structure

- **Linear floors.** **[default]** 10 floors: elite on floor 5, boss on floor 10.
- After each floor: **[default]** pick 1 of 3 runes. Elites/bosses offer rarer runes or a
  +max-mana upgrade.
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
