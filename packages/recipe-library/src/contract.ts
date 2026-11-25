import type { Content, Json, Revision } from "@carboy/recipe-core";
import type { ReadResult } from "@carboy/recipe-format";

// The Recipe Library contract (RECIPE_LIBRARY.md). Everyone else reaches saved
// recipes through RecipeRepository; a store only keeps rows, inside a
// transaction, and every rule lives in library.ts, so all stores behave alike.

export type LibraryErrorCode =
  | "invalid-revision"
  | "unreadable-revision"
  | "not-found"
  | "revision-conflict"
  | "parent-not-found"
  | "recipe-exists"
  | "stale-head"
  | "recipe-deleted"
  | "not-deleted"
  | "library-newer"
  | "backup-required"
  | "backup-failed"
  | "migration-failed"
  | "durability-not-met"
  | "invalid-draft"
  | "unreadable-draft"
  | "stale-draft";

export class LibraryError extends Error {
  constructor(
    readonly code: LibraryErrorCode,
    message: string,
    readonly details?: { readonly [key: string]: Json | undefined },
  ) {
    super(message);
    this.name = "LibraryError";
  }
}

export interface RecipeSummary {
  readonly recipe_id: string;
  readonly name: string;
  readonly beverage: string;
  readonly head: string;
  readonly revisions: number;
  readonly updated_at: string;
  readonly deleted_at?: string;
}

export interface RevisionSummary {
  readonly revision_id: string;
  readonly parents: readonly string[];
  readonly created_at: string;
  readonly origin: string;
  readonly content_hash: string;
}

export interface SaveResult {
  readonly status: "saved" | "already-saved";
  readonly head: string;
}

/**
 * A recipe's working draft: unsaved edits, kept apart from its revisions (UD3,
 * owner 2026-11-24). It never becomes a revision by itself; only a save does.
 * The library checks its shape and content but doesn't interpret its commands:
 * replaying or undoing them is the editor's job.
 */
export interface Draft {
  readonly recipe_id: string;
  /** The revision the draft started from; null for a recipe never saved. */
  readonly base_revision: string | null;
  /** The content schema version of `content` and of the commands in `history`. */
  readonly schema_version: string;
  /** The working recipe as the editor last showed it. */
  readonly content: Content;
  /** Undo history, oldest first: each entry is one command list (one user action). */
  readonly history: readonly (readonly Json[])[];
  /** How many history entries are in effect; the entries after them are redo. */
  readonly applied: number;
  /** UTC timestamp of this write. */
  readonly updated_at: string;
}

export interface StoredDraft extends Draft {
  /** Changes on every write and is never reused in this library. Pass it back to replace or discard the draft. */
  readonly sequence: number;
  /** The recipe's head now; null if the recipe was never saved. Differs from `base_revision` when the draft is stale. */
  readonly head: string | null;
}

export interface DraftSummary {
  readonly recipe_id: string;
  readonly name: string;
  readonly base_revision: string | null;
  readonly head: string | null;
  readonly applied: number;
  readonly updated_at: string;
  readonly sequence: number;
}

export interface RecipeRepository {
  /**
   * Store an immutable revision and move the recipe's head to it. With
   * `draft`, the recipe's draft must be at that sequence and is removed in
   * the same transaction, so a save never leaves its own draft behind.
   */
  save(revision: Revision, options?: { readonly draft?: number }): Promise<SaveResult>;
  /**
   * Write the recipe's draft whole. `replaces` is the sequence of the draft
   * being replaced, or null when there is none; anything else is
   * `stale-draft`, so two writers can't overwrite each other's work.
   */
  saveDraft(draft: Draft, replaces: number | null): Promise<{ readonly sequence: number }>;
  /** The recipe's draft, or undefined if it has none. Damage is reported, never repaired. */
  openDraft(recipeId: string): Promise<StoredDraft | undefined>;
  /** Every draft, for recovery after a crash, without loading content or history. */
  drafts(): Promise<DraftSummary[]>;
  /** Removes the draft at that sequence. */
  discardDraft(recipeId: string, sequence: number): Promise<void>;
  /** The head, or a named revision. Damage is reported, never repaired. */
  open(recipeId: string, revisionId?: string): Promise<ReadResult>;
  list(options?: { readonly deleted?: "exclude" | "only" | "include" }): Promise<RecipeSummary[]>;
  /** Oldest saved first. */
  revisions(recipeId: string): Promise<RevisionSummary[]>;
  /** Recoverable: hides the recipe and refuses edits. `at` is a UTC timestamp. */
  remove(recipeId: string, at: string): Promise<void>;
  restore(recipeId: string): Promise<void>;
  /** Permanent, and only after remove. */
  purge(recipeId: string): Promise<void>;
}

export interface RecipeRow {
  readonly recipe_id: string;
  readonly name: string;
  readonly beverage: string;
  readonly head: string;
  readonly updated_at: string;
  readonly deleted_at: string | null;
}

export interface RevisionRow extends RevisionSummary {
  readonly recipe_id: string;
  /** The native document, byte for byte (RECIPE_FORMAT.md). */
  readonly document: string;
}

/** What a store must do. Everything in one `transaction` commits or none of it does, and transactions don't overlap. */
export interface StoreTransaction {
  getRecipe(recipeId: string): Promise<RecipeRow | undefined>;
  putRecipe(row: RecipeRow): Promise<void>;
  listRecipes(): Promise<(RecipeRow & { readonly revisions: number })[]>;
  getRevision(revisionId: string): Promise<RevisionRow | undefined>;
  insertRevision(row: RevisionRow): Promise<void>;
  /** Oldest saved first. */
  listRevisions(recipeId: string): Promise<RevisionRow[]>;
  /** Removes the recipe, all its revisions, and its draft. */
  deleteRecipe(recipeId: string): Promise<void>;
  getDraft(recipeId: string): Promise<DraftRow | undefined>;
  /** Replaces the recipe's draft and returns its new sequence: larger than any this store has given. */
  putDraft(row: Omit<DraftRow, "sequence">): Promise<number>;
  deleteDraft(recipeId: string): Promise<void>;
  listDrafts(): Promise<DraftRow[]>;
}

/** A draft as stored: content and history as JSON text, read back without repair. */
export interface DraftRow {
  readonly sequence: number;
  readonly recipe_id: string;
  readonly base_revision: string | null;
  readonly schema_version: string;
  readonly name: string;
  readonly content: string;
  readonly history: string;
  readonly applied: number;
  readonly updated_at: string;
}

export interface LibraryStore {
  transaction<T>(fn: (tx: StoreTransaction) => Promise<T>): Promise<T>;
}
