// How a recipe uses the catalog: what it asks for, at any specificity; what a
// snapshot copies; why an update can't touch a saved recipe; and what a
// candidate product does and doesn't satisfy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateStatistics, canonicalize, createRevision, validateContent } from "@carboy/recipe-core";
import { applyCommands, emptyTemplate } from "@carboy/editor-commands";
import { readNative, writeNative } from "@carboy/recipe-format";
import { describeIngredient, evaluateCandidate, openCatalogs, refreshCommands, snapshotCommands, validateCatalog } from "../dist/index.js";
import { CAT, ID, U, curated, evidence, q } from "./helpers.mjs";

const refOf = (item, version = "1", catalog = CAT) => ({ catalog, item, version });
const editor = { channel: "editor" };
const apply = (base, cmds) => {
  const r = applyCommands(base, cmds, editor);
  assert.equal(r.status, "applied", JSON.stringify(r.diagnostics));
  return r;
};

// The owner's worked example, as a brewer's own catalog: no property values,
// and the project asserts nothing about these products.
const OWN = U(3);
const owned = {
  format: "ingredient-catalog", schema_version: "0.1", catalog: OWN, version: "1", class: "user", name: "My malts",
  groups: [
    { id: U(100), kind: "fermentable", level: "organizational", name: "Base malts" },
    { id: U(101), kind: "fermentable", level: "functional", name: "Pilsner base malt", parent: U(100) },
    { id: U(102), kind: "fermentable", level: "functional", name: "German Pilsner malt", parent: U(101) },
  ],
  products: [
    { id: U(103), kind: "fermentable", maker: "Weyermann", name: "Pilsner", primary_group: U(102), status: "active" },
    { id: U(104), kind: "fermentable", maker: "BESTMALZ", name: "Pilsner", primary_group: U(102), status: "active" },
  ],
};
const own = (item) => refOf(item, "1", OWN);
const ask = (fields) => ({ id: U(1), kind: "fermentable", name: "Pilsner malt", properties: {}, ...fields });

test("the worked example is a valid catalog", () => assert.deepEqual(validateCatalog(owned), []));

test("a recipe can ask at any specificity, and each level stays what it is", () => {
  const set = openCatalogs([owned]);
  assert.equal(describeIngredient(set, ask({})).specificity, "free-text");

  const broad = describeIngredient(set, ask({ group_ref: own(U(101)) }));
  assert.equal(broad.specificity, "group");
  assert.deepEqual(broad.requirement.map((g) => g.name), ["Base malts", "Pilsner base malt"]);
  assert.equal(broad.preferred, undefined);

  const narrow = describeIngredient(set, ask({ group_ref: own(U(102)) }));
  assert.deepEqual(narrow.requirement.map((g) => g.name), ["Base malts", "Pilsner base malt", "German Pilsner malt"]);

  const full = describeIngredient(set, ask({ group_ref: own(U(102)), catalog_ref: own(U(103)), alternatives: [{ catalog_ref: own(U(104)), note: "if the shop is out" }] }));
  assert.equal(full.specificity, "group-and-product");
  assert.equal(full.preferred.record.maker, "Weyermann");
  assert.deepEqual(full.alternatives.map((a) => [a.record.maker, a.note]), [["BESTMALZ", "if the shop is out"]]);

  assert.equal(describeIngredient(set, ask({ catalog_ref: own(U(103)) })).specificity, "product");
});

test("the worked example builds through commands, and each level survives save and reopen", () => {
  const set = openCatalogs([owned]);
  const r = apply(emptyTemplate("beer", "Helles"), [
    ...snapshotCommands(set, own(U(103)), { id: U(1), group_ref: own(U(102)) }),
    { op: "set_ingredient_alternatives", ingredient: U(1), alternatives: [{ catalog_ref: own(U(104)) }] },
  ]);
  const meta = { schema_version: "0.3", recipe_id: U(110), revision_id: U(111), parents: [], created_at: "2026-11-05T00:00:00.000Z", origin: "user_edit" };
  const back = readNative(writeNative(createRevision(meta, r.content)));
  assert.equal(back.status, "editable");
  const [ing] = back.revision.content.ingredients;
  assert.deepEqual(ing.group_ref, own(U(102)));
  assert.deepEqual(ing.catalog_ref, own(U(103)));
  assert.deepEqual(ing.alternatives[0].catalog_ref, own(U(104)));
  assert.equal(ing.name, "Weyermann Pilsner");
  assert.deepEqual(ing.properties, {}); // nothing known, nothing invented
});

test("a catalog that isn't open is reported as unresolved; the recipe's snapshot still stands", () => {
  const d = describeIngredient(openCatalogs([]), ask({ group_ref: own(U(102)), catalog_ref: own(U(103)) }));
  assert.deepEqual(d.unresolved.map((u) => u.member), ["group_ref", "catalog_ref"]);
  assert.equal(d.specificity, "group-and-product");
});

test("a snapshot copies the product's stated values, with no catalog source ids in the recipe", () => {
  const [add, group] = snapshotCommands(openCatalogs([curated()]), refOf(ID.makerA), { id: U(1), group_ref: refOf(ID.german) });
  assert.deepEqual(add, { op: "add_ingredient", id: U(1), kind: "fermentable", name: "Maker A Pilsner", properties: { color: q("3.5", "EBC") }, catalog_ref: refOf(ID.makerA) });
  assert.deepEqual(group, { op: "set_ingredient_group_ref", ingredient: U(1), group_ref: refOf(ID.german) });
  assert.equal(snapshotCommands(openCatalogs([curated()]), refOf(U(99)), { id: U(1) }), undefined);
});

const MALT = { id: U(1), kind: "fermentable", name: "Maker A Pilsner", properties: { color: q("3.5", "EBC"), extract_yield: q("0.8", "fraction"), moisture: q("0.04", "fraction") }, catalog_ref: refOf(ID.makerA) };
const saved = () => {
  const c = apply(emptyTemplate("beer", "Helles"), [
    { op: "set_target", name: "batch_volume", quantity: q("20", "L") },
    { op: "set_target", name: "efficiency", quantity: q("0.72", "fraction") },
    { op: "add_ingredient", ...MALT },
    { op: "add_stage", id: U(2), kind: "mash" },
    { op: "add_addition", id: U(3), ingredient: U(1), stage: U(2), amount: q("4", "kg"), timing: { basis: "at_start" } },
  ]).content;
  const meta = { schema_version: "0.3", recipe_id: U(110), revision_id: U(111), parents: [], created_at: "2026-11-05T00:00:00.000Z", origin: "user_edit" };
  return createRevision(meta, c);
};
const newer = () => {
  const d = curated();
  d.version = "2";
  d.products[0].properties.color = q("7", "EBC");
  d.products[0].properties.moisture = q("0.05", "fraction");
  return d;
};

test("a catalog update can't change a saved recipe: same bytes, same numbers, on reopen", () => {
  const rev = saved();
  const bytes = writeNative(rev);
  const before = calculateStatistics(rev.content);
  openCatalogs([curated(), newer()]); // the update arrives
  const back = readNative(bytes);
  assert.equal(back.status, "editable");
  assert.equal(writeNative(back.revision), bytes);
  assert.deepEqual(calculateStatistics(back.revision.content), before);
  assert.equal(back.revision.content.ingredients[0].properties.color.value, "3.5");
});

test("refresh is a proposal: it lists the changes as commands and applies nothing", () => {
  const rev = saved();
  const ingredient = rev.content.ingredients[0];
  const before = canonicalize(rev.content);
  const p = refreshCommands(openCatalogs([curated(), newer()]), ingredient);
  assert.equal(canonicalize(rev.content), before);
  assert.equal(p.status, "update-available");
  assert.deepEqual(p.changes.map((c) => [c.property, c.before?.value, c.after?.value]), [["color", "3.5", "7"], ["moisture", "0.04", "0.05"]]);
  assert.deepEqual(p.kept, ["extract_yield"]); // the snapshot's value stays when the catalog has none
  assert.deepEqual(p.commands.map((c) => c.op), ["set_ingredient_property", "set_ingredient_property", "set_ingredient_catalog_ref"]);

  const accepted = apply(rev.content, p.commands);
  assert.equal(accepted.content.ingredients[0].catalog_ref.version, "2");
  assert.equal(accepted.content.ingredients[0].properties.extract_yield.value, "0.8");
  assert.notDeepEqual(accepted.diff.statistics, []); // the review shows the recalculated numbers
});

test("refresh reports a current or unresolvable reference without proposing anything", () => {
  const ingredient = saved().content.ingredients[0];
  assert.deepEqual(refreshCommands(openCatalogs([curated()]), ingredient).status, "current");
  assert.deepEqual(refreshCommands(openCatalogs([]), ingredient).status, "unresolved");
  assert.deepEqual(refreshCommands(openCatalogs([]), { ...ingredient, catalog_ref: undefined }).status, "no-reference");
});

const needing = (requirements, extra = {}) => ({ id: U(1), kind: "fermentable", name: "Pilsner", properties: { color: q("3.5", "EBC") }, group_ref: refOf(ID.german), catalog_ref: refOf(ID.makerA), requirements, ...extra });
const MAX_COLOR = [{ attribute: "color", level: "required", max: q("4.5", "EBC") }];

test("a candidate that meets what's stated passes only that: no claim that it's the same", () => {
  const r = evaluateCandidate(openCatalogs([curated()]), needing(MAX_COLOR), refOf(ID.makerA));
  assert.equal(r.outcome, "meets-stated-requirements");
  assert.deepEqual(r.requirements.map((c) => [c.attribute, c.level, c.result]), [["color", "required", "met"]]);
  assert.equal("same" in r || "identical" in r, false);
});

test("a value exactly on a limit is within it, at either end", () => {
  const set = openCatalogs([curated()]);
  const at = (bound) => evaluateCandidate(set, needing([{ attribute: "color", level: "required", ...bound }]), refOf(ID.makerA)).requirements[0].result;
  assert.equal(at({ max: q("3.5", "EBC") }), "met");
  assert.equal(at({ min: q("3.5", "EBC") }), "met");
  assert.equal(at({ max: q("3.4", "EBC") }), "unmet");
  assert.equal(at({ min: q("3.6", "EBC") }), "unmet");
});

test("a required attribute fails a candidate; a preferred one only informs", () => {
  const set = openCatalogs([curated()]);
  assert.equal(evaluateCandidate(set, needing(MAX_COLOR), refOf(ID.makerB)).outcome, "fails-required");
  const soft = evaluateCandidate(set, needing([{ attribute: "color", level: "preferred", max: q("4.5", "EBC") }]), refOf(ID.makerB));
  assert.equal(soft.outcome, "meets-stated-requirements");
  assert.equal(soft.requirements[0].result, "unmet");
});

test("unknown stays unknown: a product with no stated value is never assumed to pass", () => {
  const r = evaluateCandidate(openCatalogs([curated()]), needing(MAX_COLOR), refOf(ID.makerC));
  assert.equal(r.requirements[0].result, "unknown");
  assert.equal(r.outcome, "needs-review");
});

test("the worked example: BESTMALZ, with no stated colour, needs review against a colour limit", () => {
  const r = evaluateCandidate(openCatalogs([owned]), needing(MAX_COLOR, { group_ref: own(U(102)), catalog_ref: own(U(103)) }), own(U(104)));
  assert.equal(r.outcome, "needs-review");
  assert.equal(r.in_group, true);
});

test("colour scales convert by formula, not by factor, so a mismatch is unknown rather than guessed", () => {
  const r = evaluateCandidate(openCatalogs([curated()]), needing([{ attribute: "color", level: "required", max: q("2", "degL") }]), refOf(ID.makerA));
  assert.equal(r.requirements[0].result, "unknown");
});

test("the difference between a candidate and the recipe's snapshot is shown", () => {
  const r = evaluateCandidate(openCatalogs([curated()]), needing(MAX_COLOR), refOf(ID.makerB));
  assert.deepEqual(r.differences.map((d) => [d.property, d.recipe.value, d.candidate.value]), [["color", "3.5", "6"]]);
});

const yeast = (extra = {}) => ({ id: U(1), kind: "culture", name: "Clean ale", properties: {}, catalog_ref: refOf(ID.yeastA), group_ref: refOf(ID.cleanAle), ...extra });

test("biological warnings stay visible: a change of diastatic status needs a look, even in the same group", () => {
  const r = evaluateCandidate(openCatalogs([curated()]), yeast(), refOf(ID.yeastB));
  assert.equal(r.in_group, true);
  assert.deepEqual(r.warnings.filter((w) => w.code === "trait-differs").map((w) => w.trait), ["diastatic"]);
  assert.equal(r.outcome, "needs-review");
});

test("an unknown trait is a warning, never a pass", () => {
  const r = evaluateCandidate(openCatalogs([curated()]), yeast(), refOf(ID.yeastC));
  assert.deepEqual(r.warnings.filter((w) => w.code === "trait-unknown").map((w) => w.trait).sort(), ["diastatic", "phenolic"]);
});

test("a required trait fails a candidate that has it", () => {
  const r = evaluateCandidate(openCatalogs([curated()]), yeast({ requirements: [{ attribute: "diastatic", level: "required", equals: false }] }), refOf(ID.yeastB));
  assert.equal(r.outcome, "fails-required");
});

const withRelations = (...relations) => {
  const d = curated();
  d.relations.push(...relations);
  return openCatalogs([d]);
};

test("a supported exclusion blocks; a contested one is surfaced for review", () => {
  const no = { id: ID.rel7, type: "not_substitutable_for", from: ID.yeastB, to: ID.yeastA, evidence: [evidence(ID.ev7, "trial")] };
  assert.equal(evaluateCandidate(withRelations(no), yeast(), refOf(ID.yeastB)).outcome, "blocked");
  const contested = { ...no, evidence: [...no.evidence, evidence(ID.ev8, "trial", { stance: "contradicts" })] };
  const r = evaluateCandidate(withRelations(contested), yeast(), refOf(ID.yeastB));
  assert.equal(r.outcome, "needs-review");
  assert.ok(r.warnings.some((w) => w.code === "contested-exclusion"));
});

test("an exclusion can name a whole group", () => {
  const no = { id: ID.rel7, type: "not_substitutable_for", from: ID.yeastC, to: ID.cleanAle, evidence: [evidence(ID.ev7, "trial")] };
  assert.equal(evaluateCandidate(withRelations(no), yeast(), refOf(ID.yeastC)).outcome, "blocked");
});

test("species comes from the strain, with evidence; a difference is a warning; a shared species admits nothing", () => {
  const member = (id, strain, taxon, ev) => ({ id, type: "member_of", from: strain, to: taxon, evidence: [evidence(ev, "genomic")] });
  const has = (id, product, strain, ev) => ({ id, type: "same_strain", from: product, to: strain, evidence: [evidence(ev, "genomic")] });
  const set = withRelations(member(ID.rel7, ID.strainA, ID.saccharomyces, ID.ev7), member(ID.rel8, ID.strainB, ID.brettanomyces, ID.ev8), has(ID.rel9, ID.yeastA, ID.strainA, ID.ev9), { ...has(U(59), ID.yeastB, ID.strainB, ID.ev10) });
  const r = evaluateCandidate(set, yeast(), refOf(ID.yeastB));
  assert.ok(r.warnings.some((w) => w.code === "species-differs"));
  const outside = evaluateCandidate(set, { ...yeast(), group_ref: refOf(ID.german) }, refOf(ID.yeastA));
  assert.equal(outside.in_group, false);
  assert.equal(outside.outcome, "needs-review");
});

test("a discontinued product still resolves for old recipes, and is flagged as a candidate", () => {
  const d = curated();
  d.version = "2";
  d.products[1].status = "discontinued";
  const set = openCatalogs([curated(), d]);
  assert.equal(set.get(refOf(ID.makerB, "1")).record.status, "active");
  const r = evaluateCandidate(set, needing([]), refOf(ID.makerB, "2"));
  assert.ok(r.warnings.some((w) => w.code === "discontinued"));
});

test("a product that can't be found is unresolved, not a failure of the product", () => {
  assert.equal(evaluateCandidate(openCatalogs([]), needing(MAX_COLOR), refOf(ID.makerA)).outcome, "unresolved");
});

test("validated content accepts everything the catalog produces", () => {
  assert.deepEqual(validateContent(saved().content), []);
});
