import { SCHEMA_VERSION, canonicalize, createRevision, type Content, type Json } from "@carboy/recipe-core";
import { HistoryError, createUndoHistory, emptyTemplate, type Diagnostic, type UndoHistory } from "@carboy/editor-commands";
import { LibraryError, createAutosave, type Autosave, type AutosaveStatus, type DraftSummary, type RecipeRepository, type SaveResult, type StoredDraft } from "@carboy/recipe-library";

// One open recipe's editing session (Phase 3: unsaved-draft behaviour and
// crash recovery). Headless: a UI binds to it, whichever framework is chosen.
//
// - Every edit goes through Editor Commands (the undo history) and is
//   autosaved as the recipe's draft, never as a revision (UD3).
// - Saving makes a revision from the current content and removes the draft in
//   one transaction. Undo history survives saving, so undo can reach back
//   before a save; the edits it makes are new unsaved changes.
// - Opening a recipe that has a draft never restores it silently (UD3,
//   USABILITY §3): the caller gets the offer and chooses to resume or discard.
// - Nothing here makes ids or reads the clock: the host passes newId and now.

const SCHEMA = `${SCHEMA_VERSION.major}.${SCHEMA_VERSION.minor}`;

export interface SessionHost {
  readonly library: RecipeRepository;
  /** A new UUID (the host's UUIDv7), for revision ids and new recipes. */
  readonly newId: () => string;
  /** The time in milliseconds since the epoch. */
  readonly now: () => number;
  /** Autosave timing and timers; the defaults are the owner's (750 ms). */
  readonly debounceMs?: number;
  readonly setTimer?: (fn: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
  /** Called whenever the session's visible state changes. */
  readonly onChange?: (session: RecipeSession) => void;
}

/**
 * - `new`: never saved, and nothing edited yet.
 * - `clean`: the content is the base revision's.
 * - `unsaved`: the content differs from the base revision (or the recipe was never saved).
 */
export type SessionState = "new" | "clean" | "unsaved";

export type EditOutcome =
  | { readonly status: "applied" }
  | { readonly status: "rejected"; readonly diagnostics: readonly Diagnostic[] }
  /** A save or a discard is running; the edit wasn't applied, so it can't be lost by either. */
  | { readonly status: "busy" };

export interface RecipeSession {
  readonly recipeId: string;
  readonly content: Content;
  /** The revision the content started from; null if the recipe was never saved. */
  readonly baseRevision: string | null;
  readonly state: SessionState;
  /** Whether the latest draft is durable: saved, pending, saving, or failed. */
  readonly saveStatus: AutosaveStatus;
  readonly saveError: unknown;
  readonly saving: boolean;
  /** A discard is running: edits, undo, redo, and save are refused until it ends. */
  readonly discarding: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Apply one user action. `field` marks typing in one field: written after the debounce, and coalesced into one undo step. */
  edit(commands: readonly Json[], options?: { readonly field?: string }): EditOutcome;
  undo(): boolean;
  redo(): boolean;
  /** Write the pending draft now (blur, navigation). */
  flush(): Promise<AutosaveStatus>;
  /** Try a failed draft write again. */
  retry(): Promise<AutosaveStatus>;
  /** Save the current content as a revision. `unchanged` when there's nothing to save. */
  save(): Promise<SaveResult | { readonly status: "unchanged" }>;
  /** Drop the unsaved changes: back to the base revision (a never-saved recipe goes back to where its session began), draft removed. Undo history is cleared. */
  discard(): Promise<void>;
}

export type OpenResult =
  | { readonly status: "opened"; readonly session: RecipeSession }
  /** Unsaved work was found. Nothing is restored until the caller chooses. */
  | {
      readonly status: "draft-found";
      readonly draft: DraftOffer;
      /** Continue the draft, with its undo history. */
      resume(): Promise<RecipeSession>;
      /** Delete the draft and open the saved recipe. */
      discard(): Promise<OpenResult>;
    };

export interface DraftOffer {
  readonly recipe_id: string;
  readonly name: string;
  readonly base_revision: string | null;
  /** The recipe's head now; differs from base_revision when the recipe was saved elsewhere since. */
  readonly head: string | null;
  readonly stale: boolean;
  readonly updated_at: string;
  /** Undo steps in effect in the draft. */
  readonly applied: number;
  /** Set when the draft can't be resumed (damaged, or its history no longer replays). It can still be discarded. */
  readonly unreadable?: string;
}

/** Unsaved work left by an earlier run, for the recovery offer at startup. */
export async function recoverable(library: RecipeRepository): Promise<DraftSummary[]> {
  return library.drafts();
}

/** Start a recipe that has never been saved. Nothing is stored until the first edit. */
export function newRecipe(host: SessionHost, beverage: string, name: string): RecipeSession {
  const start = emptyTemplate(beverage, name);
  return session(host, { recipeId: host.newId(), base: null, baseContent: null, history: createUndoHistory({ start, entries: [], applied: 0 }), sequence: null });
}

/** Open a saved recipe, or a never-saved one that has only a draft. */
export async function openRecipe(host: SessionHost, recipeId: string): Promise<OpenResult> {
  const { library } = host;
  let stored: StoredDraft | undefined;
  let unreadable: string | undefined;
  try {
    stored = await library.openDraft(recipeId);
  } catch (e) {
    if (!(e instanceof LibraryError) || e.code !== "unreadable-draft") throw e;
    unreadable = e.message;
  }
  const summary = (await library.drafts()).find((d) => d.recipe_id === recipeId);
  if (stored || summary) {
    const d = stored ?? summary!;
    let history: UndoHistory | undefined;
    if (stored) {
      try {
        history = createUndoHistory({ start: stored.history_start, entries: stored.history, applied: stored.applied }, { expected: stored.content });
      } catch (e) {
        if (!(e instanceof HistoryError)) throw e;
        unreadable = e.message;
      }
    }
    const offer: DraftOffer = {
      recipe_id: recipeId,
      name: stored ? String((stored.content as { name?: unknown }).name ?? "") : summary!.name,
      base_revision: d.base_revision,
      head: d.head,
      stale: d.base_revision !== d.head,
      updated_at: d.updated_at,
      applied: d.applied,
      ...(unreadable !== undefined ? { unreadable } : {}),
    };
    return {
      status: "draft-found",
      draft: offer,
      async resume() {
        if (!stored || !history) throw new LibraryError("unreadable-draft", offer.unreadable ?? "the draft can't be resumed", { recipe_id: recipeId });
        const baseContent = stored.base_revision === null ? null : await revisionContent(library, recipeId, stored.base_revision);
        return session(host, { recipeId, base: stored.base_revision, baseContent, history, sequence: stored.sequence });
      },
      async discard() {
        await library.discardDraft(recipeId, d.sequence);
        return openRecipe(host, recipeId);
      },
    };
  }
  const opened = await library.open(recipeId);
  if (opened.status !== "editable") throw new LibraryError("unreadable-revision", "the recipe opens read-only, so it can't be edited", { recipe_id: recipeId, status: opened.status });
  const base = opened.revision.envelope.revision_id;
  const content = opened.revision.content;
  return { status: "opened", session: session(host, { recipeId, base, baseContent: content, history: createUndoHistory({ start: content, entries: [], applied: 0 }), sequence: null }) };
}

async function revisionContent(library: RecipeRepository, recipeId: string, revisionId: string): Promise<Content> {
  const r = await library.open(recipeId, revisionId);
  if (r.status === "rejected") throw new LibraryError("unreadable-revision", "the draft's base revision can't be read", { revision_id: revisionId });
  return r.revision.content;
}

interface Start {
  readonly recipeId: string;
  readonly base: string | null;
  readonly baseContent: Content | null;
  readonly history: UndoHistory;
  readonly sequence: number | null;
}

function session(host: SessionHost, init: Start): RecipeSession {
  const { library, now } = host;
  const iso = () => new Date(now()).toISOString();
  let base = init.base;
  let baseContent = init.baseContent;
  let history = init.history;
  let saving = false;
  let discarding = false;
  const busy = () => saving || discarding;
  let edited = init.sequence !== null; // a resumed draft counts as edited
  let self: RecipeSession;
  const notify = () => host.onChange?.(self);
  const makeAutosave = (sequence: number | null): Autosave =>
    createAutosave(library, {
      sequence,
      ...(host.debounceMs !== undefined ? { debounceMs: host.debounceMs } : {}),
      ...(host.setTimer ? { setTimer: host.setTimer } : {}),
      ...(host.clearTimer ? { clearTimer: host.clearTimer } : {}),
      onStatus: () => notify(),
    });
  let autosave = makeAutosave(init.sequence);

  const same = (a: Content, b: Content) => canonicalize(a as Json) === canonicalize(b as Json);
  const draftNow = () => {
    const s = history.state;
    return { recipe_id: init.recipeId, base_revision: base, schema_version: SCHEMA, content: history.content, history_start: s.start, history: s.entries, applied: s.applied, updated_at: iso() };
  };
  const changed = (kind: "typing" | "discrete") => {
    edited = true;
    autosave.changed(draftNow(), kind);
    notify();
  };

  self = {
    recipeId: init.recipeId,
    get content() {
      return history.content;
    },
    get baseRevision() {
      return base;
    },
    get state(): SessionState {
      if (baseContent === null) return edited ? "unsaved" : "new";
      return same(history.content, baseContent) ? "clean" : "unsaved";
    },
    get saveStatus() {
      return autosave.status;
    },
    get saveError() {
      return autosave.error;
    },
    get saving() {
      return saving;
    },
    get discarding() {
      return discarding;
    },
    get canUndo() {
      return history.canUndo;
    },
    get canRedo() {
      return history.canRedo;
    },
    edit(commands, options = {}) {
      if (busy()) return { status: "busy" };
      const r = options.field === undefined ? history.edit(commands) : history.edit(commands, { coalesce: options.field, at: now() });
      if (r.status === "rejected") return { status: "rejected", diagnostics: r.diagnostics };
      changed(options.field === undefined ? "discrete" : "typing");
      return { status: "applied" };
    },
    undo() {
      if (busy() || !history.undo()) return false;
      changed("discrete");
      return true;
    },
    redo() {
      if (busy() || !history.redo()) return false;
      changed("discrete");
      return true;
    },
    flush: () => autosave.flush(),
    retry: () => autosave.retry(),
    async save() {
      if (busy()) throw new LibraryError("stale-draft", saving ? "a save is already running" : "a discard is running", { recipe_id: init.recipeId });
      if (self.state !== "unsaved") return { status: "unchanged" };
      saving = true;
      notify();
      try {
        const content = history.content;
        const revision = createRevision({ schema_version: SCHEMA, recipe_id: init.recipeId, revision_id: host.newId(), parents: base === null ? [] : [base], created_at: iso(), origin: "user_edit" }, content);
        const result = await autosave.commit(revision);
        base = result.head;
        baseContent = content;
        return result;
      } finally {
        saving = false;
        notify();
      }
    },
    async discard() {
      if (busy()) throw new LibraryError("stale-draft", saving ? "a save is running" : "a discard is already running", { recipe_id: init.recipeId });
      // Edits are refused until the discard ends: one made while the draft is
      // flushed and deleted would otherwise be reported applied, then dropped.
      discarding = true;
      notify();
      try {
        await autosave.flush(); // nothing may land after the delete
        const sequence = autosave.sequence;
        if (sequence !== null) await library.discardDraft(init.recipeId, sequence);
        history = createUndoHistory({ start: baseContent ?? init.history.state.start, entries: [], applied: 0 });
        autosave = makeAutosave(null);
        edited = false;
      } finally {
        discarding = false;
        notify();
      }
    },
  };
  return self;
}
