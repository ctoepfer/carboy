// Ingredient catalog document v0 (INGREDIENT_CATALOG.md). One document is one
// immutable version of one catalog; a later version is a new document.
//
// Seven things stay apart here, and a recipe or batch never collapses them:
//   1. Functional groups: what a recipe needs (`groups`, level functional).
//   2. Organizational groups: browsing only, never evidence of anything.
//   3. Products: what a maker sells (`products`). A recipe's preferred product
//      and approved alternatives are references held by the recipe.
//   4. Scientific classification (`taxa`, `strains`): descriptive, separate
//      from groups. A taxon is never a group.
//   5. Evidence relationships (`relations`): claims with sources, including
//      negative ones. Status is derived from the evidence.
//   6. Retailer SKUs, prices, stock: not here. They belong to the Shop Bridge.
//   7. What was actually used: not here. It belongs to the batch record.

export const CATALOG_FORMAT = "ingredient-catalog";
export const CATALOG_SCHEMA_VERSION = "0.1";

export const CATALOG_CLASSES = ["curated", "community", "user"] as const;
export const GROUP_LEVELS = ["organizational", "functional"] as const;
export const PRODUCT_STATUSES = ["active", "discontinued"] as const;
export const REDISTRIBUTION = ["redistributable", "reference-only", "unknown"] as const;
/** Maker's own code and global trade number. Retailer identifiers are Shop Bridge data. */
export const IDENTIFIER_SCHEMES = ["maker_code", "gtin"] as const;
export const RETAILER_SCHEMES = ["sku", "retailer_sku", "shop_sku"] as const;
export const EVIDENCE_KINDS = ["genomic", "manufacturer", "trial", "sensory", "compiled", "community", "editorial"] as const;
export const CERTAINTIES = ["confirmed", "likely", "uncertain"] as const;
export const STANCES = ["supports", "contradicts"] as const;
export const RELATION_STATUSES = ["supported", "contested", "refuted", "unreviewed"] as const;

export type RecordType = "group" | "product" | "taxon" | "strain";
export type RelationStatus = (typeof RELATION_STATUSES)[number];

/** Which record types each relation joins. `from`, then `to`. */
export const RELATION_TYPES: Readonly<Record<string, { readonly from: readonly RecordType[]; readonly to: readonly RecordType[] }>> = {
  same_strain: { from: ["product"], to: ["product", "strain"] },
  not_same_strain: { from: ["product"], to: ["product"] },
  blend_contains: { from: ["product"], to: ["strain"] },
  derived_from: { from: ["strain"], to: ["strain"] },
  sibling_of: { from: ["strain"], to: ["strain"] },
  related_to: { from: ["strain"], to: ["strain"] },
  member_of: { from: ["strain"], to: ["taxon"] },
  functional_peer: { from: ["product"], to: ["product"] },
  not_substitutable_for: { from: ["product"], to: ["product", "group"] },
  in_group: { from: ["product"], to: ["group"] },
};

/** A stable reference to a record, in any catalog. `version` is optional: without it, the newest version answers. */
export interface ItemRef {
  readonly catalog: string;
  readonly item: string;
  readonly version?: string;
}

/** Inside a document: the id of a record there, or a reference to another catalog. */
export type Link = string | { readonly catalog: string; readonly item: string };

export interface StatedValue {
  readonly value: string;
  readonly unit: string;
  readonly source?: string;
}

export interface Group {
  readonly id: string;
  readonly kind: string;
  readonly level: (typeof GROUP_LEVELS)[number];
  readonly name: string;
  readonly parent?: Link;
  readonly description?: string;
  readonly aliases?: readonly string[];
}

export interface Product {
  readonly id: string;
  readonly kind: string;
  readonly maker: string;
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly identifiers?: readonly { readonly scheme: string; readonly value: string }[];
  readonly primary_group: Link;
  readonly properties?: { readonly [name: string]: StatedValue };
  readonly traits?: { readonly [name: string]: boolean };
  readonly status: (typeof PRODUCT_STATUSES)[number];
}

export interface Taxon {
  readonly id: string;
  readonly rank: string;
  readonly name: string;
  readonly synonyms?: readonly string[];
}

export interface Strain {
  readonly id: string;
  readonly name: string;
}

export interface Evidence {
  readonly id: string;
  readonly source: string;
  readonly kind: (typeof EVIDENCE_KINDS)[number];
  readonly certainty: (typeof CERTAINTIES)[number];
  readonly stance: (typeof STANCES)[number];
  readonly observed?: string;
  readonly locator?: string;
  readonly note?: string;
  readonly superseded_by?: string;
}

export interface Relation {
  readonly id: string;
  readonly type: string;
  readonly from: Link;
  readonly to: Link;
  readonly evidence: readonly Evidence[];
  readonly status_history?: readonly { readonly date: string; readonly status: RelationStatus; readonly evidence?: readonly string[]; readonly note?: string }[];
}

export interface Source {
  readonly id: string;
  readonly title: string;
  readonly redistribution: (typeof REDISTRIBUTION)[number];
  readonly licence?: string;
  readonly date?: string;
  readonly url?: string;
}

export interface Catalog {
  readonly format: string;
  readonly schema_version: string;
  readonly catalog: string;
  readonly version: string;
  readonly class: (typeof CATALOG_CLASSES)[number];
  readonly name: string;
  readonly sources?: readonly Source[];
  readonly groups?: readonly Group[];
  readonly products?: readonly Product[];
  readonly taxa?: readonly Taxon[];
  readonly strains?: readonly Strain[];
  readonly relations?: readonly Relation[];
}

export interface CatalogIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export function isObject(v: unknown): v is { [key: string]: unknown } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Case, spacing, and Unicode form don't distinguish names. */
export function normalizeName(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Compares positive-integer version strings. */
export function versionOrder(a: string, b: string): number {
  return a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0;
}
