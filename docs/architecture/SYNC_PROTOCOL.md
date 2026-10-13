# Sync Protocol v0 (outline)

- Status: **Outline v0 (Phase 0). Not implemented. Nothing here is frozen.**
- Date: 2026-10-12
- Decision owner: Charles Toepfer
- Freezes: Phase 13 (app sync client). Acceptance of D-011a needs the
  evidence listed at the end.

This is the public protocol between the application's optional sync client
and **any compatible sync service**, including the hosted AI Bridge
([PUBLIC_PRIVATE_BOUNDARY.md](PUBLIC_PRIVATE_BOUNDARY.md): the contracts
are public so others can build compatible services). It covers how
revisions, proposals, and deletions move between a device and a service.
It does not cover how a service runs, its accounts, or its pricing.

It builds on [RECIPE_SCHEMA.md](RECIPE_SCHEMA.md) (envelope, hashing,
D-022) and [EDITOR_COMMANDS.md](EDITOR_COMMANDS.md) (proposals,
diagnostics). Field names, paths, and codes are drafts.

## Requirements this outline answers

| # | Requirement | From |
|---|---|---|
| S1 | Sync is optional. The app works fully with no service configured or reachable | Invariants 1, 2, 5, 9 |
| S2 | No edit is ever lost or silently overwritten; the service never merges or picks a winner | D-011a |
| S3 | Revisions travel unchanged: the public format, envelope, and hash, with no service members added | RECIPE_SCHEMA §1, R11 |
| S4 | Pushing the same revision twice is harmless; the same ID with different bytes is a conflict | RECIPE_SCHEMA R4 |
| S5 | A device never receives a document newer than it supports | D-022 |
| S6 | AI changes to existing recipes arrive as proposals and need the user's acceptance | Invariant 8, ADR 0007 |
| S7 | "Stop syncing" and "delete everywhere" are different and explicit | D-011a |
| S8 | Export is never blocked by account state | PUBLIC_PRIVATE_BOUNDARY |
| S9 | Each device's access can be revoked on its own | D-011a |
| S10 | The protocol and its paths carry no brand | NAMING rule 3 |

## 1. Concepts

| Term | Meaning |
|---|---|
| **Library** | The set of recipes a user has chosen to sync with one service |
| **Revision** | An immutable `recipe-revision` document (RECIPE_SCHEMA §1) |
| **Head** | A revision of a recipe that no other revision names as a parent. One head is normal; two or more means **diverged** |
| **Tombstone** | A record that a recipe left the library: `unsynced` (stop syncing; devices keep their local copy) or `deleted` (the user confirmed deletion everywhere) |
| **Proposal record** | A `recipe-proposal` (EDITOR_COMMANDS §8) plus its review status, held by the service as a sidecar |
| **Change feed** | An ordered list of what changed in the library since a cursor |
| **Cursor** | An opaque string the service returns. The client stores it and sends it back. Clients never parse it |
| **Device** | One paired installation of the app, with its own credentials |

## 2. Transport and discovery

- HTTPS only. JSON bodies, UTF-8. Request and response bodies that contain
  revisions carry them byte-for-byte as stored; the client verifies each
  `content_hash` on receipt (RECIPE_SCHEMA §3).
- The user enters (or picks) a **service base URL**. The client reads a
  capabilities document at `{base}/sync/v0/capabilities`, which states:
  protocol versions supported, the schema version range the service can
  store and apply, size and batch limits, and the authorization server.
  The version is in the path, and the path is brand-neutral (S10).
- Service-side metadata (devices, review status, cursors) appears only in
  separate response members or headers, never inside a revision (S3).

## 3. Pairing and authorization

- OAuth 2.1 authorization code with PKCE (S256) in the **system browser**
  ([RFC 8252](https://www.rfc-editor.org/rfc/rfc8252)): a loopback
  redirect on desktop, and a claimed HTTPS link or custom scheme on mobile
  (redirect plan per platform: Phase 1 secrets evaluation, Phase 12/13).
- Device authorization grant
  ([RFC 8628](https://www.rfc-editor.org/rfc/rfc8628)) as the fallback where
  browser handoff is impractical. The approval page names the device and
  requires explicit confirmation, because device-code phishing is a known
  attack.
- Access tokens are audience-bound to the sync resource
  ([RFC 8707](https://www.rfc-editor.org/rfc/rfc8707)). Refresh tokens
  rotate. Each device has its own token family, so revoking one device
  leaves the others working (S9). Tokens live in platform secret storage
  and never in exports or logs.
- A sync token grants sync only. Assistant (AI tool) credentials can never
  use the sync endpoints, and sync credentials can never call AI tools.

## 4. Operations

All paths are relative to `{base}/sync/v0`.

| Operation | Request | Response |
|---|---|---|
| `GET /capabilities` | — | As in §2 |
| `POST /device` | Device display name, platform, **highest supported `schema_version`** | Device record. Sent at pairing and whenever the app updates (D-022) |
| `GET /changes?cursor=&limit=` | Opaque cursor (absent on first sync). Like every pull and push, the request carries the device's supported `schema_version` (SQ1) | Ordered change items (§5), `next_cursor`, `has_more`. Or `reset-required` (§7) |
| `POST /revisions` | A batch of `{ revision, sidecar? }` items, parents before children | One result per item (§6). Items are independent; the batch is not all-or-nothing |
| `GET /revisions/{revision_id}` | — | The revision, or `update-required` (§8) |
| `GET /recipes/{recipe_id}/heads` | — | Head revision IDs and the `diverged` flag |
| `PUT /recipes/{recipe_id}/scope` | `synced`, `unsynced`, or `deleted` (with a confirmation token from the app's confirm step) | The resulting tombstone, if any |
| `PUT /library/scope` | `all` or `selected` | — |
| `POST /proposals/{proposal_id}/decision` | `accepted` with the resulting `revision_id` (pushed first), or `rejected` | Updated proposal status |
| `GET /export` | — | Every revision of every library recipe in the native format, plus proposals. **Never refused because of account state** (S8) |

`sidecar` on push holds revision-level service metadata the protocol
needs. In v0 that is only `accepted_proposal_id`. Device identity comes
from the token, not the body.

**Idempotency.** Revisions are idempotent by ID and hash (S4). Every other
`POST` and `PUT` takes an `Idempotency-Key` header; a repeated key with the
same body returns the first result.

## 5. Change feed items

| `kind` | Members | Client action |
|---|---|---|
| `revision` | `recipe_id`, `revision_id`, `schema_version`, `parents` | Fetch it if missing. If the recipe now has several heads, show divergence; never auto-merge (S2) |
| `tombstone` | `recipe_id`, `type` (`unsynced`, `deleted`) | `unsynced`: stop syncing, keep local. `deleted`: ask the user before deleting locally |
| `proposal` | The proposal document plus `status` | Add to the review queue. Status ∈ `pending`, `accepted`, `rejected`, `stale` |
| `scope` | Library scope change | Update the sync settings display |
| `device-revoked` | — (sent once to the revoked device) | Clear credentials. Local recipes are unchanged |
| `account-deleted` | — | Show "the sync account was deleted; your local recipes are unchanged". Clear credentials |

## 6. Push results

| `result` | Meaning |
|---|---|
| `created` | Stored. Its parents were known or earlier in the batch |
| `duplicate` | Same ID and same `content_hash` already stored. No-op |
| `conflict` | Same ID, different hash. Not stored. The client reports it; it never resends under a new ID silently |
| `rejected` | Not stored, with diagnostics. Codes v0: `hash-mismatch`, `parent-missing`, `unsupported-version` (with the supported range; RECIPE_SCHEMA §4), `invalid-document`, `too-large`, `write-not-permitted` |

Diagnostics use the shape in EDITOR_COMMANDS §6 (`code`, `severity`,
`message`, `details`). `write-not-permitted` carries no reason text in
`details`; the app tells the user to check the service. Pull and export
keep working.

A service may validate revisions with Recipe Core before storing them. It
never changes them (S3), and it stores `derived` only as a cache: the app
always recalculates on receipt (invariant 6).

## 7. Retention and full reconciliation

Tombstones are kept for a retention period stated in the capabilities
document. A cursor older than that gets `reset-required`. The client then
lists the library's recipes and heads, compares them with its local
copies, fetches what it lacks, pushes what the service lacks, and treats
local recipes the service no longer lists as **unsynced, not deleted**.
Nothing is deleted locally during reconciliation without the user's
confirmation.

## 8. Schema versions (D-022)

- The service records each device's highest supported `schema_version`
  (§4).
- Revisions the service creates itself (AI-created recipes, accepted
  proposals applied on the service) are written at the **lowest MINOR every
  paired device supports**, when Recipe Core can express the content there.
- A revision above a device's supported version is never sent to that
  device. In its place the device gets `update-required` with the
  `recipe_id`, `revision_id`, and `schema_version`, and the app shows that
  an update is needed to open it.
- The service rejects pushed revisions with a MAJOR (or MINOR) it can't
  store, with `unsupported-version`. A compatible service must support a
  schema version before an app release that writes it is shipped.

## 9. Proposals and acceptance

- Proposals reach the app through the change feed. The app applies them
  with Editor Commands on the device, shows the diff, and the user decides.
- **Accept:** the app creates the revision (envelope
  `origin: "ai_proposal_accepted"`), pushes it with
  `sidecar.accepted_proposal_id`, then posts the decision. A service may also
  offer acceptance in its own interface; the result is the same revision
  shape.
- **Stale:** a proposal whose base is no longer the recipe's only head is
  marked `stale` by the service. Accepting it requires a rebase on a head
  the user picks and a new review (EDITOR_COMMANDS §9). The service never
  rebases and accepts on its own.
- Rejecting or ignoring a proposal never changes the recipe.

## 10. Limits

Batch size, document size, and command counts come from the Phase 0
performance budgets and are published in the capabilities document.
Exceeding them returns `too-large`. Not set yet.

## Not in this protocol

Sign-up, sign-in pages, account management, payment, and plan state; the
AI tool surface ([AI_TOOLS.md](AI_TOOLS.md)); batch sync (after the Phase 7
batch model; RECIPE_SCHEMA §10); shop connections.

## Decisions

Decided 2026-10-12 (owner accepted the recommendations):

| # | Question | Decision |
|---|---|---|
| SQ1 | How does a device report its supported schema version? | Both: registered with `POST /device` and sent with every pull and push, so an app update takes effect immediately |
| SQ2 | May the app push proposals (`author_kind: "user"`)? | No until Phase 13 (EDITOR_COMMANDS E4) |
| SQ3 | Should merge revisions carry a sidecar naming the resolved heads? | No. `parents` already records them |
| SQ4 | Tombstone retention period | A service choice, published in capabilities. The app handles any value through reconciliation (§7) |

## Evidence required to accept D-011a

Contract tests with two simulated clients against a reference service:
concurrent pushes create divergence and lose nothing; duplicate pushes are
no-ops; conflicting bytes return `conflict`; tombstones propagate and
`unsynced` never deletes local data; a cursor past retention triggers
reconciliation with no local deletion; stale proposals are detected and
need re-review; a device that supports an older MINOR never receives a newer
revision.
