// The first Recipe Library workflow, end to end and headless: create, edit,
// autosave, save, reopen, undo across a save, discard, and recovery of unsaved
// work, which is offered and never silent (UD3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRevision } from "@carboy/recipe-core";
import { createLibrary, memoryStore } from "@carboy/recipe-library";
import { newRecipe, openRecipe, recoverable } from "../dist/index.js";
import { host } from "./helpers.mjs";

const settle = () => new Promise((r) => setTimeout(r, 0));
const rename = (name) => [{ op: "set_name", name }];
const note = (i) => [{ op: "add_note", id: `0192f3a0-0000-7000-8000-${String(900 + i).padStart(12, "0")}`, text: `note ${i}` }];
const fresh = () => createLibrary(memoryStore());

test("create, edit, save, and reopen a recipe; the draft exists only while there is unsaved work", async () => {
  const library = fresh();
  const h = host(library);
  const s = newRecipe(h, "beer", "Pale ale");
  assert.equal(s.state, "new");
  assert.equal(s.edit(rename("Pale ale, more hops")).status, "applied");
  assert.equal(s.state, "unsaved");
  assert.equal(await s.flush(), "saved");
  assert.equal((await recoverable(library)).length, 1, "the unsaved work is a draft");
  assert.deepEqual(await library.list(), [], "and not a revision");
  const saved = await s.save();
  assert.equal(saved.status, "saved");
  assert.equal(s.state, "clean");
  assert.equal(s.baseRevision, saved.head);
  assert.deepEqual(await recoverable(library), [], "saving removed the draft");
  const reopened = await openRecipe(h, s.recipeId);
  assert.equal(reopened.status, "opened");
  assert.equal(reopened.session.content.name, "Pale ale, more hops");
  assert.equal(reopened.session.state, "clean");
  assert.deepEqual(await reopened.session.save(), { status: "unchanged" });
});

test("typing in a field is written once, 750 ms after it stops, and undoes as one step", async () => {
  const library = fresh();
  const h = host(library);
  const s = newRecipe(h, "beer", "Pale ale");
  for (const name of ["S", "St", "Sto", "Stout"]) {
    s.edit(rename(name), { field: "name" });
    h.advance(200);
  }
  await settle();
  assert.deepEqual(await recoverable(library), [], "still typing: nothing written");
  assert.equal(s.saveStatus, "pending");
  h.advance(750);
  await settle();
  assert.equal(s.saveStatus, "saved");
  assert.equal((await recoverable(library))[0].name, "Stout");
  assert.ok(s.undo());
  assert.equal(s.content.name, "Pale ale", "one undo step for the whole field");
  assert.equal(s.canUndo, false);
});

test("a recipe with unsaved work opens with an offer, not the draft; resume restores content and undo", async () => {
  const library = fresh();
  const h = host(library);
  const s = newRecipe(h, "beer", "Pale ale");
  s.edit(rename("Saved name"));
  await s.save();
  s.edit(note(1));
  s.edit(note(2));
  await s.flush();
  // A new run: the earlier session is gone.
  const offer = await openRecipe(host(library), s.recipeId);
  assert.equal(offer.status, "draft-found");
  assert.deepEqual([offer.draft.name, offer.draft.applied, offer.draft.stale, offer.draft.unreadable], ["Saved name", 3, false, undefined]);
  const resumed = await offer.resume();
  assert.deepEqual(resumed.content.notes.map((n) => n.text), ["note 1", "note 2"]);
  assert.equal(resumed.state, "unsaved");
  assert.ok(resumed.undo());
  assert.ok(resumed.undo());
  assert.equal(resumed.state, "clean", "undo reaches the saved content");
  assert.ok(resumed.undo(), "and back before the save, since history survives saving");
  assert.equal(resumed.content.name, "Pale ale");
  assert.equal(resumed.state, "unsaved");
});

test("discarding the offered draft opens the saved recipe and removes the draft", async () => {
  const library = fresh();
  const h = host(library);
  const s = newRecipe(h, "beer", "Pale ale");
  s.edit(rename("Saved"));
  await s.save();
  s.edit(rename("Unsaved idea"));
  await s.flush();
  const offer = await openRecipe(h, s.recipeId);
  const opened = await offer.discard();
  assert.equal(opened.status, "opened");
  assert.equal(opened.session.content.name, "Saved");
  assert.deepEqual(await recoverable(library), []);
});

test("undo after a save makes new unsaved changes, saved as the next revision", async () => {
  const library = fresh();
  const h = host(library);
  const s = newRecipe(h, "beer", "One");
  s.edit(rename("Two"));
  const first = await s.save();
  s.edit(rename("Three"));
  await s.save();
  assert.ok(s.undo());
  assert.equal(s.state, "unsaved");
  const third = await s.save();
  const history = await library.revisions(s.recipeId);
  assert.deepEqual(history.map((r) => r.parents.length), [0, 1, 1]);
  assert.equal((await library.open(s.recipeId)).revision.content.name, "Two");
  assert.notEqual(third.head, first.head, "a new revision, not a rewind");
});

test("discard drops unsaved changes back to the base revision", async () => {
  const library = fresh();
  const h = host(library);
  const s = newRecipe(h, "beer", "Base");
  s.edit(rename("Base"));
  s.edit(rename("Saved"));
  await s.save();
  s.edit(rename("Oops"));
  await s.flush();
  await s.discard();
  assert.equal(s.content.name, "Saved");
  assert.equal(s.state, "clean");
  assert.equal(s.canUndo, false);
  assert.deepEqual(await recoverable(library), []);
});

test("edits while a save runs are refused, so the save can't drop them", async () => {
  const library = fresh();
  let release;
  const slow = { ...library, save: async (...a) => (await new Promise((r) => (release = r)), library.save(...a)) };
  const h = host(slow);
  const s = newRecipe(h, "beer", "Pale ale");
  s.edit(rename("First"));
  const saving = s.save();
  await settle();
  assert.equal(s.saving, true);
  assert.equal(s.edit(rename("During save")).status, "busy");
  assert.equal(s.undo(), false);
  release();
  await saving;
  assert.equal(s.content.name, "First");
  assert.equal(s.edit(rename("After save")).status, "applied");
});

test("a draft from an older revision is offered as stale; saving it is refused and the draft kept", async () => {
  const library = fresh();
  const h = host(library);
  const s = newRecipe(h, "beer", "Pale ale");
  s.edit(rename("v1"));
  const v1 = await s.save();
  s.edit(rename("my unsaved idea"));
  await s.flush();
  // Elsewhere (another window, or later a sync) the recipe is saved again.
  const content = { ...(await library.open(s.recipeId)).revision.content, name: "saved elsewhere" };
  await library.save(createRevision({ schema_version: "0.3", recipe_id: s.recipeId, revision_id: h.newId(), parents: [v1.head], created_at: "2026-11-24T13:00:00.000Z", origin: "user_edit" }, content));
  const offer = await openRecipe(host(library), s.recipeId);
  assert.deepEqual([offer.draft.stale, offer.draft.base_revision], [true, v1.head]);
  const resumed = await offer.resume();
  await assert.rejects(resumed.save(), (e) => e.code === "stale-head");
  assert.equal((await recoverable(library)).length, 1, "the unsaved work is still there");
  assert.equal((await library.open(s.recipeId)).revision.content.name, "saved elsewhere", "and nothing was overwritten");
});

test("a damaged draft is offered as unreadable: it can't be resumed but can be discarded", async () => {
  const store = memoryStore();
  const library = createLibrary(store);
  const h = host(library);
  const s = newRecipe(h, "beer", "Pale ale");
  s.edit(rename("Saved"));
  await s.save();
  s.edit(rename("Unsaved"));
  await s.flush();
  await store.transaction(async (tx) => {
    const { sequence, ...row } = await tx.getDraft(s.recipeId);
    await tx.putDraft({ ...row, history: JSON.stringify([[{ op: "set_note", note: "0192f3a0-0000-7000-8000-000000000999", text: "x" }]]) });
  });
  const offer = await openRecipe(h, s.recipeId);
  assert.equal(offer.status, "draft-found");
  assert.ok(offer.draft.unreadable, "the history no longer replays");
  await assert.rejects(offer.resume(), (e) => e.code === "unreadable-draft");
  const opened = await offer.discard();
  assert.equal(opened.session.content.name, "Saved");
});

test("a never-saved recipe with only a draft is offered too", async () => {
  const library = fresh();
  const h = host(library);
  const s = newRecipe(h, "cider", "Dry cider");
  s.edit(rename("Dry cider, wild"));
  await s.flush();
  const [summary] = await recoverable(library);
  assert.deepEqual([summary.recipe_id, summary.base_revision], [s.recipeId, null]);
  const offer = await openRecipe(host(library), s.recipeId);
  const resumed = await offer.resume();
  assert.equal(resumed.state, "unsaved");
  assert.equal((await resumed.save()).status, "saved");
  assert.deepEqual(await recoverable(library), []);
});

test("a failed draft write is visible, kept, and retried only on request", async () => {
  const library = fresh();
  let fail = true;
  const flaky = { ...library, saveDraft: async (...a) => { if (fail) throw new Error("disk full"); return library.saveDraft(...a); } };
  const s = newRecipe(host(flaky), "beer", "Pale ale");
  s.edit(rename("Precious"));
  assert.equal(await s.flush(), "failed");
  assert.equal(s.saveError.message, "disk full");
  fail = false;
  assert.equal(await s.flush(), "failed", "no silent retry");
  assert.equal(await s.retry(), "saved");
  assert.equal((await recoverable(library))[0].name, "Precious");
});

test("a rejected edit changes nothing and writes nothing", async () => {
  const library = fresh();
  const s = newRecipe(host(library), "beer", "Pale ale");
  const r = s.edit([{ op: "set_name", name: "" }]);
  assert.equal(r.status, "rejected");
  assert.ok(r.diagnostics.length > 0);
  assert.equal(s.state, "new");
  assert.equal(await s.flush(), "saved");
  assert.deepEqual(await recoverable(library), []);
});
