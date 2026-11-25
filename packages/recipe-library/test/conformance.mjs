// The repository contract, written once. Every store must pass this unchanged:
// that is what "the same contract" means here. makeStore() gives a new empty
// store; makeStore.faulty(op) gives one whose transaction fails at that step.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRevision, validateContent } from "@carboy/recipe-core";
import { writeNative } from "@carboy/recipe-format";
import { LibraryError, createLibrary } from "../dist/index.js";

export const U = (n) => `0192f3a0-0000-7000-8000-${String(n).padStart(12, "0")}`;
export const AT = "2026-11-06T00:00:00.000Z";
export const content = (name = "Pale ale", beverage = "beer") => ({
  name, beverage: { type: beverage }, targets: {}, ingredients: [], process: { stages: [], flows: [] }, additions: [], statistics: {}, calculation_settings: {}, notes: [],
});
export const rev = (recipe, id, parents, c = content(), origin = "user_edit") =>
  createRevision({ schema_version: "0.3", recipe_id: recipe, revision_id: id, parents, created_at: AT, origin }, c);

const code = async (promise) => {
  try {
    await promise;
  } catch (e) {
    assert.ok(e instanceof LibraryError, `expected a LibraryError, got ${e}`);
    return e.code;
  }
  return "no error";
};

export function conformance(name, makeStore) {
  const library = async () => createLibrary(await makeStore());
  const R1 = U(1), R2 = U(2);
  const A = U(10), B = U(11), C = U(12);

  test(`${name}: a new recipe saves and reopens with its identity, bytes, and numbers intact`, async () => {
    const lib = await library();
    const r = rev(R1, A, []);
    assert.deepEqual(await lib.save(r), { status: "saved", head: A });
    const opened = await lib.open(R1);
    assert.equal(opened.status, "editable");
    assert.equal(writeNative(opened.revision), writeNative(r));
    assert.equal(opened.revision.envelope.recipe_id, R1);
  });

  test(`${name}: a child revision moves the head and leaves its parent readable and unchanged`, async () => {
    const lib = await library();
    const first = rev(R1, A, []);
    await lib.save(first);
    await lib.save(rev(R1, B, [A], content("Pale ale, more hops")));
    assert.equal((await lib.open(R1)).revision.content.name, "Pale ale, more hops");
    assert.equal(writeNative((await lib.open(R1, A)).revision), writeNative(first));
    assert.deepEqual((await lib.revisions(R1)).map((v) => [v.revision_id, v.parents]), [[A, []], [B, [A]]]);
  });

  test(`${name}: saving the same revision twice is harmless`, async () => {
    const lib = await library();
    const r = rev(R1, A, []);
    await lib.save(r);
    assert.deepEqual(await lib.save(r), { status: "already-saved", head: A });
    assert.equal((await lib.revisions(R1)).length, 1);
  });

  test(`${name}: revisions are immutable: the same id with other content is refused`, async () => {
    const lib = await library();
    await lib.save(rev(R1, A, []));
    assert.equal(await code(lib.save(rev(R1, A, [], content("Changed")))), "revision-conflict");
    assert.equal((await lib.open(R1)).revision.content.name, "Pale ale");
  });

  test(`${name}: a revision id belongs to one recipe`, async () => {
    const lib = await library();
    await lib.save(rev(R1, A, []));
    assert.equal(await code(lib.save(rev(R2, A, []))), "revision-conflict");
    assert.equal(await code(lib.open(R2)), "not-found");
  });

  test(`${name}: explicit failures for a broken history`, async () => {
    const lib = await library();
    assert.equal(await code(lib.save(rev(R1, B, [A]))), "parent-not-found");
    await lib.save(rev(R1, A, []));
    assert.equal(await code(lib.save(rev(R1, B, []))), "recipe-exists");
    assert.equal(await code(lib.save(rev(R1, B, [C]))), "parent-not-found");
    await lib.save(rev(R2, C, []));
    assert.equal(await code(lib.save(rev(R1, B, [A, C]))), "parent-not-found"); // a parent from another recipe
  });

  test(`${name}: a stale edit is refused, not silently forked or overwritten`, async () => {
    const lib = await library();
    await lib.save(rev(R1, A, []));
    await lib.save(rev(R1, B, [A]));
    assert.equal(await code(lib.save(rev(R1, C, [A], content("From the old head")))), "stale-head");
    assert.equal((await lib.open(R1)).revision.envelope.revision_id, B);
    assert.equal((await lib.revisions(R1)).length, 2);
  });

  test(`${name}: nothing invalid gets in`, async () => {
    const lib = await library();
    const tampered = rev(R1, A, []);
    assert.equal(await code(lib.save({ ...tampered, content: content("Tampered") })), "invalid-revision");
    const bad = { ...content(), name: "x", surprise: 1 };
    assert.ok(validateContent(bad).length > 0);
    assert.equal(await code(lib.save(rev(R1, A, [], bad))), "invalid-revision");
    assert.deepEqual(await lib.list(), []);
  });

  test(`${name}: an unfinished recipe saves: incomplete isn't invalid`, async () => {
    const lib = await library();
    assert.equal((await lib.save(rev(R1, A, [], content("Just a name")))).status, "saved");
  });

  test(`${name}: list shows each recipe once, deterministically, without loading history`, async () => {
    const lib = await library();
    await lib.save(rev(R1, A, [], content("Zwickel")));
    await lib.save(rev(R1, B, [A], content("Zwickel, revised")));
    await lib.save(rev(R2, C, [], content("Amber", "mead")));
    assert.deepEqual((await lib.list()).map((s) => [s.name, s.beverage, s.head, s.revisions]), [
      ["Amber", "mead", C, 1],
      ["Zwickel, revised", "beer", B, 2],
    ]);
  });

  test(`${name}: a missing recipe or revision is an explicit failure`, async () => {
    const lib = await library();
    assert.equal(await code(lib.open(R1)), "not-found");
    assert.equal(await code(lib.revisions(R1)), "not-found");
    await lib.save(rev(R1, A, []));
    assert.equal(await code(lib.open(R1, B)), "not-found");
  });

  test(`${name}: deletion is recoverable: hidden, refused while deleted, and fully restored`, async () => {
    const lib = await library();
    const r = rev(R1, A, []);
    await lib.save(r);
    await lib.remove(R1, AT);
    assert.deepEqual(await lib.list(), []);
    assert.deepEqual((await lib.list({ deleted: "only" })).map((s) => [s.recipe_id, s.deleted_at]), [[R1, AT]]);
    assert.equal(await code(lib.open(R1)), "recipe-deleted");
    assert.equal(await code(lib.save(rev(R1, B, [A]))), "recipe-deleted");
    await lib.restore(R1);
    assert.equal(writeNative((await lib.open(R1)).revision), writeNative(r));
    assert.equal((await lib.list())[0].deleted_at, undefined);
  });

  test(`${name}: deletion errors are explicit`, async () => {
    const lib = await library();
    assert.equal(await code(lib.remove(R1, AT)), "not-found");
    assert.equal(await code(lib.restore(R1)), "not-found");
    assert.equal(await code(lib.purge(R1)), "not-found");
    await lib.save(rev(R1, A, []));
    assert.equal(await code(lib.restore(R1)), "not-deleted");
    await lib.remove(R1, AT);
    assert.equal(await code(lib.remove(R1, AT)), "recipe-deleted");
  });

  test(`${name}: permanent deletion is a separate step and needs a recoverable delete first`, async () => {
    const lib = await library();
    await lib.save(rev(R1, A, []));
    assert.equal(await code(lib.purge(R1)), "not-deleted");
    await lib.remove(R1, AT);
    await lib.purge(R1);
    assert.equal(await code(lib.open(R1)), "not-found");
    assert.deepEqual(await lib.list({ deleted: "include" }), []);
    assert.equal((await lib.save(rev(R1, A, []))).status, "saved"); // the id is free again
  });

  test(`${name}: a failed save leaves nothing behind`, async () => {
    const lib = createLibrary(await makeStore.faulty("putRecipe"));
    await assert.rejects(lib.save(rev(R1, A, [])), /injected/);
    assert.deepEqual(await lib.list(), []);
    assert.equal(await code(lib.open(R1)), "not-found");
  });

  test(`${name}: a failed child save leaves the head and history as they were`, async () => {
    const store = await makeStore.faulty("putRecipe", 1);
    const lib = createLibrary(store);
    await lib.save(rev(R1, A, []));
    await assert.rejects(lib.save(rev(R1, B, [A])), /injected/);
    assert.equal((await lib.open(R1)).revision.envelope.revision_id, A);
    assert.deepEqual((await lib.revisions(R1)).map((v) => v.revision_id), [A]);
    assert.equal(await code(lib.open(R1, B)), "not-found");
  });

  test(`${name}: concurrent saves can't both win: one is stale, and history stays linear`, async () => {
    const lib = await library();
    await lib.save(rev(R1, A, []));
    const results = await Promise.allSettled([lib.save(rev(R1, B, [A])), lib.save(rev(R1, C, [A], content("Other")))]);
    assert.deepEqual(results.map((r) => r.status).sort(), ["fulfilled", "rejected"]);
    assert.equal(results.find((r) => r.status === "rejected").reason.code, "stale-head");
    assert.equal((await lib.revisions(R1)).length, 2);
  });

  test(`${name}: a damaged stored document opens read-only or fails; it is never repaired`, async () => {
    const store = await makeStore();
    const lib = createLibrary(store);
    const r = rev(R1, A, []);
    await lib.save(r);
    // Damage goes in through the store's own interface, so any store can be tested.
    const damage = (document) =>
      store.transaction(async (tx) => {
        const recipe = await tx.getRecipe(R1);
        const row = await tx.getRevision(A);
        await tx.deleteRecipe(R1);
        await tx.insertRevision({ ...row, document });
        await tx.putRecipe(recipe);
      });
    await damage(writeNative(r).replace("Pale ale", "Pale lager"));
    const opened = await lib.open(R1);
    assert.deepEqual([opened.status, opened.reason], ["read-only", "hash-mismatch"]);
    await damage("not json");
    assert.equal(await code(lib.open(R1)), "unreadable-revision");
  });

  // Drafts (UD3): unsaved work, kept apart from revisions.
  const step = (name) => [{ op: "set_name", name }];
  const draftOf = (recipe, base, c = content("Pale ale, draft"), history = [step("Pale ale, draft")], applied = history.length) =>
    ({ recipe_id: recipe, base_revision: base, schema_version: "0.3", content: c, history_start: content(), history, applied, updated_at: AT });

  test(`${name}: a draft saves and reopens whole, with its undo history, and is not a revision`, async () => {
    const lib = await library();
    await lib.save(rev(R1, A, []));
    const history = [step("One"), step("Two"), step("Three")];
    const d = draftOf(R1, A, content("Two"), history, 2);
    const { sequence } = await lib.saveDraft(d, null);
    const opened = await lib.openDraft(R1);
    assert.deepEqual(opened, { ...d, sequence, head: A });
    assert.deepEqual((await lib.revisions(R1)).map((v) => v.revision_id), [A]);
    assert.equal((await lib.open(R1)).revision.content.name, "Pale ale");
    assert.equal(await lib.openDraft(R2), undefined);
  });

  test(`${name}: a recipe never saved can have a draft; a saved one's draft starts from its own revision`, async () => {
    const lib = await library();
    const { sequence } = await lib.saveDraft(draftOf(R2, null), null);
    assert.equal((await lib.openDraft(R2)).head, null);
    await lib.save(rev(R1, A, []));
    assert.equal(await code(lib.saveDraft(draftOf(R1, null), null)), "recipe-exists");
    assert.equal(await code(lib.saveDraft(draftOf(R1, B), null)), "not-found");
    await lib.save(rev(R2, C, []), { draft: sequence });
    assert.equal(await code(lib.saveDraft(draftOf(R1, C), null)), "not-found", "a revision of another recipe");
    assert.equal(await code(lib.saveDraft(draftOf(U(3), A), null)), "not-found", "no such recipe");
  });

  test(`${name}: each write names the draft it replaces, so a stale writer can't overwrite newer work`, async () => {
    const lib = await library();
    await lib.save(rev(R1, A, []));
    const first = await lib.saveDraft(draftOf(R1, A), null);
    assert.equal(await code(lib.saveDraft(draftOf(R1, A), null)), "stale-draft");
    const second = await lib.saveDraft(draftOf(R1, A, content("Newer")), first.sequence);
    assert.ok(second.sequence > first.sequence);
    assert.equal(await code(lib.saveDraft(draftOf(R1, A, content("Older")), first.sequence)), "stale-draft");
    assert.equal((await lib.openDraft(R1)).content.name, "Newer");
    const results = await Promise.allSettled([lib.saveDraft(draftOf(R1, A, content("X")), second.sequence), lib.saveDraft(draftOf(R1, A, content("Y")), second.sequence)]);
    assert.deepEqual(results.map((r) => r.status).sort(), ["fulfilled", "rejected"]);
    assert.equal(results.find((r) => r.status === "rejected").reason.code, "stale-draft");
  });

  test(`${name}: a discarded draft's sequence is never reused`, async () => {
    const lib = await library();
    await lib.save(rev(R1, A, []));
    const first = await lib.saveDraft(draftOf(R1, A), null);
    assert.equal(await code(lib.discardDraft(R1, first.sequence + 1)), "stale-draft");
    await lib.discardDraft(R1, first.sequence);
    assert.equal(await lib.openDraft(R1), undefined);
    assert.equal(await code(lib.discardDraft(R1, first.sequence)), "not-found");
    const again = await lib.saveDraft(draftOf(R1, A), null);
    assert.ok(again.sequence > first.sequence, "a writer still holding the old sequence is refused");
    assert.equal(await code(lib.discardDraft(R1, first.sequence)), "stale-draft");
  });

  test(`${name}: nothing invalid becomes a draft`, async () => {
    const lib = await library();
    await lib.save(rev(R1, A, []));
    const bad = [
      draftOf(R1, A, { ...content(), name: "" }),
      draftOf(R1, A, { ...content(), unknown_member: 1 }),
      { ...draftOf(R1, A), schema_version: "9.0" },
      { ...draftOf(R1, A), recipe_id: "not-a-uuid" },
      draftOf(R1, A, content(), [step("x")], 2),
      draftOf(R1, A, content(), [step("x")], -1),
      draftOf(R1, A, content(), ["not a command list"], 1),
      draftOf(R1, A, content(), [["not a command"]], 1),
      { ...draftOf(R1, A), updated_at: "" },
      { ...draftOf(R1, A), history_start: { ...content(), name: "" } },
    ];
    for (const d of bad) assert.equal(await code(lib.saveDraft(d, null)), "invalid-draft", JSON.stringify(d).slice(0, 120));
    assert.equal(await lib.openDraft(R1), undefined);
    await lib.saveDraft(draftOf(R1, A, content(), [], 0), null); // an empty history is fine
  });

  test(`${name}: saving with the draft removes it in the same transaction; a stale one stops the save`, async () => {
    const lib = await library();
    await lib.save(rev(R1, A, []));
    const { sequence } = await lib.saveDraft(draftOf(R1, A), null);
    assert.equal(await code(lib.save(rev(R1, B, [A]), { draft: sequence + 1 })), "stale-draft");
    assert.equal((await lib.list())[0].head, A, "the stale save changed nothing");
    assert.deepEqual(await lib.save(rev(R1, B, [A]), { draft: sequence }), { status: "saved", head: B });
    assert.equal(await lib.openDraft(R1), undefined);
    assert.deepEqual(await lib.save(rev(R1, B, [A]), { draft: sequence }), { status: "already-saved", head: B }, "a retried save is still harmless");
    const next = await lib.saveDraft(draftOf(R1, B), null);
    await lib.save(rev(R1, C, [B]));
    assert.equal((await lib.openDraft(R1)).sequence, next.sequence, "a save without the draft leaves it alone");
  });

  test(`${name}: a failed save keeps its draft`, async () => {
    const store = await makeStore.faulty("putRecipe", 1);
    const lib = createLibrary(store);
    await lib.save(rev(R1, A, []));
    const { sequence } = await lib.saveDraft(draftOf(R1, A), null);
    await assert.rejects(lib.save(rev(R1, B, [A]), { draft: sequence }));
    assert.equal((await lib.openDraft(R1)).sequence, sequence);
  });

  test(`${name}: a draft whose base is no longer the head says so`, async () => {
    const lib = await library();
    await lib.save(rev(R1, A, []));
    await lib.saveDraft(draftOf(R1, A), null);
    await lib.save(rev(R1, B, [A]));
    const opened = await lib.openDraft(R1);
    assert.deepEqual([opened.base_revision, opened.head], [A, B]);
  });

  test(`${name}: drafts lists unsaved work for recovery, without content, deterministically`, async () => {
    const lib = await library();
    await lib.save(rev(R1, A, []));
    const one = await lib.saveDraft(draftOf(R1, A, content("Zwickel"), [step("a"), step("b")], 1), null);
    const two = await lib.saveDraft(draftOf(R2, null, content("Amber")), null);
    assert.deepEqual(await lib.drafts(), [
      { recipe_id: R2, name: "Amber", base_revision: null, head: null, applied: 1, updated_at: AT, sequence: two.sequence },
      { recipe_id: R1, name: "Zwickel", base_revision: A, head: A, applied: 1, updated_at: AT, sequence: one.sequence },
    ]);
  });

  test(`${name}: a deleted recipe keeps its draft hidden; restore brings it back and purge removes it`, async () => {
    const lib = await library();
    await lib.save(rev(R1, A, []));
    const { sequence } = await lib.saveDraft(draftOf(R1, A), null);
    await lib.remove(R1, AT);
    assert.equal(await code(lib.openDraft(R1)), "recipe-deleted");
    assert.equal(await code(lib.saveDraft(draftOf(R1, A), sequence)), "recipe-deleted");
    assert.deepEqual(await lib.drafts(), []);
    await lib.restore(R1);
    assert.equal((await lib.openDraft(R1)).sequence, sequence);
    await lib.remove(R1, AT);
    await lib.purge(R1);
    assert.equal(await lib.openDraft(R1), undefined);
  });

  test(`${name}: a damaged stored draft fails to open; it is never repaired or dropped`, async () => {
    const store = await makeStore();
    const lib = createLibrary(store);
    await lib.save(rev(R1, A, []));
    await lib.saveDraft(draftOf(R1, A), null);
    const damage = (change) => store.transaction(async (tx) => {
      const { sequence, ...row } = await tx.getDraft(R1);
      await tx.putDraft({ ...row, ...change });
    });
    await damage({ content: "not json" });
    assert.equal(await code(lib.openDraft(R1)), "unreadable-draft");
    await damage({ content: JSON.stringify({ ...content(), name: "" }) });
    assert.equal(await code(lib.openDraft(R1)), "unreadable-draft");
    assert.equal((await lib.drafts()).length, 1, "still listed, for the person to decide");
  });
}
