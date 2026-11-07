import type { LibraryStore, RecipeRow, RevisionRow, StoreTransaction } from "./contract.js";

// A store with no persistence, for tests and hosts without storage. A
// transaction works on a copy and replaces the state only on success, and
// transactions run one at a time.

interface State {
  readonly recipes: Map<string, RecipeRow>;
  readonly revisions: Map<string, RevisionRow>;
}

export function memoryStore(): LibraryStore {
  let state: State = { recipes: new Map(), revisions: new Map() };
  let queue: Promise<unknown> = Promise.resolve();
  return {
    transaction<T>(fn: (tx: StoreTransaction) => Promise<T>): Promise<T> {
      const run = async (): Promise<T> => {
        const work: State = { recipes: new Map(state.recipes), revisions: new Map(state.revisions) };
        const result = await fn(transaction(work));
        state = work;
        return result;
      };
      const next = queue.then(run, run);
      queue = next.catch(() => undefined);
      return next;
    },
  };
}

function transaction(s: State): StoreTransaction {
  return {
    getRecipe: async (id) => s.recipes.get(id),
    putRecipe: async (row) => void s.recipes.set(row.recipe_id, row),
    listRecipes: async () => [...s.recipes.values()].map((r) => ({ ...r, revisions: [...s.revisions.values()].filter((v) => v.recipe_id === r.recipe_id).length })),
    getRevision: async (id) => s.revisions.get(id),
    insertRevision: async (row) => void s.revisions.set(row.revision_id, row),
    listRevisions: async (id) => [...s.revisions.values()].filter((v) => v.recipe_id === id),
    deleteRecipe: async (id) => {
      s.recipes.delete(id);
      for (const [k, v] of s.revisions) if (v.recipe_id === id) s.revisions.delete(k);
    },
  };
}
