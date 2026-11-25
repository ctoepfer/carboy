import { checkSchemaVersion, isUuid, validateContent, type Content, type Json, type Revision } from "@carboy/recipe-core";
import { readNative, writeNative, type ReadResult } from "@carboy/recipe-format";
import { LibraryError, type Draft, type DraftRow, type DraftSummary, type LibraryStore, type RecipeRepository, type RecipeRow, type RecipeSummary, type RevisionRow, type RevisionSummary, type SaveResult, type StoredDraft, type StoreTransaction } from "./contract.js";

// Every rule of the repository contract, once, above any store. Revisions are
// immutable and written whole. A recipe's history is linear for now: a save
// must descend from the current head, because merging is the sync model's job
// (D-011a) and silently forking or overwriting would lose someone's work.
//
// A draft (UD3) is a recipe's unsaved work: written whole on every autosave,
// one per recipe, never a revision by itself. It is checked like a revision's
// content, and a write must name the draft it replaces, for the same reason.

export function createLibrary(store: LibraryStore): RecipeRepository {
  const live = async (tx: StoreTransaction, recipeId: string): Promise<RecipeRow> => {
    const row = await existing(tx, recipeId);
    if (row.deleted_at !== null) throw new LibraryError("recipe-deleted", "this recipe is deleted; restore it first", { recipe_id: recipeId });
    return row;
  };
  return {
    async save(revision: Revision, options = {}): Promise<SaveResult> {
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
          // A retry of a save that committed: its draft is gone, or still here if this is a new attempt with the same revision.
          if (options.draft !== undefined && (await tx.getDraft(envelope.recipe_id))?.sequence === options.draft) await tx.deleteDraft(envelope.recipe_id);
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
        if (options.draft !== undefined) await current(tx, envelope.recipe_id, options.draft);
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
        if (options.draft !== undefined) await tx.deleteDraft(envelope.recipe_id);
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

    async saveDraft(draft: Draft, replaces: number | null): Promise<{ readonly sequence: number }> {
      const row = draftRow(draft);
      return store.transaction(async (tx) => {
        const prior = await tx.getDraft(row.recipe_id);
        if ((prior?.sequence ?? null) !== replaces) {
          throw new LibraryError("stale-draft", "the draft changed since it was read; reopen it before writing", { recipe_id: row.recipe_id, sequence: prior?.sequence ?? null, replaces });
        }
        const recipe = await tx.getRecipe(row.recipe_id);
        if (row.base_revision === null) {
          if (recipe) throw new LibraryError("recipe-exists", "this recipe is saved; its draft starts from one of its revisions", { recipe_id: row.recipe_id });
        } else {
          if (!recipe) throw new LibraryError("not-found", "no such recipe", { recipe_id: row.recipe_id });
          if (recipe.deleted_at !== null) throw new LibraryError("recipe-deleted", "this recipe is deleted; restore it first", { recipe_id: row.recipe_id });
          const base = await tx.getRevision(row.base_revision);
          if (!base || base.recipe_id !== row.recipe_id) throw new LibraryError("not-found", "the draft's base revision isn't in this recipe", { base_revision: row.base_revision });
        }
        return { sequence: await tx.putDraft(row) };
      });
    },

    async openDraft(recipeId: string): Promise<StoredDraft | undefined> {
      const found = await store.transaction(async (tx) => {
        const row = await tx.getDraft(recipeId);
        if (!row) return undefined;
        const recipe = await tx.getRecipe(recipeId);
        if (recipe?.deleted_at) throw new LibraryError("recipe-deleted", "this recipe is deleted; restore it first", { recipe_id: recipeId });
        return { row, head: recipe?.head ?? null };
      });
      return found && readDraft(found.row, found.head);
    },

    async drafts(): Promise<DraftSummary[]> {
      const rows = await store.transaction(async (tx) => {
        const out: { row: DraftRow; head: string | null }[] = [];
        for (const row of await tx.listDrafts()) {
          const recipe = await tx.getRecipe(row.recipe_id);
          if (!recipe?.deleted_at) out.push({ row, head: recipe?.head ?? null });
        }
        return out;
      });
      return rows
        .map(({ row: r, head }) => ({ recipe_id: r.recipe_id, name: r.name, base_revision: r.base_revision, head, applied: r.applied, updated_at: r.updated_at, sequence: r.sequence }))
        .sort((a, b) => order(a.name, b.name) || order(a.recipe_id, b.recipe_id));
    },

    discardDraft: (recipeId, sequence) =>
      store.transaction(async (tx) => {
        await current(tx, recipeId, sequence);
        await tx.deleteDraft(recipeId);
      }),

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

/** The recipe's draft, which must be at `sequence`. */
async function current(tx: StoreTransaction, recipeId: string, sequence: number): Promise<DraftRow> {
  const row = await tx.getDraft(recipeId);
  if (!row) throw new LibraryError("not-found", "this recipe has no draft", { recipe_id: recipeId });
  if (row.sequence !== sequence) throw new LibraryError("stale-draft", "the draft changed since it was read; reopen it first", { recipe_id: recipeId, sequence: row.sequence, expected: sequence });
  return row;
}

/** What's wrong with a draft, or nothing. Checked on every write and every read. */
function draftIssues(d: Draft): string[] {
  const out: string[] = [];
  if (typeof d.recipe_id !== "string" || !isUuid(d.recipe_id)) out.push("recipe_id is a UUID");
  if (d.base_revision !== null && (typeof d.base_revision !== "string" || !isUuid(d.base_revision))) out.push("base_revision is a UUID or null");
  if (typeof d.updated_at !== "string" || d.updated_at === "") out.push("updated_at is a timestamp");
  if (typeof d.schema_version !== "string") out.push("schema_version is a string");
  else out.push(...checkSchemaVersion(d.content, d.schema_version).map((i) => `${i.code} ${i.path}`));
  out.push(...validateContent(d.content).map((i) => `${i.code} ${i.path}`));
  if (!Array.isArray(d.history) || !d.history.every((step) => Array.isArray(step) && step.every((c) => typeof c === "object" && c !== null && !Array.isArray(c)))) {
    out.push("history is a list of command lists");
  } else if (!Number.isInteger(d.applied) || d.applied < 0 || d.applied > d.history.length) {
    out.push("applied counts history entries in effect");
  }
  return out;
}

function draftRow(d: Draft): Omit<DraftRow, "sequence"> {
  const issues = draftIssues(d);
  if (issues.length > 0) throw new LibraryError("invalid-draft", "only a valid draft is kept", { issues });
  return {
    recipe_id: d.recipe_id,
    base_revision: d.base_revision,
    schema_version: d.schema_version,
    name: String((d.content as { name?: unknown }).name ?? ""),
    content: JSON.stringify(d.content),
    history: JSON.stringify(d.history),
    applied: d.applied,
    updated_at: d.updated_at,
  };
}

function readDraft(r: DraftRow, head: string | null): StoredDraft {
  let content: Content, history: readonly (readonly Json[])[];
  try {
    content = JSON.parse(r.content) as Content;
    history = JSON.parse(r.history) as Json[][];
  } catch (e) {
    throw new LibraryError("unreadable-draft", "the stored draft can't be read", { recipe_id: r.recipe_id, sequence: r.sequence, cause: String(e) });
  }
  const draft: Draft = { recipe_id: r.recipe_id, base_revision: r.base_revision, schema_version: r.schema_version, content, history, applied: r.applied, updated_at: r.updated_at };
  const issues = draftIssues(draft);
  if (issues.length > 0) throw new LibraryError("unreadable-draft", "the stored draft isn't valid", { recipe_id: r.recipe_id, sequence: r.sequence, issues });
  return { ...draft, sequence: r.sequence, head };
}

function summary(r: RevisionRow): RevisionSummary {
  return { revision_id: r.revision_id, parents: r.parents, created_at: r.created_at, origin: r.origin, content_hash: r.content_hash };
}

/** Code-unit order: the same everywhere. Display sorting belongs to the UI. */
function order(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
