import type { Revision } from "@carboy/recipe-core";
import { readNative, writeNative, type ReadResult } from "@carboy/recipe-format";
import { LibraryError, type LibraryStore, type RecipeRepository, type RecipeRow, type RecipeSummary, type RevisionRow, type RevisionSummary, type SaveResult, type StoreTransaction } from "./contract.js";

// Every rule of the repository contract, once, above any store. Revisions are
// immutable and written whole. A recipe's history is linear for now: a save
// must descend from the current head, because merging is the sync model's job
// (D-011a) and silently forking or overwriting would lose someone's work.

export function createLibrary(store: LibraryStore): RecipeRepository {
  const live = async (tx: StoreTransaction, recipeId: string): Promise<RecipeRow> => {
    const row = await existing(tx, recipeId);
    if (row.deleted_at !== null) throw new LibraryError("recipe-deleted", "this recipe is deleted; restore it first", { recipe_id: recipeId });
    return row;
  };
  return {
    async save(revision: Revision): Promise<SaveResult> {
      const document = writeNative(revision);
      const read = readNative(document);
      if (read.status !== "editable") {
        throw new LibraryError("invalid-revision", "only a valid, verified revision is saved", { status: read.status, reason: "reason" in read ? read.reason : undefined, issues: read.issues.map((i) => `${i.code} ${i.path}`) });
      }
      const { envelope, content } = read.revision;
      return store.transaction(async (tx) => {
        const prior = await tx.getRevision(envelope.revision_id);
        if (prior) {
          if (prior.content_hash !== envelope.content_hash || prior.recipe_id !== envelope.recipe_id) {
            throw new LibraryError("revision-conflict", "this revision id already holds other content; revisions never change", { revision_id: envelope.revision_id });
          }
          return { status: "already-saved", head: (await existing(tx, envelope.recipe_id)).head };
        }
        const recipe = await tx.getRecipe(envelope.recipe_id);
        if (recipe) {
          if (recipe.deleted_at !== null) throw new LibraryError("recipe-deleted", "this recipe is deleted; restore it first", { recipe_id: envelope.recipe_id });
          if (envelope.parents.length === 0) throw new LibraryError("recipe-exists", "this recipe already has a root revision", { recipe_id: envelope.recipe_id });
        }
        for (const parent of envelope.parents) {
          const row = await tx.getRevision(parent);
          if (!row || row.recipe_id !== envelope.recipe_id) throw new LibraryError("parent-not-found", "a parent revision isn't in this recipe", { parent });
        }
        if (recipe && !envelope.parents.includes(recipe.head)) {
          throw new LibraryError("stale-head", "this edit starts from an older revision than the current one", { head: recipe.head, parents: [...envelope.parents] });
        }
        await tx.insertRevision({
          revision_id: envelope.revision_id,
          recipe_id: envelope.recipe_id,
          parents: envelope.parents,
          created_at: envelope.created_at,
          origin: envelope.origin,
          content_hash: envelope.content_hash,
          document,
        });
        const c = content as unknown as { name: string; beverage: { type: string } };
        await tx.putRecipe({ recipe_id: envelope.recipe_id, name: c.name, beverage: c.beverage.type, head: envelope.revision_id, updated_at: envelope.created_at, deleted_at: null });
        return { status: "saved", head: envelope.revision_id };
      });
    },

    async open(recipeId: string, revisionId?: string): Promise<ReadResult> {
      const row = await store.transaction(async (tx) => {
        const recipe = await live(tx, recipeId);
        const found = await tx.getRevision(revisionId ?? recipe.head);
        if (!found || found.recipe_id !== recipeId) throw new LibraryError("not-found", "no such revision in this recipe", { revision_id: revisionId });
        return found;
      });
      const read = readNative(row.document);
      if (read.status === "rejected") throw new LibraryError("unreadable-revision", "the stored document can't be read", { revision_id: row.revision_id, reason: read.reason });
      return read;
    },

    async list(options = {}): Promise<RecipeSummary[]> {
      const deleted = options.deleted ?? "exclude";
      const rows = await store.transaction((tx) => tx.listRecipes());
      return rows
        .filter((r) => deleted === "include" || (deleted === "only") === (r.deleted_at !== null))
        .map((r) => ({ recipe_id: r.recipe_id, name: r.name, beverage: r.beverage, head: r.head, revisions: r.revisions, updated_at: r.updated_at, ...(r.deleted_at !== null ? { deleted_at: r.deleted_at } : {}) }))
        .sort((a, b) => order(a.name, b.name) || order(a.recipe_id, b.recipe_id));
    },

    async revisions(recipeId: string): Promise<RevisionSummary[]> {
      const rows = await store.transaction(async (tx) => {
        await existing(tx, recipeId);
        return tx.listRevisions(recipeId);
      });
      return rows.map(summary);
    },

    remove: (recipeId, at) =>
      store.transaction(async (tx) => {
        await tx.putRecipe({ ...(await live(tx, recipeId)), deleted_at: at });
      }),

    restore: (recipeId) =>
      store.transaction(async (tx) => {
        const row = await existing(tx, recipeId);
        if (row.deleted_at === null) throw new LibraryError("not-deleted", "this recipe isn't deleted", { recipe_id: recipeId });
        await tx.putRecipe({ ...row, deleted_at: null });
      }),

    purge: (recipeId) =>
      store.transaction(async (tx) => {
        const row = await existing(tx, recipeId);
        if (row.deleted_at === null) throw new LibraryError("not-deleted", "delete the recipe before removing it permanently", { recipe_id: recipeId });
        await tx.deleteRecipe(recipeId);
      }),
  };
}

async function existing(tx: StoreTransaction, recipeId: string): Promise<RecipeRow> {
  const row = await tx.getRecipe(recipeId);
  if (!row) throw new LibraryError("not-found", "no such recipe", { recipe_id: recipeId });
  return row;
}

function summary(r: RevisionRow): RevisionSummary {
  return { revision_id: r.revision_id, parents: r.parents, created_at: r.created_at, origin: r.origin, content_hash: r.content_hash };
}

/** Code-unit order: the same everywhere. Display sorting belongs to the UI. */
function order(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
