// The catalog document: closed records, one tree per kind, taxonomy apart
// from functional groups, evidence on every claim, retailer data refused.
import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogHash, relationStatus, validateCatalog } from "../dist/index.js";
import { ID, U, curated, evidence, q } from "./helpers.mjs";

const codes = (doc) => validateCatalog(doc).map((i) => `${i.code} ${i.path}`);
const relation = (id, type, from, to, ev) => ({ id, type, from, to, evidence: ev });

test("a valid catalog has no issues, and its hash is stable", () => {
  assert.deepEqual(codes(curated()), []);
  assert.match(catalogHash(curated()), /^sha256:[0-9a-f]{64}$/);
  assert.equal(catalogHash(curated()), catalogHash(curated()));
});

const BAD = [
  ["wrong format", (d) => (d.format = "x"), "invalid-catalog /format"],
  ["newer schema", (d) => (d.schema_version = "9.0"), "unsupported-catalog-schema /schema_version"],
  ["bad catalog id", (d) => (d.catalog = "x"), "invalid-id /catalog"],
  ["bad version", (d) => (d.version = "1.0"), "invalid-catalog /version"],
  ["bad class", (d) => (d.class = "official"), "invalid-catalog /class"],
  ["unknown top member", (d) => (d.pricing = []), "unknown-member /pricing"],
  ["repeated id", (d) => (d.groups[1].id = ID.base), "duplicate-id /groups/1/id"],
  ["source without a status", (d) => delete d.sources[0].redistribution, "invalid-source /sources/0/redistribution"],

  ["group kind unknown", (d) => (d.groups[0].kind = "rock"), "invalid-group /groups/0/kind"],
  ["group level unknown", (d) => (d.groups[0].level = "taxonomy"), "invalid-group /groups/0/level"],
  ["parent missing", (d) => (d.groups[1].parent = U(99)), "unknown-reference /groups/1/parent"],
  ["parent of another kind", (d) => (d.groups[4].parent = ID.base), "group-kind-mismatch /groups/4/parent"],
  ["a loop of groups", (d) => (d.groups[0].parent = ID.german), "group-cycle /groups/0/parent"],
  ["organizational under functional", (d) => { d.groups.push({ id: U(26), kind: "fermentable", level: "organizational", name: "x", parent: ID.pilsner }); }, "group-level-order /groups/5/parent"],
  ["three functional levels", (d) => { d.groups.push({ id: U(26), kind: "fermentable", level: "functional", name: "x", parent: ID.german }); }, "functional-too-deep /groups/5/parent"],
  ["a taxon as a group parent", (d) => (d.groups[4].parent = ID.saccharomyces), "taxonomy-is-not-a-group /groups/4/parent"],

  ["product of unknown kind", (d) => (d.products[0].kind = "rock"), "invalid-product /products/0/kind"],
  ["product without a maker", (d) => delete d.products[0].maker, "invalid-product /products/0/maker"],
  ["no primary group", (d) => delete d.products[0].primary_group, "invalid-product /products/0/primary_group"],
  ["primary group of another kind", (d) => (d.products[0].primary_group = ID.cleanAle), "group-kind-mismatch /products/0/primary_group"],
  ["primary group organizational", (d) => (d.products[0].primary_group = ID.base), "primary-group-not-functional /products/0/primary_group"],
  ["a taxon as a primary group", (d) => (d.products[3].primary_group = ID.saccharomyces), "taxonomy-is-not-a-group /products/3/primary_group"],
  ["property outside the table", (d) => (d.products[0].properties.flavour = q("1", "%")), "unknown-property /products/0/properties/flavour"],
  ["property unit not allowed", (d) => (d.products[0].properties.color = q("3", "kg")), "property-unit-not-allowed /products/0/properties/color/unit"],
  ["property cites a missing source", (d) => (d.products[0].properties.color.source = U(99)), "unknown-reference /products/0/properties/color/source"],
  ["trait not for this kind", (d) => (d.products[0].traits = { diastatic: false }), "unknown-trait /products/0/traits/diastatic"],
  ["trait not a boolean", (d) => (d.products[3].traits.diastatic = "no"), "invalid-trait /products/3/traits/diastatic"],
  ["status unknown", (d) => (d.products[0].status = "gone"), "invalid-product /products/0/status"],
  ["repeated alias", (d) => (d.products[0].aliases = ["A Pils", "a  pils"]), "duplicate-alias /products/0/aliases/1"],

  ["a retailer SKU", (d) => d.products[0].identifiers.push({ scheme: "sku", value: "SHOP-1" }), "retailer-data-not-catalog /products/0/identifiers/1/scheme"],
  ["a price", (d) => (d.products[0].price = q("3", "kg")), "unknown-member /products/0/price"],
  ["stock on hand", (d) => (d.products[0].in_stock = true), "unknown-member /products/0/in_stock"],
  ["a batch's actual lot", (d) => (d.products[0].lot = "L1"), "unknown-member /products/0/lot"],
  ["an unknown identifier scheme", (d) => d.products[0].identifiers.push({ scheme: "other", value: "1" }), "invalid-identifier /products/0/identifiers/1/scheme"],

  ["taxon with no rank", (d) => delete d.taxa[0].rank, "invalid-taxon /taxa/0/rank"],
  ["strain with a bad taxon", (d) => (d.strains[0].unknown = 1), "unknown-member /strains/0/unknown"],

  ["unknown relation type", (d) => (d.relations[0].type = "same_as"), "invalid-relation /relations/0/type"],
  ["no evidence", (d) => (d.relations[0].evidence = []), "relation-without-evidence /relations/0/evidence"],
  ["unknown evidence kind", (d) => (d.relations[0].evidence[0].kind = "vibes"), "invalid-evidence /relations/0/evidence/0/kind"],
  ["unknown certainty", (d) => (d.relations[0].evidence[0].certainty = "sure"), "invalid-evidence /relations/0/evidence/0/certainty"],
  ["unknown stance", (d) => (d.relations[0].evidence[0].stance = "maybe"), "invalid-evidence /relations/0/evidence/0/stance"],
  ["evidence cites a missing source", (d) => (d.relations[0].evidence[0].source = U(99)), "unknown-reference /relations/0/evidence/0/source"],
  ["superseded by a missing entry", (d) => (d.relations[0].evidence[0].superseded_by = U(99)), "unknown-reference /relations/0/evidence/0/superseded_by"],
  ["endpoint of the wrong type", (d) => d.relations.push(relation(ID.rel7, "same_strain", ID.saccharomyces, ID.yeastA, [evidence(ID.ev7)])), "relation-endpoint /relations/6/from"],
  ["endpoint missing", (d) => d.relations.push(relation(ID.rel7, "functional_peer", U(99), ID.yeastA, [evidence(ID.ev7)])), "unknown-reference /relations/6/from"],
  ["not_substitutable_for from a group", (d) => d.relations.push(relation(ID.rel7, "not_substitutable_for", ID.cleanAle, ID.yeastA, [evidence(ID.ev7)])), "relation-endpoint /relations/6/from"],

  ["curated placement without evidence", (d) => d.relations.splice(0, 1), "placement-without-evidence /products/0/primary_group"],
  ["curated claim resting only on a compilation", (d) => d.relations.push(relation(ID.rel7, "functional_peer", ID.yeastA, ID.yeastB, [evidence(ID.ev7, "compiled", { source: ID.compilation })])), "compiled-only-evidence /relations/6/evidence"],
  ["identity without genomic or maker evidence", (d) => d.relations.push(relation(ID.rel7, "same_strain", ID.yeastA, ID.yeastB, [evidence(ID.ev7, "trial")])), "identity-evidence-insufficient /relations/6/evidence"],
];
for (const [name, mutate, expected] of BAD) {
  test(`refused: ${name}`, () => {
    const d = curated();
    mutate(d);
    assert.ok(codes(d).includes(expected), `expected ${expected}, got ${JSON.stringify(codes(d))}`);
  });
}

test("a user catalog may hold unreviewed claims, and they stay unreviewed", () => {
  const d = { ...curated(), class: "user", relations: [relation(ID.rel7, "same_strain", ID.yeastA, ID.yeastB, [evidence(ID.ev7, "compiled", { source: ID.compilation })])] };
  assert.deepEqual(codes(d), []);
  assert.equal(relationStatus(d.relations[0]), "unreviewed");
});

test("a relation's status comes from its evidence; superseded evidence is kept and doesn't count", () => {
  const r = (ev, type = "functional_peer") => ({ type, evidence: ev });
  const yes = evidence(ID.ev1, "trial");
  const no = evidence(ID.ev2, "trial", { stance: "contradicts" });
  assert.equal(relationStatus(r([yes])), "supported");
  assert.equal(relationStatus(r([yes, no])), "contested");
  assert.equal(relationStatus(r([no])), "refuted");
  assert.equal(relationStatus(r([evidence(ID.ev1, "community")])), "unreviewed");
  assert.equal(relationStatus(r([{ ...yes, superseded_by: ID.ev2 }, no])), "refuted");
  assert.equal(relationStatus(r([{ ...yes, superseded_by: ID.ev2 }])), "unreviewed");
  // Identity needs genomic or maker evidence, whatever else supports it.
  assert.equal(relationStatus(r([evidence(ID.ev1, "trial")], "same_strain")), "unreviewed");
  assert.equal(relationStatus(r([evidence(ID.ev1, "genomic")], "same_strain")), "supported");
});

test("status history records when and why, and must end at the current status", () => {
  const d = curated();
  d.relations.push({
    id: ID.rel7, type: "functional_peer", from: ID.yeastA, to: ID.yeastB,
    evidence: [evidence(ID.ev7, "trial"), evidence(ID.ev8, "trial", { stance: "contradicts" })],
    status_history: [{ date: "2026-01-01", status: "supported", note: "first trial" }, { date: "2026-06-01", status: "contested", evidence: [ID.ev8], note: "second trial disagreed" }],
  });
  assert.deepEqual(codes(d), []);
  d.relations[6].status_history.pop();
  assert.ok(codes(d).includes("status-history-stale /relations/6/status_history"));
  d.relations[6].status_history = [{ date: "not a date", status: "contested" }];
  assert.ok(codes(d).includes("invalid-status-history /relations/6/status_history/0/date"));
});

test("reference-only and unknown sources can be cited, but a curated claim needs something else behind it", () => {
  const d = curated();
  d.relations.push(relation(ID.rel7, "same_strain", ID.yeastA, ID.yeastB, [evidence(ID.ev7, "genomic", { source: ID.source }), evidence(ID.ev8, "compiled", { source: ID.compilation })]));
  assert.deepEqual(codes(d), []);
});
