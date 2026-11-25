# Recipe Library v0

- Status: **Repository contract, in-memory store, and SQLite store implemented
  in Phase 3** in [`packages/recipe-library/`](../../packages/recipe-library/)
  (`@carboy/recipe-library`). Nothing here is frozen. ADR 0006 stays Proposed:
  this is evidence for it, not an acceptance.
- Date: 2026-11-06; drafts added 2026-11-24
- Decision owner: Charles Toepfer

Saved recipes are reached only through this module (OVERVIEW §2). It keeps
revisions; it doesn't calculate, edit, or interpret them.

## Contract

`createLibrary(store)` gives a `RecipeRepository`:

| Call | Does | Fails with |
|---|---|---|
| `save(revision)` | Stores an immutable revision and moves the head. Saving the same revision again is harmless | `invalid-revision`, `revision-conflict`, `recipe-exists`, `parent-not-found`, `stale-head`, `recipe-deleted` |
| `open(recipe, revision?)` | The head, or a named revision, through `readNative` | `not-found`, `recipe-deleted`, `unreadable-revision` |
| `list({ deleted })` | One summary per recipe, without loading history | |
| `revisions(recipe)` | History, oldest saved first | `not-found` |
| `remove(recipe, at)` | Recoverable delete: hidden, and refused for open and save | `not-found`, `recipe-deleted` |
| `restore(recipe)` | Brings it back whole | `not-found`, `not-deleted` |
| `purge(recipe)` | Permanent, and only after `remove` | `not-found`, `not-deleted` |
| `saveDraft(draft, replaces)` | Writes the recipe's draft whole; `replaces` is the sequence it replaces, or null | `invalid-draft`, `stale-draft`, `recipe-exists`, `not-found`, `recipe-deleted` |
| `openDraft(recipe)` | The draft with its sequence and the recipe's current head, or nothing | `recipe-deleted`, `unreadable-draft` |
| `drafts()` | Every draft, without content or history, for recovery | |
| `discardDraft(recipe, sequence)` | Removes the draft | `not-found`, `stale-draft` |
| `save(revision, { draft })` | Also removes the draft at that sequence, in the same transaction | as `save`, plus `stale-draft` |

- **Identity:** `recipe_id` is stable across revisions. A revision id always
  means the same bytes: other content under that id is `revision-conflict`.
- **Nothing is overwritten.** A revision that doesn't descend from the current
  head is `stale-head`, so two edits can't silently fork or replace each other.
  History is linear for now; merging belongs to the sync model (D-011a).
- **Validity:** only a revision that opens `editable` is saved. Incomplete isn't
  invalid: a recipe with just a name saves.
- **Damage:** reads never repair. A hash mismatch opens read-only, and an
  unreadable document is `unreadable-revision`.
- **Order:** `list` sorts by code units, for one answer everywhere. Display
  sorting is the UI's job (U12).

## Drafts

A draft is a recipe's unsaved work (UD3, accepted by the owner 2026-11-24): kept
apart from its revisions, and never a revision by itself. Only a save makes one.

- **One per recipe**, written whole on each autosave: the working content, the
  revision it started from (`base_revision`, null for a recipe never saved), the
  content schema version, and the undo history (owner, 2026-11-24): one command
  list per user action, oldest first, with `applied` counting the entries in
  effect; the rest are redo.
- **Checked, not interpreted.** Content is validated like a revision's, against
  its schema version; history must be a list of command lists. Replaying or
  undoing the commands is the editor's job, not the library's.
- **Nothing is overwritten.** Every write names the sequence it replaces, and
  `sequence` changes on each write and is never reused, even after a discard. A
  writer holding an older sequence gets `stale-draft`.
- **Stale drafts are visible.** `openDraft` returns the recipe's current head
  beside `base_revision`; when they differ, the draft started from an older
  revision, and the person decides what to do with it.
- **Saving clears it atomically.** `save(revision, { draft: sequence })` stores
  the revision and removes the draft in one transaction. A failed save keeps
  it; a retried save that already committed is still harmless.
- **Deletion:** a deleted recipe's draft is hidden and refused until restore;
  purge removes it.
- **Damage:** a draft that can't be parsed or no longer validates is
  `unreadable-draft`. It is never repaired or dropped, and `drafts()` still
  lists it.

Not decided yet: how often the editor autosaves, any limit on history length,
and the recovery dialog (USABILITY §3). Each write stores the whole history, so
its cost grows with the history.

## Stores

Every rule lives above the store, in `library.ts`. A store only keeps rows and
runs a transaction: everything in it commits or none of it does, and
transactions don't overlap. One conformance suite
(`test/conformance.mjs`) runs unchanged against every store.

| Store | Use |
|---|---|
| `memoryStore()` | Tests, and hosts without storage |
| `openSqliteStore(driver, options)` | The real one |

## SQLite

The package has no Node, Tauri, or Rust dependency: a host supplies an
`SqlDriver`, and it **must be one connection**, because `PRAGMA`s and transactions
are per connection (ADR 0006 notes the plugin's pool). The tests use a driver
over Node's built-in SQLite, so they need Node 22 or later and skip on Node 20.

**In the Tauri shell,** `tauriDriver(invoke)` passes SQL to three thin Rust
commands (`library_open`, `library_run`, `library_all`) that own one `rusqlite`
connection. They are async commands, so an fsync can't block the main thread, and
they hold no domain logic. `library_open` reports whether this is an Apple
platform, for `fullfsync`.

- **Durability:** WAL and `synchronous=FULL` are set, then read back. Storage
  that can't give them is `durability-not-met`. `apple: true` adds `fullfsync`
  and `checkpoint_fullfsync`.
- **Bounded:** `busy_timeout` defaults to 5 s, so a locked database fails rather
  than hangs.
- **Documents:** a revision is stored as its native document, byte for byte, with
  a few index columns, so the stored and exchanged forms share one schema and
  one migration path.
- **Version 2** adds the `draft` table, the library's first real schema upgrade.
  A write deletes and inserts the row, so `seq` (AUTOINCREMENT) is the draft's
  sequence and is never reused. A version-1 library upgrades only with a backup.
- **Migrations:** `user_version` is the database's own version, separate from
  document schema versions. Before migrating existing data, a backup is made with
  `VACUUM INTO`, and if it can't be made, nothing starts. All pending steps run
  in one transaction, so a library is never between versions. A failure rolls
  back and the backup stays. A database from a newer build is refused untouched.

**Verified with Node's SQLite on Linux:** real `SIGKILL` during a transaction,
during a migration, and during saves over three rounds: integrity ok, every
acknowledged revision present and verifying, head on the last revision. Killed
during back-to-back draft writes over three rounds: the draft opens, and it is
the last acknowledged write or the one after it (committed, not yet reported).

**Verified through the real shell on Linux (spike `repo.html`):** the same library
over Tauri IPC and the shell's connection, hard-killed during saves for 5 rounds:
integrity ok, WAL, `synchronous=2`, 2,532 of 2,532 revisions verify, head on the
last saved revision.

**Not verified:** power loss; macOS, Windows, iOS, and Android through the shell
(the workflow step exists and has not run); `fullfsync` through the shell;
migration through the shell.

## Not done

Tracked separately: ordinary save, open, and recoverable delete do not complete
these Phase 3 requirements.

| Requirement | State |
|---|---|
| **Autosave** (transactional drafts, unsaved-draft behavior) | **Draft storage done** in the library (2026-11-24), both stores. Not in the editor or the app: no autosave timing, no unsaved-draft UI |
| **Crash recovery** (restoring a draft after a crash, in the app) | **Not started.** Kill tests show saved data survives; they don't recover unsaved work |
| Backups as a user feature | Not started. `VACUUM INTO` before migration only |
| Restoring from a migration backup as a user action | Not started. The backup is made and verified to open |
| Search, duplicate | Not started |
| Tauri driver | Done in the spike shell, Linux. The production shell doesn't exist yet (ADR 0003) |
| Batches, equipment profile versions, catalogs in the library | Later |
