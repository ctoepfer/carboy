// Autosave over a real library (memory store), with a fake clock and a
// library whose writes can be held open or made to fail.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AUTOSAVE_DEBOUNCE_MS, LibraryError, createAutosave, createLibrary, memoryStore } from "../dist/index.js";
import { AT, U, content, rev } from "./conformance.mjs";

const R = U(1), A = U(10), B = U(11);

function clock() {
  let now = 0;
  const timers = new Map();
  let id = 0;
  return {
    setTimer: (fn, ms) => (timers.set(++id, { fn, at: now + ms }), id),
    clearTimer: (h) => timers.delete(h),
    advance(ms) {
      now += ms;
      for (const [h, t] of [...timers]) if (t.at <= now) (timers.delete(h), t.fn());
    },
    get waiting() {
      return timers.size;
    },
  };
}

// Wraps a library: writes are counted, and can be held until released or made to fail.
function instrumented(lib) {
  const w = { writes: [], hold: false, fail: undefined, release: undefined, inFlight: 0, maxInFlight: 0 };
  w.lib = {
    ...lib,
    async saveDraft(draft, replaces) {
      w.inFlight++;
      w.maxInFlight = Math.max(w.maxInFlight, w.inFlight);
      try {
        if (w.hold) await new Promise((r) => (w.release = r));
        if (w.fail) throw w.fail;
        w.writes.push(draft.content.name);
        return await lib.saveDraft(draft, replaces);
      } finally {
        w.inFlight--;
      }
    },
  };
  return w;
}

const draft = (name) => ({ recipe_id: R, base_revision: A, schema_version: "0.3", content: content(name), history_start: content(), history: [], applied: 0, updated_at: AT });
const settle = () => new Promise((r) => setTimeout(r, 0));

async function setup() {
  const lib = createLibrary(memoryStore());
  await lib.save(rev(R, A, []));
  const w = instrumented(lib);
  const c = clock();
  const statuses = [];
  const auto = createAutosave(w.lib, { sequence: null, setTimer: c.setTimer, clearTimer: c.clearTimer, onStatus: (s) => statuses.push(s) });
  return { lib, w, c, auto, statuses };
}

test("the default debounce is 750 ms", () => assert.equal(AUTOSAVE_DEBOUNCE_MS, 750));

test("typing is written once, 750 ms after it stops", async () => {
  const { lib, w, c, auto, statuses } = await setup();
  for (const name of ["P", "Pa", "Pal", "Pale"]) {
    auto.changed(draft(name), "typing");
    c.advance(500);
  }
  assert.deepEqual(w.writes, [], "still typing: nothing written");
  assert.equal(auto.status, "pending");
  c.advance(250);
  await settle();
  assert.deepEqual(w.writes, ["Pale"]);
  assert.equal(auto.status, "saved");
  assert.deepEqual(statuses, ["pending", "saving", "saved"]);
  assert.equal((await lib.openDraft(R)).content.name, "Pale");
});

test("a discrete edit is written at once", async () => {
  const { w, c, auto } = await setup();
  auto.changed(draft("Added hops"), "discrete");
  await settle();
  assert.deepEqual(w.writes, ["Added hops"]);
  assert.equal(c.waiting, 0);
  assert.equal(auto.status, "saved");
});

test("flush writes pending typing now (blur, navigation, explicit save)", async () => {
  const { w, c, auto } = await setup();
  auto.changed(draft("Half typed"), "typing");
  assert.equal(await auto.flush(), "saved");
  assert.deepEqual(w.writes, ["Half typed"]);
  assert.equal(c.waiting, 0, "the debounce was cancelled");
  c.advance(1000);
  await settle();
  assert.deepEqual(w.writes, ["Half typed"], "and doesn't write again");
  assert.equal(await auto.flush(), "saved", "flushing with nothing pending is harmless");
});

test("writes never overlap; edits during a write are written after it, newest only", async () => {
  const { lib, w, auto } = await setup();
  w.hold = true;
  auto.changed(draft("one"), "discrete");
  await settle();
  assert.equal(auto.status, "saving");
  auto.changed(draft("two"), "discrete");
  auto.changed(draft("three"), "discrete");
  w.hold = false;
  w.release();
  assert.equal(await auto.flush(), "saved");
  assert.equal(w.maxInFlight, 1);
  assert.deepEqual(w.writes, ["one", "three"]);
  assert.equal((await lib.openDraft(R)).content.name, "three");
});

test("every write names the draft it replaces: a stale writer fails visibly and keeps its changes", async () => {
  const { lib, w, auto, statuses } = await setup();
  auto.changed(draft("mine"), "discrete");
  await auto.flush();
  // Another writer replaces the draft behind this one's back.
  await lib.saveDraft(draft("theirs"), auto.sequence);
  auto.changed(draft("mine again"), "discrete");
  assert.equal(await auto.flush(), "failed");
  assert.ok(auto.error instanceof LibraryError && auto.error.code === "stale-draft");
  assert.equal((await lib.openDraft(R)).content.name, "theirs", "nothing was overwritten");
  assert.equal(statuses.at(-1), "failed");
  assert.deepEqual(w.writes, ["mine", "mine again"], "tried once, not retried silently");
});

test("a failed write keeps the changes; flush doesn't retry it, retry and a new edit do", async () => {
  const { lib, w, auto } = await setup();
  w.fail = new Error("disk full");
  auto.changed(draft("precious"), "discrete");
  assert.equal(await auto.flush(), "failed");
  assert.equal(auto.error.message, "disk full");
  assert.equal(await lib.openDraft(R), undefined);
  w.fail = undefined;
  assert.equal(await auto.flush(), "failed", "a flush (blur, navigation) doesn't retry silently");
  await assert.rejects(auto.commit(rev(R, B, [A])), (e) => e.message === "disk full", "nor does an explicit save");
  assert.equal(await auto.retry(), "saved");
  assert.equal((await lib.openDraft(R)).content.name, "precious");
  w.fail = new Error("again");
  auto.changed(draft("more"), "discrete");
  assert.equal(await auto.flush(), "failed");
  w.fail = undefined;
  auto.changed(draft("more still"), "discrete");
  assert.equal(await auto.flush(), "saved", "a new edit tries again, with the newest work");
  assert.equal((await lib.openDraft(R)).content.name, "more still");
});

test("an explicit save flushes, then saves the revision and removes the draft together", async () => {
  const { lib, auto } = await setup();
  auto.changed(draft("Pale ale, more hops"), "typing");
  assert.deepEqual(await auto.commit(rev(R, B, [A], content("Pale ale, more hops"))), { status: "saved", head: B });
  assert.equal(await lib.openDraft(R), undefined);
  assert.equal(auto.sequence, null);
  assert.equal(auto.status, "saved");
  auto.changed({ ...draft("next"), base_revision: B }, "discrete");
  assert.equal(await auto.flush(), "saved", "a new draft starts after the save");
});

test("an explicit save that's refused keeps the draft and reports the failure", async () => {
  const { lib, auto } = await setup();
  auto.changed(draft("edit"), "discrete");
  await auto.flush();
  await assert.rejects(auto.commit(rev(R, B, [U(99)])), (e) => e.code === "parent-not-found");
  assert.equal(auto.status, "failed");
  assert.equal((await lib.openDraft(R)).content.name, "edit");
});
