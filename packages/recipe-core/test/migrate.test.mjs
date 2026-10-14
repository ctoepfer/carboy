// Migrations across schema MAJORs (RECIPE_SCHEMA §4): an older MAJOR is
// migrated forward through ordered steps into a NEW revision (origin
// "migration", parent = the original); the original stays unchanged.
// No migration exists yet (only MAJOR 0), so these tests use test-only
// steps toward hypothetical 1.0 and 2.0 schemas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MIGRATIONS, createRevision, migrateRevision, verifyRevision } from "../dist/index.js";

const U = (n) => `0192f3a0-0000-7000-8000-${String(n).padStart(12, "0")}`;
const clone = (x) => JSON.parse(JSON.stringify(x));
const content = { name: "Old", beverage: { type: "mead" }, targets: {}, ingredients: [], process: { stages: [], flows: [] }, additions: [], statistics: {}, calculation_settings: {}, notes: [{ id: U(9), text: "first" }] };
const original = createRevision({ schema_version: "0.1", recipe_id: U(1), revision_id: U(2), parents: [], created_at: "2026-10-14T09:00:00.000Z", origin: "user_edit" }, content);
const ids = { revision_id: U(3), created_at: "2026-10-14T10:00:00.000Z" };
// Test-only steps: 0.x → 1.0 renames a note member; 1.x → 2.0 adds an empty list.
const STEPS = [
  { fromMajor: 0, toVersion: "1.0", description: "notes: text → body", migrate: (c) => ({ ...c, notes: c.notes.map(({ text, ...n }) => ({ ...n, body: text })) }) },
  { fromMajor: 1, toVersion: "2.0", description: "adds tags", migrate: (c) => ({ ...c, tags: [] }) },
];

test("no production migrations yet: the schema has only MAJOR 0", () => {
  assert.deepEqual(MIGRATIONS, []);
  assert.equal(migrateRevision(original, ids).status, "not-needed");
});

test("migrates forward step by step into a new, verifiable revision; the original is untouched", () => {
  const before = clone(original);
  const r = migrateRevision(original, { ...ids, migrations: STEPS, target: { major: 2, minor: 0 }, validate: () => [] });
  assert.equal(r.status, "migrated");
  assert.deepEqual(r.steps, ["notes: text → body", "adds tags"]);
  const env = r.revision.envelope;
  assert.deepEqual([env.schema_version, env.recipe_id, env.revision_id, env.parents, env.origin], ["2.0", U(1), U(3), [U(2)], "migration"]);
  assert.deepEqual(r.revision.content.notes, [{ id: U(9), body: "first" }]);
  assert.deepEqual(r.revision.content.tags, []);
  assert.equal(verifyRevision(r.revision).status, "valid");
  assert.deepEqual(original, before);
});

test("refusals: tampered original, gaps in the path, newer MAJOR, failing or invalid steps", () => {
  const tampered = clone(original);
  tampered.content.name = "Changed";
  assert.equal(migrateRevision(tampered, { ...ids, migrations: STEPS, target: { major: 1, minor: 0 } }).status, "unverified-original");
  assert.equal(migrateRevision(original, { ...ids, migrations: [STEPS[1]], target: { major: 2, minor: 0 } }).status, "no-migration-path");
  assert.equal(migrateRevision(original, { ...ids, migrations: STEPS, target: { major: 0, minor: 2 } }).status, "not-needed");
  const newer = createRevision({ ...original.envelope, schema_version: "3.0", revision_id: U(4) }, content);
  assert.equal(migrateRevision(newer, { ...ids, migrations: STEPS, target: { major: 2, minor: 0 } }).status, "newer-major");
  const boom = [{ fromMajor: 0, toVersion: "1.0", description: "fails", migrate: () => { throw new Error("cannot map"); } }];
  const f = migrateRevision(original, { ...ids, migrations: boom, target: { major: 1, minor: 0 } });
  assert.deepEqual([f.status, f.step, f.message], ["migration-failed", "fails", "cannot map"]);
  const bad = migrateRevision(original, { ...ids, migrations: STEPS, target: { major: 1, minor: 0 }, validate: () => [{ code: "x", path: "/content", message: "no" }] });
  assert.deepEqual([bad.status, bad.issues.map((i) => i.code)], ["invalid-result", ["x"]]);
  // A step may not change identity: it receives a copy of content only.
  const sneaky = [{ fromMajor: 0, toVersion: "1.0", description: "mutates input", migrate: (c) => { c.name = "mutated"; return c; } }];
  migrateRevision(original, { ...ids, migrations: sneaky, target: { major: 1, minor: 0 }, validate: () => [] });
  assert.equal(original.content.name, "Old");
});
