import type { Revision } from "@carboy/recipe-core";
import { LibraryError, type Draft, type RecipeRepository, type SaveResult } from "./contract.js";

// Autosave for one open recipe (owner, 2026-11-24): typing is written about
// 750 ms after it stops; a discrete edit is written at once; flush() writes
// whatever is pending now, for blur, navigation, and an explicit save. Writes
// never overlap and always name the draft they replace, so the library's
// stale-draft check still guards every one. A failed write is reported and
// its draft kept, never retried silently: a new edit or retry() tries again.

/**
 * - `saved`: the latest draft is durable (or there was nothing to save).
 * - `pending`: changes are waiting for the debounce.
 * - `saving`: a write is in progress.
 * - `failed`: the last write failed; the changes are still held here.
 */
export type AutosaveStatus = "saved" | "pending" | "saving" | "failed";

export const AUTOSAVE_DEBOUNCE_MS = 750;

export interface AutosaveOptions {
  /** The sequence of the recipe's stored draft, or null if it has none. */
  readonly sequence: number | null;
  readonly debounceMs?: number;
  /** Called on every status change. */
  readonly onStatus?: (status: AutosaveStatus, error?: unknown) => void;
  /** Timers, replaceable in tests. Default: the global setTimeout and clearTimeout. */
  readonly setTimer?: (fn: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
}

export interface Autosave {
  /** Record the latest draft. `typing` waits for the debounce; `discrete` is written at once. */
  changed(draft: Draft, kind: "typing" | "discrete"): void;
  /** Write anything pending now and wait for it. Resolves to the status afterwards. A failed draft isn't retried here. */
  flush(): Promise<AutosaveStatus>;
  /** Try the failed write again ("Try saving again"). */
  retry(): Promise<AutosaveStatus>;
  /**
   * An explicit save: flush, then save the revision and remove the draft in
   * one transaction. Throws if the flush failed or the save is refused; the
   * draft stays either way. `revision` must hold the latest content: if
   * changed() is called after commit() and before the save is made, the save
   * is refused (`stale-draft`), because removing the draft would lose that
   * edit. Edits made while the save is running are the caller's to hold back.
   */
  commit(revision: Revision): Promise<SaveResult>;
  readonly status: AutosaveStatus;
  /** The stored draft's sequence; null when there is none. */
  readonly sequence: number | null;
  readonly error: unknown;
}

export function createAutosave(library: RecipeRepository, options: AutosaveOptions): Autosave {
  const debounce = options.debounceMs ?? AUTOSAVE_DEBOUNCE_MS;
  // Every JavaScript host the app runs on has these; typed here so the package
  // needs neither DOM nor Node type definitions.
  const host = globalThis as unknown as { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(handle: unknown): void };
  const setTimer = options.setTimer ?? ((fn, ms) => host.setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((h) => host.clearTimeout(h));
  let sequence = options.sequence;
  let pending: Draft | undefined;
  /** The pending draft already failed: written again only after a new edit or retry(). */
  let held = false;
  /** Counts changed() calls, so commit() can tell whether an edit arrived after it was called. */
  let edits = 0;
  let timer: unknown;
  let status: AutosaveStatus = "saved";
  let error: unknown;
  // Every write and commit runs on this chain, one at a time.
  let chain: Promise<unknown> = Promise.resolve();

  const set = (s: AutosaveStatus, e?: unknown) => {
    error = e;
    if (s === status && s !== "failed") return;
    status = s;
    options.onStatus?.(s, e);
  };
  const cancelTimer = () => {
    if (timer !== undefined) clearTimer(timer);
    timer = undefined;
  };
  // Writes the newest pending draft, and again if a discrete edit arrived
  // meanwhile. Typing that arrived meanwhile waits for its own debounce.
  const writeAll = async (): Promise<void> => {
    if (held) return;
    while (pending && timer === undefined) {
      const draft = pending;
      pending = undefined;
      set("saving");
      try {
        sequence = (await library.saveDraft(draft, sequence)).sequence;
      } catch (e) {
        if (!pending) pending = draft; // keep the unsaved work; a newer change supersedes it
        held = true;
        set("failed", e);
        return;
      }
    }
    if (timer === undefined) set("saved");
    else set("pending");
  };
  const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => undefined);
    return next;
  };
  const write = () => enqueue(writeAll);

  return {
    changed(draft, kind) {
      edits++;
      pending = draft;
      held = false;
      cancelTimer();
      if (kind === "discrete") {
        void write();
        return;
      }
      if (status !== "saving") set("pending");
      timer = setTimer(() => {
        timer = undefined;
        void write();
      }, debounce);
    },
    flush() {
      cancelTimer();
      return write().then(() => status);
    },
    retry() {
      held = false;
      cancelTimer();
      return write().then(() => status);
    },
    commit(revision) {
      cancelTimer();
      const asked = edits;
      return enqueue(async () => {
        await writeAll();
        if (held || status === "failed") throw error;
        if (pending || edits !== asked) throw new LibraryError("stale-draft", "the recipe changed after Save was chosen; save again", {});
        set("saving");
        try {
          const result = await library.save(revision, sequence === null ? {} : { draft: sequence });
          sequence = null;
          set("saved");
          return result;
        } catch (e) {
          set("failed", e);
          throw e;
        }
      });
    },
    get status() {
      return status;
    },
    get sequence() {
      return sequence;
    },
    get error() {
      return error;
    },
  };
}
