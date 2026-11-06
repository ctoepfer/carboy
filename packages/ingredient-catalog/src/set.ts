import { relationStatus } from "./evidence.js";
import { normalizeName, versionOrder, type Catalog, type CatalogIssue, type Group, type ItemRef, type Link, type Product, type Relation, type RelationStatus, type RecordType } from "./model.js";
import { catalogHash, validateCatalog, type Found } from "./validate.js";

// Catalogs open side by side. Records keep their own catalog's identity and
// class, and nothing is merged (IQ3): a user's entry is never mistaken for a
// curated one.

export interface Hit extends Found {
  readonly version: string;
  readonly class: Catalog["class"];
  /** The reference named a version this set doesn't hold; this is the newest. */
  readonly version_differs?: true;
}

export interface PathEntry {
  readonly ref: ItemRef;
  readonly name: string;
  readonly level: Group["level"];
  readonly class: Catalog["class"];
}

export interface ImportCandidate {
  readonly ref: Required<ItemRef>;
  readonly product: Product;
  readonly class: Catalog["class"];
  readonly matched_on: "identifier" | "alias" | "name";
}

export interface RelationView {
  readonly relation: Relation;
  readonly status: RelationStatus;
  readonly catalog: string;
}

const key = (r: { catalog: string; item: string }) => `${r.catalog}|${r.item}`;
const linkRef = (link: Link, catalog: string) => (typeof link === "string" ? { catalog, item: link } : link);

export class CatalogSet {
  private readonly byCatalog = new Map<string, Map<string, Catalog>>();
  private readonly reused: CatalogIssue[] = [];

  constructor(docs: readonly Catalog[]) {
    for (const doc of docs) {
      const versions = this.byCatalog.get(doc.catalog) ?? new Map<string, Catalog>();
      const prior = versions.get(doc.version);
      if (prior && catalogHash(prior) !== catalogHash(doc)) this.reused.push({ code: "version-reused", path: `/${doc.catalog}/${doc.version}`, message: "two documents claim this version with different content" });
      if (!prior) versions.set(doc.version, doc);
      this.byCatalog.set(doc.catalog, versions);
    }
  }

  /** The newest open version of each catalog, in id order so results are deterministic. */
  latest(): Catalog[] {
    return [...this.byCatalog.keys()].sort().map((id) => this.newest(id)!);
  }

  private newest(id: string): Catalog | undefined {
    const versions = this.byCatalog.get(id);
    return versions ? [...versions.values()].sort((a, b) => versionOrder(a.version, b.version)).at(-1) : undefined;
  }

  get(ref: ItemRef): Hit | undefined {
    const versions = this.byCatalog.get(ref.catalog);
    if (!versions) return undefined;
    const exact = ref.version !== undefined ? versions.get(ref.version) : undefined;
    const doc = exact ?? this.newest(ref.catalog)!;
    const found = locate(doc, ref.item);
    if (!found) return undefined;
    return { ...found, catalog: doc.catalog, version: doc.version, class: doc.class, ...(ref.version !== undefined && !exact ? { version_differs: true as const } : {}) };
  }

  /** Every document against every other, following links between catalogs. */
  validate(): CatalogIssue[] {
    const lookup = (ref: { catalog: string; item: string }) => this.get(ref);
    return [...this.reused, ...[...this.byCatalog.values()].flatMap((v) => [...v.values()].flatMap((doc) => validateCatalog(doc, lookup)))];
  }

  /** Root first, ending at the group itself. Empty if it can't be followed. */
  groupPath(ref: ItemRef): PathEntry[] {
    const path: PathEntry[] = [];
    const seen = new Set<string>();
    let at: ItemRef | undefined = ref;
    while (at) {
      const hit = this.get(at);
      if (!hit || hit.type !== "group" || seen.has(key(at))) return [];
      seen.add(key(at));
      const g = hit.record as unknown as Group;
      path.unshift({ ref: { catalog: hit.catalog, item: g.id }, name: g.name, level: g.level, class: hit.class });
      at = g.parent === undefined ? undefined : linkRef(g.parent, hit.catalog);
    }
    return path;
  }

  /** Is the product placed in this group or a descendant? Says nothing about identity (§2.0). */
  isInGroup(product: ItemRef, group: ItemRef): boolean {
    const hit = this.get(product);
    if (!hit || hit.type !== "product") return false;
    const placements = [
      linkRef((hit.record as unknown as Product).primary_group, hit.catalog),
      ...this.relations()
        .filter((v) => v.relation.type === "in_group" && v.status === "supported" && key(linkRef(v.relation.from, v.catalog)) === key({ catalog: hit.catalog, item: product.item }))
        .map((v) => linkRef(v.relation.to, v.catalog)),
    ];
    return placements.some((p) => this.groupPath(p).some((g) => key(g.ref as { catalog: string; item: string }) === key(group)));
  }

  /** Current claims from every open catalog, each with its derived status. */
  relations(): RelationView[] {
    return this.latest().flatMap((doc) => (doc.relations ?? []).map((relation) => ({ relation, status: relationStatus(relation), catalog: doc.catalog })));
  }

  /** Products an import's name or code could mean. Always a list for the user to confirm, never a match (rule 5). */
  importCandidates(text: string): ImportCandidate[] {
    const wanted = normalizeName(text);
    const out: ImportCandidate[] = [];
    if (wanted === "") return out;
    for (const doc of this.latest()) {
      for (const product of doc.products ?? []) {
        const matched_on = matchProduct(product, wanted);
        if (matched_on) out.push({ ref: { catalog: doc.catalog, item: product.id, version: doc.version }, product, class: doc.class, matched_on });
      }
    }
    return out;
  }
}

function matchProduct(p: Product, wanted: string): ImportCandidate["matched_on"] | undefined {
  if ((p.identifiers ?? []).some((i) => normalizeName(i.value) === wanted)) return "identifier";
  if ((p.aliases ?? []).some((a) => normalizeName(a) === wanted)) return "alias";
  if (normalizeName(p.name) === wanted || normalizeName(`${p.maker} ${p.name}`) === wanted) return "name";
  return undefined;
}

function locate(doc: Catalog, item: string): { type: RecordType; record: { [key: string]: unknown }; catalog: string } | undefined {
  const lists: [RecordType, readonly { readonly id: string }[] | undefined][] = [["group", doc.groups], ["product", doc.products], ["taxon", doc.taxa], ["strain", doc.strains]];
  for (const [type, list] of lists) {
    const record = list?.find((r) => r.id === item);
    if (record) return { type, record: record as unknown as { [key: string]: unknown }, catalog: doc.catalog };
  }
  return undefined;
}

export function openCatalogs(docs: readonly Catalog[]): CatalogSet {
  return new CatalogSet(docs);
}

/** "Why are these two related?": every direct claim, in either direction, with its evidence and status. */
export function relationsBetween(set: CatalogSet, a: ItemRef, b: ItemRef): RelationView[] {
  const pair = new Set([key(a), key(b)]);
  return set.relations().filter((v) => {
    const ends = [key(linkRef(v.relation.from, v.catalog)), key(linkRef(v.relation.to, v.catalog))];
    return ends[0] !== ends[1] && ends.every((e) => pair.has(e));
  });
}

export type IdentityResult = "same" | "not_same" | "contested" | "unknown";

/**
 * Only direct claims count: equivalence is not transitive (§2.4). A negative
 * claim is a hard boundary, and a pair with claims on both sides is contested,
 * never settled in either direction. Function never enters into it (D-030).
 */
export function strainIdentity(set: CatalogSet, a: ItemRef, b: ItemRef): { result: IdentityResult; relations: RelationView[] } {
  const relations = relationsBetween(set, a, b).filter((v) => v.relation.type === "same_strain" || v.relation.type === "not_same_strain");
  const positive = relations.some((v) => v.relation.type === "same_strain" && v.status === "supported");
  const negative = relations.some((v) => v.relation.type === "not_same_strain" && v.status === "supported");
  const result: IdentityResult = (positive && negative) || relations.some((v) => v.status === "contested") ? "contested" : negative ? "not_same" : positive ? "same" : "unknown";
  return { result, relations };
}

export { linkRef };
