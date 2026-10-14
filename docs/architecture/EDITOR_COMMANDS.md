# Editor Command Contract v0

- Status: **Draft v0 (Phase 0). Not implemented. Nothing here is frozen.**
- Date: 2026-10-11
- Decision owner: Charles Toepfer
- Freezes: Phase 2 (core commands), Phase 4 (editing and import)

Every change to a recipe is a list of typed **commands** that Recipe Core
validates and applies to a revision's `content`
([RECIPE_SCHEMA.md](RECIPE_SCHEMA.md)). The same contract serves the
editor UI, undo/redo, the review diff, and AI proposals
([ADR 0007](adr/0007-ai-integration-tiers.md)): an AI proposal is a
command list with a base revision and a rationale, nothing more.

This is a design draft. It has no JSON Schema and no code. Command names and
shapes become permanent data identifiers once released
([NAMING.md](NAMING.md)), so they are brand-neutral and chosen carefully.

## Requirements this draft answers

| # | Requirement | From |
|---|---|---|
| C1 | Commands are typed; raw recipe JSON is never accepted as an edit | ADR 0007; invariant 8 |
| C2 | Invalid commands never partially apply | ADR 0007 |
| C3 | Applying the same commands to the same base gives the same result on every platform and in the Bridge | Invariant 6 |
| C4 | The user reviews a diff of ingredients, process, and recalculated results before accepting | ADR 0007 |
| C5 | A proposal whose base revision is no longer current can be re-applied and reviewed again | Sync model (D-011a) |
| C6 | A new recipe can be built from commands applied to an empty template | ADR 0007; Bridge tool surface |
| C7 | Provenance is assigned by the channel, so an AI can't label its numbers "measured" | Invariant 7 |
| C8 | Every drag interaction has a command equivalent | AGENTS.md; WCAG 2.2 SC 2.5.7 |
| C9 | No invented values: a command leaves unknown properties unknown | Invariant 7; AGENTS.md |

## 1. Concepts

| Term | Meaning |
|---|---|
| **Command** | One typed operation, such as `add_ingredient` or `set_addition_amount` |
| **Command list** | Ordered commands applied as one all-or-nothing unit. One user action, one undo step, or one AI proposal |
| **Base** | The revision (or empty template) a command list applies to |
| **Application** | Recipe Core applying a command list to a base: the result is either a new `content` or a rejection with diagnostics |
| **Proposal** | A command list with a base, a rationale, and an author kind, waiting for the user's review (§8) |
| **Diff** | The semantic difference between base and result, including recalculated statistics (§7) |

Recipe Core does no natural-language parsing. Turning "add 1 lb Munich"
into commands is the job of the UI or the AI, outside Recipe Core. (Lumina's
`commands.py` text parsing and `state.py` ingredient classification by
keyword have no counterpart here.)

## 2. Encoding

A command is a JSON object with an `op` member and op-specific arguments:

```json
{ "op": "set_addition_amount", "addition": "8a2e0c5e-...", "amount": { "value": "28", "unit": "g" } }
```

Rules:

1. **Targets are entity IDs, never names or positions.** Lumina finds
   ingredients by case-insensitive substring and steps by 1-based index
   (`state.py` `_find_ingredient`, `_find_step_index`), so "remove malt"
   removes whichever malt comes first. Carboy commands name the exact
   entity.
2. **New entities get their ID from the command.** The author generates a
   UUID (RFC 9562) for each entity it creates, so later commands in the same
   list can refer to it, and every implementation produces byte-identical
   content (C3). A duplicate ID is rejected. AI tool hosts may let a model write
   placeholder references that the host turns into UUIDs before
   application ([AI_TOOLS.md](AI_TOOLS.md) TQ1); Recipe Core never sees
   placeholders.
3. **Values use the schema's representations**: quantities as
   `{ "value": "<decimal string>", "unit": "<token>" }`, decimal strings
   normalized per RECIPE_SCHEMA §3. A command that carries a JSON number
   where a quantity is required is rejected; nothing is coerced.
4. **Commands set absolute values.** `set_addition_amount` to 28 g, not
   "increase by 10 %". Absolute commands re-apply predictably to a newer
   base (§9). The only relative operation, scaling, is a macro (§5.8).
5. **Unknown members are rejected** (the equivalent of
   `additionalProperties: false`), so a typo never silently does nothing.
6. **Clearing is explicit.** `clear_*` commands remove a value. `null` is
   never used to mean "clear" (RECIPE_SCHEMA §3 rule 2).

## 3. Application semantics

1. Check the command list against the contract version and schema version
   of the base (§10). On mismatch: reject.
2. Apply the commands **in order** to a working copy of the base content.
   Each command checks its own preconditions: argument types, that referenced
   IDs exist, that new IDs are unused, that the unit's dimension fits.
   The first failure rejects the whole list (C2), and the diagnostic names
   the failing command by index.
3. Validate the complete result (references, topology, stage semantics,
   beverage rules). Intermediate states inside one list may be invalid; only
   the result counts. So "replace the only yeast" is `add_ingredient`,
   `add_addition`, `remove_addition`, `remove_ingredient` in one list,
   where Lumina refuses the removal step on its own.
4. Recalculate statistics into `derived` (RECIPE_SCHEMA §9).
5. Return the result (§6) and the diff (§7). Nothing is stored at this step.
   Storing a revision is the library's job, after the user (or, for the
   user's own edits, the editor) commits.

**Invalid versus incomplete.** A recipe under construction is often
incomplete: no fermentables yet, a hop with no alpha acid. That is not
invalid. Incomplete inputs produce **warnings** and "cannot compute"
diagnostics for the affected statistics, and the list still applies.
Errors are reserved for contradictions and broken structure. This is what
lets an AI build a recipe step by step with preview (Bridge
`preview_changes`).

## 4. Provenance assignment (C7)

The **applier** sets value-level `provenance.origin` from the channel the
command list arrived through. The command author can't choose it:

| Channel | `origin` written on new or changed values | Revision `origin` (envelope) |
|---|---|---|
| Editor UI | `manually_entered` | `user_edit` |
| Accepted AI proposal | `ai_proposed` | `ai_proposal_accepted` |
| AI-created recipe (template base) | `ai_proposed` | `ai_created` |
| Import (Recipe Format) | Not a command channel: the importer writes `imported`/`declared`/`inferred` directly and its report is reviewed before commit | `import` |
| Batch → recipe ("apply learnings") | `measured` for values copied from batch readings; else `manually_entered` | `user_edit` |

A command may carry an optional `provenance` object with `confidence` and
`note` only. Any `origin`, `formula`, or `source` member in it is rejected.
A command may never set the `calculated` layer or `derived`.

## 5. Command catalogue v0

Arguments in *italics* are optional. Every `id` argument is a new UUID
supplied by the author. Every entity argument (`ingredient`, `stage`,
`addition`, `flow`, `step`) is an existing ID.

### 5.1 Recipe

| `op` | Arguments | Notes |
|---|---|---|
| `set_name` | `name` | Non-empty after trimming |
| `set_beverage_type` | `type` | `beer`, `wine`, `mead`, `cider`, `sake` (D-019 open). Changing the type keeps every entity; statistics that no longer apply report "unsupported" |
| `set_style` | `system`, `code`, *`name`* | Code must exist in the named style system's data. Lumina accepts unrecognized text as a "custom style"; here that is `set_style_text` |
| `set_style_text` | `text` | A free-text style label, never interpreted |
| `clear_style` | — | |
| `add_note` | `id`, `text`, *`position`* | Notes are never read by calculations |
| `set_note` / `remove_note` | `note`, `text` / `note` | Notes have IDs like every other target (E5 decided) |

### 5.2 Targets and stated statistics

| `op` | Arguments | Notes |
|---|---|---|
| `set_target` | `name`, `quantity` | `name` from the schema's target list (batch volume, boil volume, efficiency, ...). The list is fixed with the formula coverage table (D-006). Needs confirmation |
| `clear_target` | `name` | |
| `set_stated_statistic` | `statistic`, `layer`, `quantity` | `layer` ∈ `declared`, `measured`. Lumina's `set_target_abv`/`set_target_ibu` become `layer: "declared"` |
| `clear_stated_statistic` | `statistic`, `layer` | |
| `set_statistic_display` | `statistic`, `layer` | `declared`, `imported_estimate`, `measured`, `calculated` |
| `clear_statistic_display` | `statistic` | Returns to the default rule (RECIPE_SCHEMA §8) |

### 5.3 Ingredients

| `op` | Arguments | Notes |
|---|---|---|
| `add_ingredient` | `id`, `kind`, `name`, *`properties`*, *`catalog_ref`* | **No defaults are filled in.** Lumina inserts ppg 36, color 2 °L, efficiency 0.75, and alpha acid 10 % with a warning; Carboy leaves the property absent and the affected statistic reports "cannot compute" (C9). Properties the author supplies are recorded with the channel's origin |
| `set_ingredient_name` | `ingredient`, `name` | |
| `set_ingredient_property` | `ingredient`, `property`, `value` | `property` and its value type come from the ingredient property table (RECIPE_SCHEMA §7.2). A name not in the table for this `kind` is rejected (`unknown-property`; Q9 decided). Fields in `unmapped` can't be written by any command |
| `clear_ingredient_property` | `ingredient`, `property` | |
| `set_ingredient_catalog_ref` / `clear_ingredient_catalog_ref` | `ingredient`, `catalog_ref` / `ingredient` | Changing the reference never changes properties. Refreshing properties from the catalog is a set of `set_ingredient_property` commands the user reviews |
| `remove_ingredient` | `ingredient` | **Rejected** (`entity-referenced`) while any addition uses it. Remove the additions in the same list. Nothing cascades silently |

An ingredient's `kind` is fixed. Changing kind is remove + add, because the
valid properties differ.

### 5.4 Additions

| `op` | Arguments | Notes |
|---|---|---|
| `add_addition` | `id`, `ingredient`, `stage`, `amount`, `timing`, *`position`* | `amount` dimension must suit the ingredient (count needs a count unit, unless the ingredient states a unit mass). `timing.point`, if given, must be allowed for the stage's kind by the stage-kind table (`invalid-timing-point`). A first-wort hop is `stage: <boil>, timing: { basis: "at_start", point: "first_wort" }`; a dry hop is an addition to a fermentation stage with `point: "dry_hop"` (Q5 decided) |
| `set_addition_amount` | `addition`, `amount` | |
| `set_addition_timing` | `addition`, `timing` | `timing` per RECIPE_SCHEMA §7.2 |
| `move_addition` | `addition`, `stage`, *`timing`*, *`position`* | Non-drag equivalent of dragging an addition to another stage (C8). If `timing` is omitted and the current timing doesn't fit the target stage, rejected |
| `reorder_addition` | `addition`, `position` | Display order within a stage |
| `remove_addition` | `addition` | |

`position` is `{ "before": <id> }`, `{ "after": <id> }`, `"first"`, or
`"last"` (default `"last"`). Positions never use numeric indexes.

### 5.5 Process stages and steps

| `op` | Arguments | Notes |
|---|---|---|
| `add_stage` | `id`, `kind`, *`name`*, *`parameters`*, *`position`* | `kind` must be a row of the stage-kind table (RECIPE_SCHEMA §7.3). This contract names no stage kinds, so Q5 doesn't change it |
| `set_stage_name` | `stage`, `name` | |
| `set_stage_parameter` / `clear_stage_parameter` | `stage`, `parameter`, `value` / `stage`, `parameter` | Parameter names and types come from the stage's row in the stage-kind table |
| `move_stage` | `stage`, `position` | Non-drag equivalent of reordering stages in the graph or list (C8). Rejected if it breaks flow topology |
| `remove_stage` | `stage` | Rejected while additions, steps, or flows reference it |
| `add_step` | `id`, `stage`, `parameters`, *`name`*, *`position`* | Ordered steps inside a stage: mash rests, fermentation phases. Step parameters come from the stage-kind table. Replaces Lumina's `add_mash_step` and `add_fermentation_step` |
| `set_step_parameter` / `clear_step_parameter` | `step`, `parameter`, `value` / `step`, `parameter` | Replaces `set_mash_step`/`set_fermentation_step` |
| `move_step` | `step`, `position` | |
| `remove_step` | `step` | Lumina refuses to remove the only mash step; whether a stage needs at least one step is a validation rule per stage kind, applied to the result, not to the command |

**Where the choices sit.** Q5 (decided: first wort, flameout, and dry hop
are timing points) and Q5b (decided: a stage per vessel, a step per temperature change)
live in the stage-kind table and the Lumina and BeerXML mapping. Q9
(decided: closed ingredient property table plus `unmapped`) lives in the
ingredient property table. No command, argument, or diagnostic shape in
this contract depends on them (RECIPE_SCHEMA §7.2, §7.3).

### 5.6 Flows

| `op` | Arguments | Notes |
|---|---|---|
| `add_flow` | `id`, `kind`, `from`, `to`, *`amount`* | `kind` ∈ `transfer`, `addition`, `loss`, `dilution`, `blend` |
| `set_flow_amount` / `clear_flow_amount` | `flow`, `amount` / `flow` | |
| `remove_flow` | `flow` | |

v0 calculations support a linear chain of stages only. Branches and merges
apply and validate structurally; their statistics report "unsupported".

### 5.7 Equipment and water

| `op` | Arguments | Notes |
|---|---|---|
| `apply_equipment_snapshot` | `snapshot` | Copies a profile's values into `content.equipment`. The snapshot is data, not a reference (OVERVIEW §5) |
| `set_equipment_field` / `clear_equipment_field` | `field`, `value` / `field` | Field list: Needs confirmation. Lumina's `EQUIPMENT_PROFILE_FIELDS` is the reference (Phase 3 equipment work) |
| `clear_equipment` | — | |
| `set_water_profile` / `clear_water_profile` | `role` (`source`, `target`), `ions` / `role` | Ion names and units follow Lumina `water_chemistry.py`. Salt treatments are ordinary `water_agent` ingredients with additions in mash or sparge stages, so same-named mash and sparge salts can't merge |

### 5.8 Macros

A **macro** is a command that Recipe Core expands into primitive commands
against the base before applying. The diff shows the expansion, so the user
sees every changed value.

| `op` | Arguments | Expands to |
|---|---|---|
| `scale_recipe` | `batch_volume` (quantity), *`scope`* | `set_target` for the batch volume and `set_addition_amount` for each scaled addition. Which additions scale, and how (linear for grain; not for cultures, which Lumina also skips with a warning; hop utilization and boil-off are not linear), is the Phase 2 scaling policy: v1 in [RECIPE_CORE §7a](RECIPE_CORE.md#7a-scaling-policy-v1-2026-10-14) (`scaleRecipe`). The command applier arrives in Phase 4 |
| `replace_ingredient` | `ingredient`, `with` (an `add_ingredient` body) | `add_ingredient`, one `move`-equivalent per addition re-pointed to the new ingredient, `remove_ingredient`. Amounts are kept; properties are not copied (the new ingredient has its own) |

A stored proposal keeps the commands as submitted. The expansion is
recomputed on every application, so a rebase (§9) scales from the new
base's volume, not the old one.

### 5.9 Presentation

`set_node_layout` (`stage`, `x`, `y`), `set_node_collapsed` (`stage`,
`collapsed`), `set_viewport` (`x`, `y`, `zoom`). Coordinates are decimal
strings. They never affect validation or calculation (RECIPE_SCHEMA R9). AI
channels may not submit them: they are rejected there with
`op-not-permitted`. Whether layout changes create revisions is RECIPE_SCHEMA Q4.

## 6. Result and diagnostic shape

```json
{
  "status": "rejected",
  "diagnostics": [
    {
      "code": "unknown-reference",
      "severity": "error",
      "command_index": 2,
      "path": "/additions/3/ingredient",
      "message": "Addition refers to an ingredient that doesn't exist.",
      "details": { "id": "1f0c..." }
    }
  ]
}
```

| Member | Rule |
|---|---|
| `status` | `applied` or `rejected` |
| `content` | On `applied`: the resulting content |
| `derived` | On `applied`: recalculated statistics with formula ID and version |
| `diff` | On `applied`: §7 |
| `expanded_commands` | Present when macros were expanded |
| `diagnostics[]` | Always present, possibly empty |
| `diagnostics[].code` | Stable kebab-case identifier; **the contract**. Messages are for people and may change |
| `diagnostics[].severity` | `error` (only in rejected results), `warning`, `info` |
| `diagnostics[].command_index` | Zero-based index of the command that caused it, when there is one |
| `diagnostics[].path` | JSON Pointer ([RFC 6901](https://www.rfc-editor.org/rfc/rfc6901)) into the base content (for command errors) or the result content (for validation) |
| `diagnostics[].details` | Code-specific structured data. User-supplied text appears only here, in labeled members, never interpolated into `message`, so a recipe name can't pose as instructions to an AI reading the result |

**Error codes v0:** `unsupported-version`, `unknown-op`, `op-not-permitted`,
`unsupported-op`, `invalid-argument`, `unknown-member`, `invalid-quantity`,
`unit-dimension-mismatch`, `unknown-reference`, `duplicate-id`,
`unknown-property`, `unknown-stage-kind`, `invalid-timing-point`,
`entity-referenced`, `invalid-position`, `topology-invalid`,
`validation-failed`, `stale-base` (§9), `too-large` (§11).

**Warning and info codes v0:** `missing-input` (a statistic can't be
computed; `details` names the input), `unsupported-calculation`,
`rebased`, `concurrent-change` (§9), `assumption-applied`.

This deliberately parallels Lumina's `ImportWarning` (`code`, `severity`,
`affected_field`, `evidence`, `message`), with `path` for `affected_field`
and `details` for `evidence`. Import reports keep their own resolution
workflow; they are not command diagnostics.

## 7. Diff

The diff is **semantic and keyed by entity ID**, not a JSON Patch: array
indexes shift, and a reviewer needs "Cascade: 28 g → 21 g", not
`/additions/3/amount/value`.

```json
{
  "base": { "revision_id": "...", "content_hash": "sha256:..." },
  "entities": [
    { "type": "addition", "id": "8a2e...", "change": "changed", "label": { "ingredient": "Cascade", "stage": "Boil" },
      "fields": [ { "path": "amount", "before": { "value": "28", "unit": "g" }, "after": { "value": "21", "unit": "g" } } ] },
    { "type": "ingredient", "id": "77b1...", "change": "added", "label": { "name": "Munich malt" } }
  ],
  "statistics": [
    { "statistic": "ibu", "before": { "value": "41.2", "unit": "IBU" }, "after": { "value": "33.5", "unit": "IBU" },
      "formula": { "id": "...", "version": "..." } }
  ]
}
```

- `type` ∈ `recipe`, `target`, `statistic_stated`, `ingredient`, `addition`,
  `stage`, `step`, `flow`, `equipment`, `water`, `note`, `presentation`.
- `change` ∈ `added`, `removed`, `changed`, `moved`.
- `label` carries display names so a review screen can render without
  re-reading the document; it holds user text and is display-only.
- `statistics` compares recalculated values. "Cannot compute" on either
  side is shown as such, never as zero.
- Presentation changes are listed separately so a reviewer can tell layout
  from substance.
- Undo/redo inside the editor may use an internal patch format (for example
  Immer patches, OVERVIEW §7); that is an implementation detail, not this
  contract.

## 8. Proposals

```json
{
  "format": "recipe-proposal",
  "schema_version": "0.1",
  "proposal_id": "0192f1c4-...",
  "recipe_id": "...",
  "base": { "revision_id": "...", "content_hash": "sha256:..." },
  "author_kind": "ai",
  "rationale": "Lower bitterness toward 35 IBU by reducing the 60-minute addition.",
  "commands": [ { "op": "set_addition_amount", "addition": "8a2e...", "amount": { "value": "21", "unit": "g" } } ],
  "created_at": "2026-10-11T20:00:00.000Z"
}
```

| Member | Rule |
|---|---|
| `format` | `"recipe-proposal"` |
| `schema_version` | The content schema version the commands target (§10) |
| `proposal_id` | UUID from the author. Same ID with identical canonical bytes = no-op; same ID, different bytes = conflict (same rule as revisions) |
| `recipe_id`, `base` | The revision the commands were written against. For a new recipe: `recipe_id` is new and `base` is a template (below) |
| `author_kind` | `ai` in v0. `user` is reserved for one device's edit awaiting review on another, deferred to Phase 13 (E4 decided) |
| `rationale` | Free text shown to the reviewer; never interpreted |
| `commands` | The command list as submitted (macros unexpanded) |
| `created_at` | Informational |

Status (pending, accepted, rejected, stale) is **not** in the proposal. It
is review-queue state, a sidecar, like any service metadata. Accepting a
proposal creates a normal revision whose envelope `origin` is
`ai_proposal_accepted`, with the proposal ID recorded in that revision's
sidecar. Acceptance is all or nothing: partial acceptance is a new
user-edited command list, not a modified proposal (E3 decided). To keep only
part of a proposal, the user accepts it and then edits or undoes, or rejects
it and edits directly.

### Empty template (new recipes, C6)

```json
"base": { "template": "empty", "beverage_type": "beer", "name": "Oatmeal stout" }
```

The empty template's content is: the given `name` and `beverage.type`;
empty `ingredients`, `additions`, `process.stages`, `process.flows`;
empty `targets` and `statistics`; and `calculation_settings` set
**explicitly** to the formula registry's defaults for that beverage,
written into content so the recipe doesn't change meaning when defaults
change later. Because those defaults are versioned, the template records
the registry version used. The Phase 2 formula registry defines them;
until then the defaults are Needs confirmation.

A new AI-created recipe (Bridge `create_recipe`) is this template plus
commands, stored as a root revision with envelope `origin: "ai_created"`.
Whether it goes straight into the library marked unreviewed, or waits in
an inbox, is D-014.

## 9. Stale proposals and rebasing (C5)

A proposal is **current** when its base revision is the recipe's only head.
Otherwise it is **stale** (the recipe moved on, or diverged).

Applying a stale proposal against its own base is still allowed for
preview, but accepting requires a **rebase**: apply the same submitted
commands to the chosen current head and validate again.

- Because commands are absolute and target IDs (§2), the rebase is
  well-defined: it succeeds when every referenced entity still exists and
  the result validates, and fails with the normal diagnostics otherwise.
- For every field a command writes, the applier compares base and head. If
  the head's value differs from the base's, the rebased result carries a
  `concurrent-change` warning naming the field and all three values (base,
  head, proposed). The proposal still applies; the reviewer decides.
- The result carries a `rebased` info diagnostic and a fresh diff against
  the head. A rebased proposal **always** needs a new review, even if it
  was reviewed before.
- Rebasing never merges content and never chooses between heads. With
  several heads, the user picks the head (D-011a).

## 10. Versioning

Commands target a content schema, so the command contract shares the
content `schema_version` (RECIPE_SCHEMA §4) rather than having its own:

- A MINOR schema bump may add ops, optional arguments, and enum values.
- A MAJOR bump may rename or remove ops.
- An applier rejects a proposal whose `schema_version` it doesn't support
  (`unsupported-version`). A proposal written for 1.2 is applied by a 1.3
  applier unchanged; by a 1.1 applier, never.
- Stored proposals are migrated along with revisions on a MAJOR change, or
  marked stale-unmigratable and shown to the user as such.

## 11. Limits

Maximum commands per list and maximum list size come from the Phase 0
performance budgets (measured workloads) and are reported with
`too-large`. Not set yet.

## 12. Lumina mapping

Lumina's `state.py` `apply_recipe_action` already applies to a working copy,
validates, and only then commits, which matches §3. What changes:

| Lumina action | Carboy commands | Difference |
|---|---|---|
| `scale_batch`, `set_batch_size` | `scale_recipe` (macro) | Policy from Phase 2, not "multiply weights; skip yeast" |
| `set_target_abv`, `set_target_ibu` | `set_stated_statistic` with `layer: "declared"` | Typed quantity; IBU no longer rounded to an integer |
| `add_ingredient` (free text) | `add_ingredient` + `add_addition` | Text parsing and keyword classification move to UI/AI; no default ppg, color, efficiency, or alpha acid |
| `remove_ingredient` (substring) | `remove_addition`… + `remove_ingredient` by ID | Exact target; no silent cascade |
| `replace_ingredient` | `replace_ingredient` (macro) | Properties aren't carried over |
| `set_style` | `set_style` / `set_style_text` | Lumina's broad-category clarification question is UI/AI behavior |
| `freeform_note` | `add_note` | |
| `add_/set_/remove_mash_step` | `add_step` / `set_step_parameter` / `remove_step` in a `mash` stage | ID, not name or index; temperatures and times are typed quantities |
| `add_/set_/remove_fermentation_step` | Steps in one `fermentation` stage; a separate stage only for a separate vessel (RECIPE_SCHEMA Q5b decided) | `set_fermentation_step` silently adding a missing stage has no equivalent |
| `apply_equipment_profile`, `set_equipment_field`, `clear_equipment` | Same names (§5.7) | Typed quantities |
| `create_/list_/delete_equipment_profile` | None | Library operations, not recipe edits |

Lumina side effects with no counterpart: `recipe["status"] = "In
Conversation"` (workflow state, not recipe content) and
`meta["revision"] += 1` (replaced by the revision envelope).

## Decisions

Decided 2026-10-11 (owner accepted the recommendations):

| # | Question | Decision |
|---|---|---|
| E1 | Can a user override a calculated value? | No. Nobody writes the `calculated` layer or `derived`. A user who disagrees states a `declared` value and can make it the displayed layer (`set_statistic_display`) |
| E2 | `scale_recipe` before the Phase 2 scaling policy? | Rejected (`unsupported-op`) until the policy exists, with cited sources for anything non-linear |
| E3 | Partial acceptance of a proposal? | No. All or nothing in v1 (§8) |
| E4 | `author_kind: "user"` proposals for 1.0? | No. Reserved; revisit in Phase 13 |
| E5 | Give notes IDs? | Yes. `notes[]` is `{ id, text }` (RECIPE_SCHEMA §7) |
| E6 | A dry-run mode for AI beyond preview? | No. Application without storage (§3) is the preview |

## Open questions

Dependencies on RECIPE_SCHEMA open questions: Q4 (presentation commands
only). Nothing else in this contract is open.
