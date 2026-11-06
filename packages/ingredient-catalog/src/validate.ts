import { INGREDIENT_KINDS, canonicalSha256, isCalendarDate, isUuid, isVersionNumber, propertyRow, traitRow, validateQuantity, type Json } from "@carboy/recipe-core";
import { identityUnsupported, onlyWeakEvidence, relationStatus } from "./evidence.js";
import {
  CATALOG_CLASSES,
  CATALOG_FORMAT,
  CATALOG_SCHEMA_VERSION,
  CERTAINTIES,
  EVIDENCE_KINDS,
  GROUP_LEVELS,
  IDENTIFIER_SCHEMES,
  PRODUCT_STATUSES,
  REDISTRIBUTION,
  RELATION_STATUSES,
  RELATION_TYPES,
  RETAILER_SCHEMES,
  STANCES,
  isObject,
  normalizeName,
  type Catalog,
  type CatalogIssue,
  type Relation,
  type RecordType,
} from "./model.js";

// Validation reports; it never repairs. Called with `lookup`, it also follows
// links into other catalogs (CatalogSet.validate); without one, those links
// are left for that later check.

export interface Found {
  readonly type: RecordType;
  readonly record: { readonly [key: string]: unknown };
  readonly catalog: string;
}
export type Lookup = (ref: { catalog: string; item: string }) => Found | undefined;

type Rec = { [key: string]: unknown };

const MEMBERS = {
  catalog: ["format", "schema_version", "catalog", "version", "class", "name", "sources", "groups", "products", "taxa", "strains", "relations"],
  source: ["id", "title", "redistribution", "licence", "date", "url"],
  group: ["id", "kind", "level", "name", "parent", "description", "aliases"],
  product: ["id", "kind", "maker", "name", "aliases", "identifiers", "primary_group", "properties", "traits", "status"],
  identifier: ["scheme", "value"],
  stated: ["value", "unit", "source"],
  taxon: ["id", "rank", "name", "synonyms"],
  strain: ["id", "name"],
  relation: ["id", "type", "from", "to", "evidence", "status_history"],
  evidence: ["id", "source", "kind", "certainty", "stance", "observed", "locator", "note", "superseded_by"],
  history: ["date", "status", "evidence", "note"],
} as const;

export function catalogHash(doc: Catalog): string {
  return canonicalSha256(doc as unknown as Json);
}

export function validateCatalog(doc: unknown, lookup?: Lookup): CatalogIssue[] {
  if (!isObject(doc)) return [{ code: "invalid-catalog", path: "", message: "a catalog is an object" }];
  const out: CatalogIssue[] = [];
  const add = (code: string, path: string, message: string) => out.push({ code, path, message });
  const closed = (o: Rec, members: readonly string[], path: string) => {
    for (const k of Object.keys(o)) if (!members.includes(k)) add("unknown-member", `${path}/${k}`, `${k} is not a member here`);
  };
  const text = (o: Rec, key: string, path: string, code: string) => {
    if (typeof o[key] !== "string" || o[key].trim() === "") add(code, `${path}/${key}`, `${key} must be a non-empty string`);
  };
  const oneOf = (o: Rec, key: string, allowed: readonly string[], path: string, code: string) => {
    if (!allowed.includes(o[key] as string)) add(code, `${path}/${key}`, `${key} must be one of ${allowed.join(", ")}`);
  };

  closed(doc, MEMBERS.catalog, "");
  if (doc["format"] !== CATALOG_FORMAT) add("invalid-catalog", "/format", `format must be "${CATALOG_FORMAT}"`);
  if (doc["schema_version"] !== CATALOG_SCHEMA_VERSION) add("unsupported-catalog-schema", "/schema_version", `this build reads catalog schema ${CATALOG_SCHEMA_VERSION}`);
  if (!isUuid(doc["catalog"])) add("invalid-id", "/catalog", "catalog must be a lowercase RFC 9562 UUID");
  if (!isVersionNumber(doc["version"])) add("invalid-catalog", "/version", "version must be a positive integer string");
  oneOf(doc, "class", CATALOG_CLASSES, "", "invalid-catalog");
  text(doc, "name", "", "invalid-catalog");
  const curated = doc["class"] === "curated";

  const list = (key: string): Rec[] => {
    const v = doc[key];
    if (v === undefined) return [];
    if (!Array.isArray(v)) {
      add("invalid-catalog", `/${key}`, `${key} must be an array`);
      return [];
    }
    return v.filter((e, i) => isObject(e) || (add("invalid-catalog", `/${key}/${i}`, "must be an object"), false)) as Rec[];
  };
  const sources = list("sources");
  const groups = list("groups");
  const products = list("products");
  const taxa = list("taxa");
  const strains = list("strains");
  const relations = list("relations");

  // Every record's id is unique and permanent; a local index types the links.
  const local = new Map<string, Found>();
  const seen = new Map<string, string>();
  const register = (key: string, items: Rec[], type: RecordType | undefined) => {
    items.forEach((r, i) => {
      const at = `/${key}/${i}/id`;
      if (!isUuid(r["id"])) return add("invalid-id", at, "id must be a lowercase RFC 9562 UUID");
      const id = r["id"] as string;
      const prior = seen.get(id);
      if (prior) add("duplicate-id", at, `id already used at ${prior}`);
      else seen.set(id, at);
      if (type && !local.has(id)) local.set(id, { type, record: r, catalog: String(doc["catalog"]) });
    });
  };
  register("sources", sources, undefined);
  register("groups", groups, "group");
  register("products", products, "product");
  register("taxa", taxa, "taxon");
  register("strains", strains, "strain");
  register("relations", relations, undefined);
  const sourceIds = new Set(sources.map((s) => s["id"]));

  /** Follow a link. "elsewhere" means it needs another catalog and no lookup was given. */
  const resolve = (link: unknown, inCatalog: string = String(doc["catalog"])): Found | "elsewhere" | undefined => {
    const target = isObject(link) ? { catalog: link["catalog"], item: link["item"] } : { catalog: inCatalog, item: link };
    if (typeof target.catalog !== "string" || typeof target.item !== "string") return undefined;
    if (target.catalog === doc["catalog"]) return local.get(target.item);
    return lookup ? lookup(target as { catalog: string; item: string }) : "elsewhere";
  };

  sources.forEach((s, i) => {
    const p = `/sources/${i}`;
    closed(s, MEMBERS.source, p);
    text(s, "title", p, "invalid-source");
    oneOf(s, "redistribution", REDISTRIBUTION, p, "invalid-source");
  });

  groups.forEach((g, i) => {
    const p = `/groups/${i}`;
    closed(g, MEMBERS.group, p);
    oneOf(g, "kind", INGREDIENT_KINDS, p, "invalid-group");
    oneOf(g, "level", GROUP_LEVELS, p, "invalid-group");
    text(g, "name", p, "invalid-group");
    checkAliases(g["aliases"], `${p}/aliases`, add);
    if (g["parent"] === undefined) return;
    const parent = resolve(g["parent"]);
    if (parent === "elsewhere") return;
    if (!parent) return add("unknown-reference", `${p}/parent`, "parent names no group");
    if (parent.type === "taxon" || parent.type === "strain") return add("taxonomy-is-not-a-group", `${p}/parent`, "scientific classification is separate from groups");
    if (parent.type !== "group") return add("unknown-reference", `${p}/parent`, "parent names no group");
    if (parent.record["kind"] !== g["kind"]) add("group-kind-mismatch", `${p}/parent`, "a group's parent has the same kind");
    if (g["level"] === "organizational" && parent.record["level"] === "functional") add("group-level-order", `${p}/parent`, "organizational levels sit above functional ones");
    if (g["level"] === "functional" && parent.record["level"] === "functional") {
      const grand = parent.record["parent"] === undefined ? undefined : resolve(parent.record["parent"], parent.catalog);
      if (grand && grand !== "elsewhere" && grand.record["level"] === "functional") add("functional-too-deep", `${p}/parent`, "functional groups have at most two levels (§2.1)");
    }
    if (reachesItself(g, resolve)) add("group-cycle", `${p}/parent`, "this group is its own ancestor");
  });

  products.forEach((pr, i) => {
    const p = `/products/${i}`;
    closed(pr, MEMBERS.product, p);
    oneOf(pr, "kind", INGREDIENT_KINDS, p, "invalid-product");
    oneOf(pr, "status", PRODUCT_STATUSES, p, "invalid-product");
    text(pr, "maker", p, "invalid-product");
    text(pr, "name", p, "invalid-product");
    checkAliases(pr["aliases"], `${p}/aliases`, add);
    checkIdentifiers(pr["identifiers"], `${p}/identifiers`, add, closed);
    checkProperties(pr, p, sourceIds, add, closed);
    checkTraits(pr, p, add);
    if (pr["primary_group"] === undefined) return add("invalid-product", `${p}/primary_group`, "a product has exactly one primary group");
    const group = resolve(pr["primary_group"]);
    if (group === "elsewhere") return;
    if (!group) return add("unknown-reference", `${p}/primary_group`, "primary_group names no group");
    if (group.type === "taxon" || group.type === "strain") return add("taxonomy-is-not-a-group", `${p}/primary_group`, "scientific classification is separate from groups");
    if (group.type !== "group") return add("unknown-reference", `${p}/primary_group`, "primary_group names no group");
    if (group.record["kind"] !== pr["kind"]) add("group-kind-mismatch", `${p}/primary_group`, "a product's group has the same kind");
    if (group.record["level"] !== "functional") add("primary-group-not-functional", `${p}/primary_group`, "a product's primary group is functional (§2.1)");
    if (curated && !hasPlacement(pr, relations)) add("placement-without-evidence", `${p}/primary_group`, "a curated placement cites evidence (rule 3)");
  });

  taxa.forEach((t, i) => {
    const p = `/taxa/${i}`;
    closed(t, MEMBERS.taxon, p);
    text(t, "rank", p, "invalid-taxon");
    text(t, "name", p, "invalid-taxon");
  });
  strains.forEach((s, i) => {
    const p = `/strains/${i}`;
    closed(s, MEMBERS.strain, p);
    text(s, "name", p, "invalid-strain");
  });

  relations.forEach((r, i) => {
    const p = `/relations/${i}`;
    closed(r, MEMBERS.relation, p);
    const shape = typeof r["type"] === "string" ? RELATION_TYPES[r["type"]] : undefined;
    if (!shape) add("invalid-relation", `${p}/type`, `type must be one of ${Object.keys(RELATION_TYPES).join(", ")}`);
    for (const end of ["from", "to"] as const) {
      const hit = resolve(r[end]);
      if (hit === "elsewhere") continue;
      if (!hit) add("unknown-reference", `${p}/${end}`, `${end} names no record`);
      else if (shape && !shape[end].includes(hit.type)) add("relation-endpoint", `${p}/${end}`, `a ${String(r["type"])} relation runs ${shape.from.join(" or ")} → ${shape.to.join(" or ")}`);
    }
    const evidence = r["evidence"];
    if (!Array.isArray(evidence) || evidence.length === 0) return add("relation-without-evidence", `${p}/evidence`, "every relation has evidence (rule 3)");
    const entries = evidence.filter(isObject) as Rec[];
    if (entries.length !== evidence.length) return add("invalid-evidence", `${p}/evidence`, "evidence entries are objects");
    const ids = new Set(entries.map((e) => e["id"]));
    entries.forEach((e, j) => {
      const ep = `${p}/evidence/${j}`;
      closed(e, MEMBERS.evidence, ep);
      if (!isUuid(e["id"])) add("invalid-id", `${ep}/id`, "id must be a lowercase RFC 9562 UUID");
      oneOf(e, "kind", EVIDENCE_KINDS, ep, "invalid-evidence");
      oneOf(e, "certainty", CERTAINTIES, ep, "invalid-evidence");
      oneOf(e, "stance", STANCES, ep, "invalid-evidence");
      if (!sourceIds.has(e["source"])) add("unknown-reference", `${ep}/source`, "source names no source record");
      if (e["superseded_by"] !== undefined && !ids.has(e["superseded_by"])) add("unknown-reference", `${ep}/superseded_by`, "superseded_by names no entry of this relation");
    });
    const relation = r as unknown as Relation;
    if (curated && onlyWeakEvidence(relation)) add("compiled-only-evidence", `${p}/evidence`, "a compilation is never a curated claim's only evidence (§2.6)");
    if (curated && identityUnsupported(relation)) add("identity-evidence-insufficient", `${p}/evidence`, "strain identity needs genomic evidence or a maker's statement (D-030)");
    checkHistory(r, p, add, closed, relationStatus(relation));
  });
  return out;
}

function reachesItself(g: Rec, resolve: (link: unknown, inCatalog?: string) => Found | "elsewhere" | undefined): boolean {
  const visited = new Set<unknown>();
  let at: Rec | undefined = g;
  let catalog: string | undefined;
  while (at && at["parent"] !== undefined) {
    const next = resolve(at["parent"], catalog);
    if (!next || next === "elsewhere") return false;
    if (next.record === g) return true;
    if (visited.has(next.record)) return false;
    visited.add(next.record);
    at = next.record as Rec;
    catalog = next.catalog;
  }
  return false;
}

function hasPlacement(product: Rec, relations: Rec[]): boolean {
  return relations.some((r) => r["type"] === "in_group" && r["from"] === product["id"] && JSON.stringify(r["to"]) === JSON.stringify(product["primary_group"]) && Array.isArray(r["evidence"]) && r["evidence"].length > 0);
}

type Add = (code: string, path: string, message: string) => void;
type Closed = (o: Rec, members: readonly string[], path: string) => void;

function checkAliases(v: unknown, path: string, add: Add): void {
  if (v === undefined) return;
  if (!Array.isArray(v)) return add("invalid-alias", path, "aliases must be an array of strings");
  const seen = new Set<string>();
  v.forEach((a, i) => {
    if (typeof a !== "string" || a.trim() === "") return add("invalid-alias", `${path}/${i}`, "an alias is a non-empty string");
    const key = normalizeName(a);
    if (seen.has(key)) add("duplicate-alias", `${path}/${i}`, "this alias is already listed");
    seen.add(key);
  });
}

function checkIdentifiers(v: unknown, path: string, add: Add, closed: Closed): void {
  if (v === undefined) return;
  if (!Array.isArray(v)) return add("invalid-identifier", path, "identifiers must be an array");
  v.forEach((id, i) => {
    const p = `${path}/${i}`;
    if (!isObject(id)) return add("invalid-identifier", p, "an identifier is { scheme, value }");
    closed(id, MEMBERS.identifier, p);
    if ((RETAILER_SCHEMES as readonly unknown[]).includes(id["scheme"])) return add("retailer-data-not-catalog", `${p}/scheme`, "retailer identifiers belong to the Shop Bridge, not the catalog");
    if (!(IDENTIFIER_SCHEMES as readonly unknown[]).includes(id["scheme"])) add("invalid-identifier", `${p}/scheme`, `scheme must be one of ${IDENTIFIER_SCHEMES.join(", ")}`);
    if (typeof id["value"] !== "string" || id["value"] === "") add("invalid-identifier", `${p}/value`, "value must be a non-empty string");
  });
}

function checkProperties(pr: Rec, p: string, sourceIds: Set<unknown>, add: Add, closed: Closed): void {
  const props = pr["properties"];
  if (props === undefined) return;
  if (!isObject(props)) return add("invalid-product", `${p}/properties`, "properties must be an object");
  for (const [name, v] of Object.entries(props)) {
    const pp = `${p}/properties/${name}`;
    const row = propertyRow(String(pr["kind"]), name);
    if (!row) {
      add("unknown-property", pp, `${name} is not in the property table for ${String(pr["kind"])}`);
      continue;
    }
    if (!isObject(v) || typeof v["value"] !== "string" || typeof v["unit"] !== "string") {
      add("invalid-quantity", pp, "a stated value is { value, unit, source? }");
      continue;
    }
    closed(v, MEMBERS.stated, pp);
    for (const i of validateQuantity({ value: v["value"], unit: v["unit"] })) add(i.code, `${pp}/${i.code === "unknown-unit" ? "unit" : "value"}`, i.message);
    if (!row.units.includes(v["unit"])) add("property-unit-not-allowed", `${pp}/unit`, `${name} takes ${row.units.join(", ")}`);
    if (v["source"] !== undefined && !sourceIds.has(v["source"])) add("unknown-reference", `${pp}/source`, "source names no source record");
  }
}

function checkTraits(pr: Rec, p: string, add: Add): void {
  const traits = pr["traits"];
  if (traits === undefined) return;
  if (!isObject(traits)) return add("invalid-product", `${p}/traits`, "traits must be an object");
  for (const [name, v] of Object.entries(traits)) {
    if (!traitRow(String(pr["kind"]), name)) add("unknown-trait", `${p}/traits/${name}`, `${name} is not a trait of ${String(pr["kind"])}`);
    else if (typeof v !== "boolean") add("invalid-trait", `${p}/traits/${name}`, "a trait is true or false; leave it out if unknown");
  }
}

function checkHistory(r: Rec, p: string, add: Add, closed: Closed, current: string): void {
  const history = r["status_history"];
  if (history === undefined) return;
  if (!Array.isArray(history) || history.length === 0) return add("invalid-status-history", `${p}/status_history`, "status_history is a non-empty array");
  history.forEach((h, i) => {
    const at = `${p}/status_history/${i}`;
    if (!isObject(h)) return add("invalid-status-history", at, "an entry is an object");
    closed(h, MEMBERS.history, at);
    if (!isCalendarDate(h["date"])) add("invalid-status-history", `${at}/date`, "date is YYYY-MM-DD");
    if (!(RELATION_STATUSES as readonly unknown[]).includes(h["status"])) add("invalid-status-history", `${at}/status`, `status must be one of ${RELATION_STATUSES.join(", ")}`);
  });
  const last = history[history.length - 1];
  if (isObject(last) && (RELATION_STATUSES as readonly unknown[]).includes(last["status"]) && last["status"] !== current) add("status-history-stale", `${p}/status_history`, `the last entry says ${String(last["status"])}, the evidence says ${current}`);
}
