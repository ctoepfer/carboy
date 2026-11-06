import { Decimal, INGREDIENT_TRAITS, QuantityError, convert, propertyRow, traitRow } from "@carboy/recipe-core";
import { isObject, type ItemRef, type Product, type StatedValue } from "./model.js";
import { linkRef, type CatalogSet, type Hit, type PathEntry } from "./set.js";

// A recipe's relation to the catalog. Everything here reads a recipe's
// ingredient and proposes; nothing writes one. Commands go through the editor
// like any other edit, so a catalog can change a recipe only by a reviewed
// edit (invariant 6; INGREDIENT_CATALOG §3).

type Obj = { readonly [key: string]: unknown };
type Quantity = { readonly value: string; readonly unit: string };

export type Specificity = "free-text" | "group" | "product" | "group-and-product";

export interface IngredientView {
  readonly specificity: Specificity;
  /** What the recipe needs: the group's path, root first. */
  readonly requirement?: readonly PathEntry[];
  readonly preferred?: Hit;
  readonly alternatives: readonly (Hit & { readonly note?: string })[];
  /** References no open catalog answers. The recipe's snapshot stands regardless. */
  readonly unresolved: readonly { readonly member: string; readonly ref: ItemRef }[];
}

const refAt = (v: unknown): ItemRef | undefined => (isObject(v) && typeof v["catalog"] === "string" && typeof v["item"] === "string" ? (v as unknown as ItemRef) : undefined);

export function describeIngredient(set: CatalogSet, ingredient: Obj): IngredientView {
  const unresolved: { member: string; ref: ItemRef }[] = [];
  const groupRef = refAt(ingredient["group_ref"]);
  const productRef = refAt(ingredient["catalog_ref"]);
  const requirement = groupRef ? set.groupPath(groupRef) : undefined;
  if (groupRef && requirement!.length === 0) unresolved.push({ member: "group_ref", ref: groupRef });
  const preferred = productRef ? set.get(productRef) : undefined;
  if (productRef && !preferred) unresolved.push({ member: "catalog_ref", ref: productRef });
  const alternatives: (Hit & { note?: string })[] = [];
  const listed = Array.isArray(ingredient["alternatives"]) ? (ingredient["alternatives"] as Obj[]) : [];
  for (const alt of listed) {
    const ref = refAt(alt["catalog_ref"]);
    const hit = ref ? set.get(ref) : undefined;
    if (hit) alternatives.push({ ...hit, ...(typeof alt["note"] === "string" ? { note: alt["note"] } : {}) });
    else if (ref) unresolved.push({ member: "alternatives", ref });
  }
  const specificity: Specificity = groupRef && productRef ? "group-and-product" : groupRef ? "group" : productRef ? "product" : "free-text";
  return { specificity, ...(requirement && requirement.length > 0 ? { requirement } : {}), ...(preferred ? { preferred } : {}), alternatives, unresolved };
}

/**
 * The commands that snapshot a product into a recipe: its stated values, as
 * they are, and references to what was chosen. What the product doesn't state
 * stays absent. Undefined if the reference names no product.
 */
export function snapshotCommands(set: CatalogSet, ref: ItemRef, options: { readonly id: string; readonly group_ref?: Required<ItemRef> }): Obj[] | undefined {
  const hit = set.get(ref);
  if (!hit || hit.type !== "product") return undefined;
  const p = hit.record as unknown as Product;
  const properties: { [name: string]: Quantity } = {};
  for (const [name, v] of Object.entries(p.properties ?? {})) properties[name] = { value: v.value, unit: v.unit };
  const commands: Obj[] = [{ op: "add_ingredient", id: options.id, kind: p.kind, name: `${p.maker} ${p.name}`, properties, catalog_ref: { catalog: hit.catalog, item: p.id, version: hit.version } }];
  if (options.group_ref) commands.push({ op: "set_ingredient_group_ref", ingredient: options.id, group_ref: options.group_ref });
  return commands;
}

export interface RefreshProposal {
  readonly status: "no-reference" | "unresolved" | "current" | "update-available";
  readonly changes: readonly { readonly property: string; readonly before?: Quantity; readonly after: Quantity }[];
  /** Snapshot values the catalog doesn't state. They stay; a catalog's silence is not a removal. */
  readonly kept: readonly string[];
  readonly commands: readonly Obj[];
}

const NOTHING = { changes: [], kept: [], commands: [] };

/** What an explicit refresh would change, as commands for review. Applies nothing. */
export function refreshCommands(set: CatalogSet, ingredient: Obj): RefreshProposal {
  const ref = refAt(ingredient["catalog_ref"]);
  if (!ref) return { status: "no-reference", ...NOTHING };
  const hit = set.get({ catalog: ref.catalog, item: ref.item });
  if (!hit || hit.type !== "product") return { status: "unresolved", ...NOTHING };
  if (hit.version === ref.version) return { status: "current", ...NOTHING };
  const stated = (hit.record as unknown as Product).properties ?? {};
  const snapshot = (isObject(ingredient["properties"]) ? ingredient["properties"] : {}) as { [name: string]: Quantity };
  const changes: { property: string; before?: Quantity; after: Quantity }[] = [];
  for (const property of Object.keys(stated).sort()) {
    const after = { value: stated[property]!.value, unit: stated[property]!.unit };
    const before = snapshot[property];
    if (before?.value !== after.value || before?.unit !== after.unit) changes.push({ property, ...(before ? { before } : {}), after });
  }
  const commands: Obj[] = [
    ...changes.map((c) => ({ op: "set_ingredient_property", ingredient: ingredient["id"], property: c.property, value: c.after })),
    { op: "set_ingredient_catalog_ref", ingredient: ingredient["id"], catalog_ref: { catalog: hit.catalog, item: ref.item, version: hit.version } },
  ];
  return { status: "update-available", changes, kept: Object.keys(snapshot).filter((k) => !(k in stated)).sort(), commands };
}

export type CheckResult = "met" | "unmet" | "unknown";
export type Outcome = "unresolved" | "blocked" | "fails-required" | "needs-review" | "meets-stated-requirements";

export interface CandidateWarning {
  readonly code: string;
  readonly trait?: string;
  readonly note?: string;
}

export interface CandidateReview {
  /** `meets-stated-requirements` is the most it ever says. It is not a claim the products are alike. */
  readonly outcome: Outcome;
  /** Absent when the recipe names no group. */
  readonly in_group?: boolean;
  readonly requirements: readonly { readonly attribute: string; readonly level: string; readonly result: CheckResult }[];
  readonly differences: readonly { readonly property: string; readonly recipe?: Quantity; readonly candidate?: StatedValue }[];
  readonly warnings: readonly CandidateWarning[];
}

/**
 * Review one product against a recipe's ingredient (§2.5, §4). A judgement
 * for this recipe, separate from whether two products are the same strain.
 * Unknown stays unknown: a value nobody stated never passes a check.
 */
export function evaluateCandidate(set: CatalogSet, ingredient: Obj, ref: ItemRef): CandidateReview {
  const hit = set.get(ref);
  if (!hit || hit.type !== "product") return { outcome: "unresolved", requirements: [], differences: [], warnings: [] };
  const product = hit.record as unknown as Product;
  const kind = String(ingredient["kind"]);
  const candidateKey = `${hit.catalog}|${product.id}`;
  const preferredRef = refAt(ingredient["catalog_ref"]);
  const groupRef = refAt(ingredient["group_ref"]);
  const warnings: CandidateWarning[] = [];

  const requirements = (Array.isArray(ingredient["requirements"]) ? (ingredient["requirements"] as Obj[]) : []).map((r) => ({
    attribute: String(r["attribute"]),
    level: String(r["level"]),
    result: traitRow(kind, String(r["attribute"])) ? checkTrait(product, r) : checkProperty(product, r),
  }));

  // Exclusions against the preferred product or the group it's asked for.
  const blockedTargets = new Set<string>();
  if (preferredRef) blockedTargets.add(`${preferredRef.catalog}|${preferredRef.item}`);
  if (groupRef) for (const g of set.groupPath(groupRef)) blockedTargets.add(`${g.ref.catalog}|${g.ref.item}`);
  let blocked = false;
  for (const v of set.relations()) {
    if (v.relation.type !== "not_substitutable_for") continue;
    const from = linkRef(v.relation.from, v.catalog);
    const to = linkRef(v.relation.to, v.catalog);
    if (`${from.catalog}|${from.item}` !== candidateKey || !blockedTargets.has(`${to.catalog}|${to.item}`)) continue;
    if (v.status === "supported") blocked = true;
    else if (v.status === "contested") warnings.push({ code: "contested-exclusion" });
    else if (v.status === "unreviewed") warnings.push({ code: "unreviewed-exclusion" });
  }

  const preferredHit = preferredRef ? set.get(preferredRef) : undefined;
  const preferred = preferredHit?.type === "product" ? (preferredHit.record as unknown as Product) : undefined;
  const isPreferred = preferredRef !== undefined && `${preferredRef.catalog}|${preferredRef.item}` === candidateKey;
  for (const { name, kinds } of INGREDIENT_TRAITS) {
    if (!kinds.includes(kind)) continue;
    const mine = product.traits?.[name];
    const theirs = preferred?.traits?.[name];
    if (mine === undefined) warnings.push({ code: "trait-unknown", trait: name });
    else if (!isPreferred && theirs !== undefined && theirs !== mine) warnings.push({ code: "trait-differs", trait: name });
  }
  if (preferredHit && !isPreferred && speciesDiffer(set, hit, preferredHit)) warnings.push({ code: "species-differs" });
  if (product.status === "discontinued") warnings.push({ code: "discontinued" });

  const differences = compareProperties(ingredient, product);
  const in_group = groupRef ? set.isInGroup(ref, groupRef) : undefined;
  const required = requirements.filter((r) => r.level === "required");
  const outcome: Outcome = blocked
    ? "blocked"
    : required.some((r) => r.result === "unmet")
      ? "fails-required"
      : required.some((r) => r.result === "unknown") || warnings.length > 0 || in_group === false
        ? "needs-review"
        : "meets-stated-requirements";
  return { outcome, ...(in_group !== undefined ? { in_group } : {}), requirements, differences, warnings };
}

function checkTrait(product: Product, r: Obj): CheckResult {
  const value = product.traits?.[String(r["attribute"])];
  return value === undefined ? "unknown" : value === r["equals"] ? "met" : "unmet";
}

function checkProperty(product: Product, r: Obj): CheckResult {
  const stated = product.properties?.[String(r["attribute"])];
  if (!stated) return "unknown";
  const within = [above(stated, r["min"] as Quantity | undefined), above(r["max"] as Quantity | undefined, stated)];
  return within.includes(false) ? "unmet" : within.includes(undefined) ? "unknown" : "met";
}

/** Is `a` at least `b`? True if either is absent; undefined if they can't be compared by a unit factor. */
function above(a: Quantity | undefined, b: Quantity | undefined): boolean | undefined {
  if (!a || !b) return true;
  try {
    return convert(a, b.unit).compare(Decimal.parse(b.value)) >= 0;
  } catch (e) {
    if (e instanceof QuantityError) return undefined;
    throw e;
  }
}

function compareProperties(ingredient: Obj, product: Product): CandidateReview["differences"] {
  const snapshot = (isObject(ingredient["properties"]) ? ingredient["properties"] : {}) as { [name: string]: Quantity };
  const stated = product.properties ?? {};
  const names = [...new Set([...Object.keys(snapshot), ...Object.keys(stated)])].filter((n) => propertyRow(product.kind, n)).sort();
  return names
    .filter((n) => snapshot[n]?.value !== stated[n]?.value || snapshot[n]?.unit !== stated[n]?.unit)
    .map((property) => ({ property, ...(snapshot[property] ? { recipe: snapshot[property] } : {}), ...(stated[property] ? { candidate: stated[property] } : {}) }));
}

/** Both species known and none shared. Taken from strains with supported claims, never from a product's name (§2.2). */
function speciesDiffer(set: CatalogSet, a: Hit, b: Hit): boolean {
  const mine = speciesOf(set, a);
  const theirs = speciesOf(set, b);
  return mine.size > 0 && theirs.size > 0 && ![...mine].some((s) => theirs.has(s));
}

function speciesOf(set: CatalogSet, product: Hit): Set<string> {
  const own = `${product.catalog}|${String(product.record["id"])}`;
  const claims = set.relations().filter((v) => v.status === "supported");
  const strains = new Set<string>();
  for (const v of claims) {
    if (v.relation.type !== "same_strain" && v.relation.type !== "blend_contains") continue;
    const from = linkRef(v.relation.from, v.catalog);
    const to = linkRef(v.relation.to, v.catalog);
    if (`${from.catalog}|${from.item}` === own && set.get(to)?.type === "strain") strains.add(`${to.catalog}|${to.item}`);
  }
  const species = new Set<string>();
  for (const v of claims) {
    if (v.relation.type !== "member_of") continue;
    const from = linkRef(v.relation.from, v.catalog);
    const to = linkRef(v.relation.to, v.catalog);
    if (strains.has(`${from.catalog}|${from.item}`)) species.add(`${to.catalog}|${to.item}`);
  }
  return species;
}
