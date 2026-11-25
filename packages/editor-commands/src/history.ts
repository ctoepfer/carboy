import { canonicalize, type Content, type Json } from "@carboy/recipe-core";
import type { Diagnostic } from "./diagnostics.js";
import { applyCommands } from "./apply.js";

// Undo history for one recipe's draft (owner, 2026-11-24). Each entry is one
// undo step: a command list applied through applyCommands, never a patch, so
// replaying the history always passes the same validation as editing.
//
// - At most UNDO_LIMIT steps. When a new step would exceed it, the oldest is
//   folded into `start` (the recipe before the first kept step), so the
//   current recipe never changes; only how far back undo reaches.
// - A new edit after an undo discards the redo steps.
// - Rapid edits to the same field coalesce into one step: an edit carrying the
//   same `coalesce` key as the previous step, within COALESCE_MS of it, with no
//   undo or redo between, joins that step. When the new commands alone, applied
//   before the step, give the same recipe as the whole run (as with a field
//   typed over), they replace the step's commands; otherwise they're appended.
//
// The stored form ({ start, entries, applied }) is what a draft keeps; the
// coalescing state is only in memory, so a reopened history starts a new step.

export const UNDO_LIMIT = 100;
export const COALESCE_MS = 750;

export interface HistoryState {
  /** The recipe before the first entry. */
  readonly start: Content;
  readonly entries: readonly (readonly Json[])[];
  /** How many entries are in effect; the rest are redo. */
  readonly applied: number;
}

export type EditResult = { readonly status: "applied"; readonly content: Content } | { readonly status: "rejected"; readonly diagnostics: readonly Diagnostic[] };

export interface UndoHistory {
  /** The current recipe. */
  readonly content: Content;
  readonly state: HistoryState;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Apply one user action. A rejected edit changes nothing. */
  edit(commands: readonly Json[], options?: { readonly coalesce?: string; readonly at?: number }): EditResult;
  undo(): boolean;
  redo(): boolean;
}

export interface HistoryOptions {
  readonly limit?: number;
  readonly coalesceMs?: number;
}

/** Replays a stored history. Throws if an entry no longer applies, or if `expected` (the draft's content) differs from the replay. */
export function createUndoHistory(state: HistoryState, options: HistoryOptions & { readonly expected?: Content } = {}): UndoHistory {
  const limit = options.limit ?? UNDO_LIMIT;
  const coalesceMs = options.coalesceMs ?? COALESCE_MS;
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("the undo limit is a positive integer");
  if (!Number.isInteger(state.applied) || state.applied < 0 || state.applied > state.entries.length) throw new RangeError("applied counts entries in effect");
  let start = state.start;
  let entries: (readonly Json[])[] = [...state.entries];
  let applied = state.applied;
  let content = replay(start, entries, applied);
  if (options.expected !== undefined && canonicalize(options.expected as Json) !== canonicalize(content as Json)) {
    throw new HistoryError("the history doesn't reproduce the draft's content");
  }
  // The step the last edit made or joined, while it can still be joined.
  let open: { key: string; at: number; before: Content } | undefined;
  trim();

  // Over the limit: fold the oldest steps in effect into `start`, then, if
  // still over, drop redo steps from the end. The current recipe never moves.
  function trim(): void {
    while (entries.length > limit && applied > 0) {
      start = step(start, entries[0]!);
      entries = entries.slice(1);
      applied--;
    }
    if (entries.length > limit) entries = entries.slice(0, limit);
  }

  return {
    get content() {
      return content;
    },
    get state() {
      return { start, entries: [...entries], applied };
    },
    get canUndo() {
      return applied > 0;
    },
    get canRedo() {
      return applied < entries.length;
    },
    edit(commands, opts = {}) {
      const result = applyCommands(content, commands, { channel: "editor" });
      if (result.status === "rejected") return { status: "rejected", diagnostics: result.diagnostics };
      const at = opts.at ?? 0;
      const key = opts.coalesce;
      const joins = key !== undefined && open !== undefined && open.key === key && at - open.at <= coalesceMs && applied === entries.length && applied > 0;
      if (joins) {
        const before = open!.before;
        const alone = applyCommands(before, commands, { channel: "editor" });
        const replaces = alone.status === "applied" && canonicalize(alone.content as Json) === canonicalize(result.content as Json);
        entries[entries.length - 1] = replaces ? [...commands] : [...entries[entries.length - 1]!, ...commands];
        open = { key: key!, at, before };
      } else {
        const before = content;
        entries = entries.slice(0, applied); // a new edit discards the redo steps
        entries.push([...commands]);
        applied = entries.length;
        open = key === undefined ? undefined : { key, at, before };
        trim();
      }
      content = result.content;
      return { status: "applied", content };
    },
    undo() {
      if (applied === 0) return false;
      applied--;
      open = undefined;
      content = replay(start, entries, applied);
      return true;
    },
    redo() {
      if (applied === entries.length) return false;
      content = step(content, entries[applied]!);
      applied++;
      open = undefined;
      return true;
    },
  };
}

export class HistoryError extends Error {
  constructor(message: string, readonly diagnostics: readonly Diagnostic[] = []) {
    super(message);
    this.name = "HistoryError";
  }
}

function step(content: Content, commands: readonly Json[]): Content {
  const r = applyCommands(content, commands, { channel: "editor" });
  if (r.status === "rejected") throw new HistoryError("a stored undo step no longer applies", r.diagnostics);
  return r.content;
}

function replay(start: Content, entries: readonly (readonly Json[])[], applied: number): Content {
  let c = start;
  for (let i = 0; i < applied; i++) c = step(c, entries[i]!);
  return c;
}
