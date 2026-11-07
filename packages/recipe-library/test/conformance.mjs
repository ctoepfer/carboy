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
}
