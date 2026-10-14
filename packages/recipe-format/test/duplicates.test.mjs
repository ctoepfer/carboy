// Duplicate member names (I-JSON, RFC 7493 §2.3; required by RFC 8785):
// JSON.parse silently keeps the last one, so two readers could see two
// different recipes in one file. readNative rejects such files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRevision } from "@carboy/recipe-core";
import { duplicateMembers, readNative, writeNative } from "../dist/index.js";

const U = (n) => `0192f3a0-0000-7000-8000-${String(n).padStart(12, "0")}`;

test("finds duplicates at any depth, after escape processing, with JSON Pointers", () => {
  assert.deepEqual(duplicateMembers('{"a":1,"b":2}'), []);
  assert.deepEqual(duplicateMembers('{"a":1,"a":2}'), ["/a"]);
  assert.deepEqual(duplicateMembers('{"a":1,"\\u0061":2}'), ["/a"]); // same name once unescaped
  assert.deepEqual(duplicateMembers('{"x":[{"k":1},{"k":1,"k":2}]}'), ["/x/1/k"]);
  assert.deepEqual(duplicateMembers('{"o":{"a/b":1,"a/b":2,"t~":3,"t~":4}}'), ["/o/a~1b", "/o/t~0"]);
  // Same name in different objects is fine; strings containing quotes, braces, and colons don't confuse it.
  assert.deepEqual(duplicateMembers('{"a":{"a":"}\\"{:,"},"b":["a","a"],"c":{"a":1}}'), []);
  assert.deepEqual(duplicateMembers('[1, {"é":1, "é":2}]'), ["/1/é"]);
  // Different Unicode normalization forms are different names here (I-JSON compares code points).
  assert.deepEqual(duplicateMembers('{"é":1,"é":2}'), []);
});

test("readNative rejects a file with duplicate members, even if the hash matches what JSON.parse sees", () => {
  const content = { name: "Dup", beverage: { type: "mead" }, targets: {}, ingredients: [], process: { stages: [], flows: [] }, additions: [], statistics: {}, calculation_settings: {}, notes: [] };
  const rev = createRevision({ schema_version: "0.1", recipe_id: U(1), revision_id: U(2), parents: [], created_at: "2026-10-14T09:00:00.000Z", origin: "user_edit" }, content);
  const text = writeNative(rev);
  assert.equal(readNative(text).status, "editable");
  // Insert an earlier, different name: JSON.parse would keep the later (hashed) one.
  const tampered = text.replace('"name":"Dup"', '"name":"Something else","name":"Dup"');
  const r = readNative(tampered);
  assert.deepEqual([r.status, r.reason], ["rejected", "invalid"]);
  assert.deepEqual(r.issues.map((i) => [i.code, i.path]), [["duplicate-member", "/content/name"]]);
});
