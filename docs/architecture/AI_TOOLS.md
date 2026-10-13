# AI Tool Surface v0 (draft)

- Status: **Draft v0 (Phase 0). Not implemented. Nothing here is frozen.**
- Date: 2026-10-12
- Decision owner: Charles Toepfer
- Freezes: Phase 8 (Tier 2 local connector). Tier 3 reuses the same
  definitions ([ADR 0007](adr/0007-ai-integration-tiers.md)).

[ADR 0007](adr/0007-ai-integration-tiers.md) defines one provider-neutral
set of AI operations for all three tiers: the in-app assistant, the local
AI connector (MCP on this machine), and a hosted service. This page lists
those operations: their names, arguments, results, and safety properties.
Every write is a command list in the
[editor command contract](EDITOR_COMMANDS.md). No tool accepts a recipe
document as an edit.

Names are permanent identifiers once released, so they are brand-neutral
([NAMING.md](NAMING.md)). The goal for Phase 8 is a single JSON Schema
source that every tier is generated from.

## Principles

| # | Principle | From |
|---|---|---|
| T1 | Scoped reads, previews, additive creates, and proposals. Nothing else | ADR 0007 |
| T2 | Writes are command lists, validated by Recipe Core and applied all or nothing | EDITOR_COMMANDS C1, C2 |
| T3 | Changes to an existing recipe are always proposals that the user accepts | Invariant 8 |
| T4 | Numbers shown to the user come from Recipe Core results, never from the model | ADR 0007; invariant 6 |
| T5 | Provenance is set by the channel: AI values are always `ai_proposed` | EDITOR_COMMANDS §4 |
| T6 | User-written text (names, notes, rationale) appears only in labeled result members, never in tool descriptions, instructions, or `message` text | EDITOR_COMMANDS §6 |
| T7 | No tool fetches URLs, touches hardware, or changes storage, sync, sharing, or account settings | ADR 0007; invariant 8 |
| T8 | Disabling AI leaves the application complete | Invariant 3 |

## Tools

Annotations use MCP's tool hints (`readOnlyHint`, `destructiveHint`,
`openWorldHint`). Every tool declares `openWorldHint: false`, an input
schema with no extra members allowed, and a structured output schema. The
in-app assistant (Tier 1) uses the same definitions without MCP.

| Tool | Arguments | Result | Read-only | Destructive |
|---|---|---|---|---|
| `search_recipes` | *`text`*, *`beverage_type`*, *`style`*, *`statistic_range`* (stated statistic, min, max), *`updated_after`*, *`updated_before`*, *`review_state`* (`reviewed`, `unreviewed`), *`limit`*, *`cursor`* | Summaries: `recipe_id`, head `revision_id`, labeled `name`, beverage, style, displayed OG/FG/ABV/IBU/color with their layer, `diverged` | yes | no |
| `get_recipe` | `recipe_id`, *`revision_id`* (default: newest head) | The revision `content`, `derived` statistics with formula IDs, `diverged` and other head IDs | yes | no |
| `list_recipe_revisions` | `recipe_id`, *`limit`*, *`cursor`* | `revision_id`, `parents`, `origin`, `created_at` | yes | no |
| `explain_calculation` | `recipe_id`, *`revision_id`*, `statistic` (e.g. `ibu`) | Formula ID and version, inputs with provenance, assumptions applied, missing inputs | yes | no |
| `preview_changes` | `base` (revision reference or empty template), `commands` | The application result: `status`, `diff`, `derived`, `diagnostics` (EDITOR_COMMANDS §3, §6, §7). **Stores nothing** | yes | no |
| `create_recipe` | `beverage_type`, `name`, `commands`, `rationale`, *`client_request_id`* | New `recipe_id` and `revision_id`, `assigned_ids` (TQ1), `derived`, `diagnostics`, review location | no | no |
| `propose_changes` | `recipe_id`, `base` (`revision_id` + `content_hash`), `commands`, `rationale`, *`client_request_id`* | `proposal_id`, `assigned_ids` (TQ1), the diff, `derived`, `diagnostics`, review location | no | no |
| `import_recipe` | `format` (`beerxml`, `native`), `content` (text the assistant supplies), *`client_request_id`* | New `recipe_id`, the import report (losses and resolutions), `derived` | no | no |
| `list_proposals` | *`status`*, *`recipe_id`* | The caller's proposals with status (`pending`, `accepted`, `rejected`, `stale`) | yes | no |
| `search_batches`, `get_batch` | Date range, outcome; `batch_id` | Measured vs. predicted values. **Waits for the Phase 7 batch model** | yes | no |

**Write semantics**

- `create_recipe` applies `commands` to the empty template
  (EDITOR_COMMANDS §8) and stores a root revision with
  `origin: "ai_created"`, marked unreviewed. It overwrites nothing. Whether
  it goes straight into the library or waits in an inbox is D-014.
- `propose_changes` stores a proposal only. The recipe is unchanged until
  the user accepts. A base that is no longer the only head returns the
  proposal as `stale` immediately, with the current heads.
- `import_recipe` is the only document-in path. The document is parsed by
  Recipe Format and labeled `imported`, not `ai_proposed`, because the
  assistant passes the user's file through and doesn't author it. Pasted
  prose is not an import: the assistant turns it into commands for
  `create_recipe`, so the result is honestly `ai_proposed`.
- Rejected command lists store nothing and return diagnostics, so the
  assistant can correct and retry, usually through `preview_changes`.
- `client_request_id` makes a retried write return the first result
  instead of creating a second recipe or proposal.

**Not offered to any AI:** deleting recipes, accepting or rejecting
proposals, export, sync or sharing settings, account or payment changes,
URL fetching, presentation commands (EDITOR_COMMANDS §5.9), and anything
involving devices.

## Result hygiene

- User-written text is returned in members named for what they hold
  (`name`, `note`, `rationale`, `label`). Long text is capped and marked
  `truncated: true`.
- `message` strings are fixed, reviewed text. They never interpolate user
  content (EDITOR_COMMANDS §6).
- Statistics always carry their layer and, when calculated, formula ID and
  version. "Cannot compute" is reported as such, never as zero.
- Links point only to the host's own review location. Results contain no
  advertising or sales language.

**Tool errors** (beyond command diagnostics): `not-found`, `stale-base`,
`write-not-permitted`, `rate-limited`, `unavailable`. When Recipe Core
can't run, write tools fail closed ("nothing was saved") and never store an
unvalidated document.

## Tier differences

| | Tier 1 in-app | Tier 2 local connector | Tier 3 hosted service |
|---|---|---|---|
| Transport | Function calls inside the app | MCP on this machine | MCP over HTTPS |
| Authorization | The user is present | Local pairing with the app (Phase 8) | OAuth 2.1 with per-assistant grants; scopes `recipes:read`, `batches:read`, `proposals:write` |
| Library | The local library | The local library | Recipes the user synced ([SYNC_PROTOCOL.md](SYNC_PROTOCOL.md)) |
| Review | In the app | In the app | In the app after sync, or in the service's own review page |

## Decisions

Decided 2026-10-12 (owner accepted the recommendations):

| # | Question | Decision |
|---|---|---|
| TQ1 | New entity IDs from language models | **Placeholder references.** Tool arguments may use `"new:<label>"` (label: 1–64 characters of `a-z`, `0-9`, `_`, `-`) wherever a command needs a new entity ID, and wherever a later command in the same list refers to that entity. The tool host replaces each distinct placeholder with a fresh UUIDv7 before application and returns the mapping in `assigned_ids`. Reusing a label for two new entities is rejected (`duplicate-id`); a placeholder that no command creates is rejected (`unknown-reference`). The command contract is unchanged: Recipe Core sees only UUIDs. `preview_changes` assigns IDs too, but they are not reserved; a later write gets new ones |
| TQ2 | `create_recipe`: library or inbox? | Left to D-014. The current proposal (straight into the library, marked unreviewed) stands until then |
| TQ3 | `search_recipes` filters | Only what the schema indexes stably: beverage, style, and stated statistics |
| TQ4 | One schema source for all tiers | JSON Schema in this repository, with per-tier definitions generated from it (Phase 8) |
| TQ5 | `get_recipe` default view | Full content, capped. A compact view only if measured token cost needs it |

## Evidence required to accept

Phase 8 tests: malformed and invalid command lists never change state;
adversarial recipe notes come back as inert, labeled data; a retried write
with the same `client_request_id` creates one object; disabling AI leaves
the app complete.
