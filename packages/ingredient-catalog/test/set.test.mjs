// Several catalogs open together: stable references, user entries beside the
// curated tree, import matching, identity claims, and catalog versions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareVersions, openCatalogs, relationsBetween, strainIdentity } from "../dist/index.js";
import { CAT, ID, U, curated, evidence, q } from "./helpers.mjs";

const USER = U(2);
const ref = (item, catalog = CAT) => ({ catalog, item });
const userCatalog = (extra = {}) => ({
  format: "ingredient-catalog", schema_version: "0.1", catalog: USER, version: "1", class: "user", name: "My entries",
  groups: [{ id: U(70), kind: "fermentable", level: "functional", name: "My house Pilsner malt", parent: { catalog: CAT, item: ID.pilsner } }],
  products: [{ id: U(71), kind: "fermentable", maker: "Local maltster", name: "Pale floor malt", primary_group: U(70), status: "active", properties: {} }],
  ...extra,
});

test("a stable reference resolves to its record, and says which catalog and version it came from", () => {
  const set = openCatalogs([curated()]);
  const hit = set.get({ catalog: CAT, item: ID.makerA, version: "1" });
  assert.equal(hit.type, "product");
  assert.equal(hit.record.maker, "Maker A");
  assert.deepEqual([hit.catalog, hit.version, hit.class], [CAT, "1", "curated"]);
  assert.equal(set.get({ catalog: CAT, item: U(99), version: "1" }), undefined);
  assert.equal(set.get({ catalog: U(99), item: ID.makerA, version: "1" }), undefined);
});

test("a reference finds the version it names; an older version stays readable after an update", () => {
  const next = curated();
  next.version = "2";
  next.products[0].properties.color = q("4", "EBC");
  const set = openCatalogs([curated(), next]);
  assert.equal(set.get({ catalog: CAT, item: ID.makerA, version: "1" }).record.properties.color.value, "3.5");
  assert.equal(set.get({ catalog: CAT, item: ID.makerA, version: "2" }).record.properties.color.value, "4");
  assert.equal(set.get({ catalog: CAT, item: ID.makerA }).version, "2");
  const gap = set.get({ catalog: CAT, item: ID.makerA, version: "7" });
  assert.deepEqual([gap.version, gap.version_differs], ["2", true]);
});

test("user-defined groups and products sit beside the curated tree without merging into it", () => {
  const set = openCatalogs([curated(), userCatalog()]);
  assert.deepEqual(set.validate(), []);
  const group = set.get(ref(U(70), USER));
  assert.equal(group.class, "user");
  assert.deepEqual(set.groupPath(ref(U(70), USER)).map((g) => [g.name, g.class]), [["Base malts", "curated"], ["Pilsner base malt", "curated"], ["My house Pilsner malt", "user"]]);
  assert.equal(curated().groups.some((g) => g.id === U(70)), false);
  assert.equal(set.get(ref(U(70), CAT)), undefined);
});

test("a reference to a catalog that isn't open is reported, not guessed", () => {
  assert.deepEqual(openCatalogs([userCatalog()]).validate().map((i) => i.code), ["unknown-reference"]);
});

test("user entries follow the same tree rules across catalogs", () => {
  const wrongKind = userCatalog();
  wrongKind.groups[0].parent = { catalog: CAT, item: ID.cleanAle };
  assert.ok(openCatalogs([curated(), wrongKind]).validate().some((i) => i.code === "group-kind-mismatch"));
  const tooDeep = userCatalog();
  tooDeep.groups[0].parent = { catalog: CAT, item: ID.german };
  assert.ok(openCatalogs([curated(), tooDeep]).validate().some((i) => i.code === "functional-too-deep"));
});

test("import matching proposes candidates and never chooses (rule 5)", () => {
  const set = openCatalogs([curated(), userCatalog()]);
  const names = (text) => set.importCandidates(text).map((c) => [c.product.maker, c.matched_on]);
  assert.deepEqual(names("A-100"), [["Maker A", "identifier"]]);
  assert.deepEqual(names("  a   PILS "), [["Maker A", "alias"]]);
  assert.deepEqual(names("Maker B Pilsner"), [["Maker B", "name"]]);
  assert.deepEqual(names("Pilsner").map((n) => n[0]), ["Maker A", "Maker B", "Maker C"]);
  assert.deepEqual(names("nothing like it"), []);
});

test("the same functional group says nothing about identity", () => {
  const set = openCatalogs([curated()]);
  assert.deepEqual([set.isInGroup(ref(ID.yeastA), ref(ID.cleanAle)), set.isInGroup(ref(ID.yeastB), ref(ID.cleanAle))], [true, true]);
  assert.equal(strainIdentity(set, ref(ID.yeastA), ref(ID.yeastB)).result, "unknown");
});

test("a product belongs to its group and that group's ancestors, and to nothing else", () => {
  const set = openCatalogs([curated()]);
  assert.equal(set.isInGroup(ref(ID.makerA), ref(ID.pilsner)), true);
  assert.equal(set.isInGroup(ref(ID.makerA), ref(ID.base)), true);
  assert.equal(set.isInGroup(ref(ID.makerA), ref(ID.cleanAle)), false);
});

const same = (id, from, to, ev, kind = "genomic") => ({ id, type: "same_strain", from, to, evidence: [evidence(ev, kind)] });

test("equivalence isn't transitive: A ≈ B and B ≈ C says nothing about A and C", () => {
  const d = curated();
  d.relations.push(same(ID.rel7, ID.yeastA, ID.yeastB, ID.ev7), same(ID.rel8, ID.yeastB, ID.yeastC, ID.ev8));
  const set = openCatalogs([d]);
  assert.equal(strainIdentity(set, ref(ID.yeastA), ref(ID.yeastB)).result, "same");
  assert.equal(strainIdentity(set, ref(ID.yeastB), ref(ID.yeastA)).result, "same");
  assert.equal(strainIdentity(set, ref(ID.yeastA), ref(ID.yeastC)).result, "unknown");
});

test("a negative claim is kept and is a hard boundary", () => {
  const d = curated();
  d.relations.push({ id: ID.rel7, type: "not_same_strain", from: ID.yeastA, to: ID.yeastB, evidence: [evidence(ID.ev7)] });
  assert.equal(strainIdentity(openCatalogs([d]), ref(ID.yeastA), ref(ID.yeastB)).result, "not_same");
  d.relations.push(same(ID.rel8, ID.yeastA, ID.yeastB, ID.ev8));
  const both = strainIdentity(openCatalogs([d]), ref(ID.yeastA), ref(ID.yeastB));
  assert.equal(both.result, "contested");
  assert.equal(both.relations.length, 2);
});

test("evidence on both sides is contested, shown as such", () => {
  const d = curated();
  d.relations.push({ id: ID.rel7, type: "same_strain", from: ID.yeastA, to: ID.yeastB, evidence: [evidence(ID.ev7, "genomic"), evidence(ID.ev8, "genomic", { stance: "contradicts" })] });
  assert.equal(strainIdentity(openCatalogs([d]), ref(ID.yeastA), ref(ID.yeastB)).result, "contested");
});

test("why are these related? every relation between two items, with its evidence and status", () => {
  const d = curated();
  d.relations.push({ id: ID.rel7, type: "functional_peer", from: ID.yeastA, to: ID.yeastB, evidence: [evidence(ID.ev7, "trial")] });
  const [r, ...rest] = relationsBetween(openCatalogs([d]), ref(ID.yeastB), ref(ID.yeastA));
  assert.deepEqual(rest, []);
  assert.deepEqual([r.relation.type, r.status, r.relation.evidence[0].kind, r.catalog], ["functional_peer", "supported", "trial", CAT]);
});

const update = (mutate) => {
  const next = curated();
  next.version = "2";
  mutate(next);
  return next;
};
const compare = (next) => compareVersions(curated(), next).map((i) => `${i.code} ${i.path}`);

test("a proper update has no issues: properties may change, a product may be discontinued", () => {
  assert.deepEqual(compare(update((d) => { d.products[0].properties.color = q("4", "EBC"); d.products[1].status = "discontinued"; })), []);
});

test("an update can't remove an item, change its kind, or delete evidence", () => {
  assert.ok(compare(update((d) => d.products.splice(2, 1))).includes(`item-removed ${ID.makerC}`));
  assert.ok(compare(update((d) => { d.relations.pop(); })).includes(`item-removed ${ID.rel6}`));
  assert.ok(compare(update((d) => { d.products[0].kind = "sugar"; })).includes(`kind-changed ${ID.makerA}`));
  assert.ok(compare(update((d) => { d.relations[0].evidence = [evidence(ID.ev9, "trial")]; })).includes(`evidence-removed ${ID.ev1}`));
});

test("versions only go up, and a version never changes its content", () => {
  assert.ok(compare(curated()).length === 0);
  assert.ok(compare(update((d) => { d.version = "0"; })).includes("version-not-increasing /version"));
  const changed = curated();
  changed.products[0].name = "Changed";
  assert.ok(compare(changed).includes("version-reused /version"));
  assert.ok(openCatalogs([curated(), changed]).validate().some((i) => i.code === "version-reused"));
  // The first document stands: a later one can't replace a version already open.
  assert.equal(openCatalogs([curated(), changed]).get({ catalog: CAT, item: ID.makerA, version: "1" }).record.name, "Pilsner");
  assert.deepEqual(compareVersions(curated(), { ...curated(), catalog: USER }).map((i) => i.code), ["catalog-id-changed"]);
});
