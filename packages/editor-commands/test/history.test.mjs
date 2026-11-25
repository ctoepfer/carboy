// Undo history: limit, coalescing, redo, and replay of a stored history.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalize } from "@carboy/recipe-core";
import { COALESCE_MS, HistoryError, UNDO_LIMIT, applyCommands, createUndoHistory, emptyTemplate } from "../dist/index.js";

const U = (n) => `0192f3a0-0000-7000-8000-${String(n).padStart(12, "0")}`;
const start = () => emptyTemplate("beer", "Pale ale");
const fresh = (options) => createUndoHistory({ start: start(), entries: [], applied: 0 }, options);
const rename = (name) => [{ op: "set_name", name }];
const note = (n) => [{ op: "add_note", id: U(n), text: `note ${n}` }];
const same = (a, b) => assert.equal(canonicalize(a), canonicalize(b));

test("the owner's settings: 100 steps; typing coalesces within 750 ms", () => {
  assert.equal(UNDO_LIMIT, 100);
  assert.equal(COALESCE_MS, 750);
});

test("undo and redo step through edits, and redo is discarded by a new edit", () => {
  const h = fresh();
  h.edit(rename("One"));
  h.edit(rename("Two"));
  h.edit(rename("Three"));
  assert.ok(h.undo());
  assert.ok(h.undo());
  assert.equal(h.content.name, "One");
  assert.ok(h.redo());
  assert.equal(h.content.name, "Two");
  assert.ok(h.canRedo);
  h.edit(rename("Other"));
  assert.equal(h.canRedo, false, "the redo tail is gone");
  assert.deepEqual(h.state.entries, [rename("One"), rename("Two"), rename("Other")]);
  assert.ok(h.undo() && h.undo() && h.undo());
  assert.equal(h.content.name, "Pale ale");
  assert.equal(h.undo(), false);
});

test("a rejected edit changes nothing", () => {
  const h = fresh();
  h.edit(rename("One"));
  const r = h.edit([{ op: "set_name", name: "" }]);
  assert.equal(r.status, "rejected");
  assert.equal(h.content.name, "One");
  assert.equal(h.state.entries.length, 1);
});

test("typing in one field coalesces into one undo step, replacing the commands", () => {
  const h = fresh();
  let at = 1000;
  for (const name of ["P", "Pa", "Pal", "Pale lager"]) {
    h.edit(rename(name), { coalesce: "name", at });
    at += 200;
  }
  assert.deepEqual(h.state.entries, [rename("Pale lager")], "one step holding only the final value");
  assert.ok(h.undo());
  assert.equal(h.content.name, "Pale ale", "undo goes back to before the typing began");
});

test("coalescing stops after a pause, on another field, without a key, or after undo", () => {
  const h = fresh();
  h.edit(rename("A"), { coalesce: "name", at: 0 });
  h.edit(rename("AB"), { coalesce: "name", at: COALESCE_MS + 1 }); // pause
  h.edit(rename("ABC"), { coalesce: "style", at: COALESCE_MS + 2 }); // another field
  h.edit(rename("ABCD"), { at: COALESCE_MS + 3 }); // no key
  h.edit(rename("ABCDE"), { coalesce: "name", at: COALESCE_MS + 4 });
  h.undo();
  h.redo();
  h.edit(rename("ABCDEF"), { coalesce: "name", at: COALESCE_MS + 5 }); // after redo
  assert.equal(h.state.entries.length, 6);
});

test("coalesced edits that don't simply overwrite are appended, so the result is exact", () => {
  const h = fresh();
  h.edit(note(1), { coalesce: "notes", at: 0 });
  h.edit(note(2), { coalesce: "notes", at: 100 });
  assert.deepEqual(h.state.entries, [[...note(1), ...note(2)]]);
  assert.deepEqual(h.content.notes.map((n) => n.text), ["note 1", "note 2"]);
  h.undo();
  assert.deepEqual(h.content.notes, []);
});

test("at the limit the oldest step is folded into the start; the current recipe doesn't change", () => {
  const h = fresh({ limit: 100 });
  for (let i = 1; i <= 105; i++) h.edit(note(i));
  assert.equal(h.state.entries.length, 100);
  assert.equal(h.content.notes.length, 105, "all 105 edits are still in the recipe");
  assert.equal(h.state.start.notes.length, 5, "the 5 oldest became part of the start");
  let undos = 0;
  while (h.undo()) undos++;
  assert.equal(undos, 100);
  assert.equal(h.content.notes.length, 5, "undo reaches back 100 steps, no further");
  while (h.redo());
  assert.equal(h.content.notes.length, 105);
});

test("a stored history reopens to the same recipe; replay is checked against the draft", () => {
  const h = fresh({ limit: 3 });
  for (let i = 1; i <= 5; i++) h.edit(note(i));
  h.undo();
  const stored = JSON.parse(JSON.stringify(h.state));
  const reopened = createUndoHistory(stored, { limit: 3, expected: h.content });
  same(reopened.content, h.content);
  assert.ok(reopened.redo());
  assert.equal(reopened.content.notes.length, 5);
  assert.throws(() => createUndoHistory(stored, { limit: 3, expected: start() }), HistoryError);
  assert.throws(() => createUndoHistory({ ...stored, entries: [[{ op: "set_note", note: U(999), text: "x" }]], applied: 1 }), HistoryError);
});

test("a reopened history over the limit is trimmed without moving the current recipe", () => {
  const h = fresh();
  for (let i = 1; i <= 6; i++) h.edit(note(i));
  h.undo();
  h.undo(); // 4 in effect, 2 redo
  const trimmed = createUndoHistory(h.state, { limit: 3, expected: h.content });
  assert.equal(trimmed.content.notes.length, 4);
  assert.equal(trimmed.state.entries.length, 3);
  assert.equal(trimmed.state.applied, 1, "the oldest steps were folded first");
  while (trimmed.undo());
  assert.equal(trimmed.content.notes.length, 3);
  while (trimmed.redo());
  assert.equal(trimmed.content.notes.length, 6, "the redo steps survive");
  const behind = createUndoHistory({ start: start(), entries: [note(1), note(2), note(3), note(4)], applied: 0 }, { limit: 2 });
  assert.equal(behind.content.notes.length, 0, "with nothing in effect, only redo steps are dropped");
  assert.equal(behind.state.entries.length, 2);
});

test("every step is a command list that applyCommands accepts from the stored start", () => {
  const h = fresh({ limit: 4 });
  for (let i = 1; i <= 7; i++) h.edit(note(i));
  let c = h.state.start;
  for (const e of h.state.entries) {
    const r = applyCommands(c, e, { channel: "editor" });
    assert.equal(r.status, "applied");
    c = r.content;
  }
  same(c, h.content);
});
