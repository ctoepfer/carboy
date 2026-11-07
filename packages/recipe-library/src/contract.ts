import type { Json, Revision } from "@carboy/recipe-core";
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
  | "durability-not-met";

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

export interface RecipeRepository {
  /** Store an immutable revision and move the recipe's head to it. */
  save(revision: Revision): Promise<SaveResult>;
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
  /** Removes the recipe and all its revisions. */
  deleteRecipe(recipeId: string): Promise<void>;
}

export interface LibraryStore {
  transaction<T>(fn: (tx: StoreTransaction) => Promise<T>): Promise<T>;
}
