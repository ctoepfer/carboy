import { versionOrder, type Catalog, type CatalogIssue } from "./model.js";
import { catalogHash } from "./validate.js";

// What a new version of a catalog may not do (§2.4). Identities are permanent,
// so old recipes keep resolving; evidence is never deleted, only superseded.

const LISTS = ["sources", "groups", "products", "taxa", "strains", "relations"] as const;

export function compareVersions(previous: Catalog, next: Catalog): CatalogIssue[] {
  const out: CatalogIssue[] = [];
  const add = (code: string, path: string, message: string) => out.push({ code, path, message });
  if (previous.catalog !== next.catalog) {
    add("catalog-id-changed", "/catalog", "a catalog keeps its id across versions");
    return out;
  }
  if (previous.version === next.version) {
    if (catalogHash(previous) !== catalogHash(next)) add("version-reused", "/version", "a version's content never changes; publish a new version");
    return out;
  }
  if (versionOrder(next.version, previous.version) < 0) add("version-not-increasing", "/version", `${next.version} is older than ${previous.version}`);
  for (const list of LISTS) {
    const later = new Map((next[list] ?? []).map((r) => [r.id, r] as const));
    for (const before of previous[list] ?? []) {
      const after = later.get(before.id);
      if (!after) {
        add("item-removed", before.id, "records stay so old references resolve; mark a product discontinued instead");
        continue;
      }
      if ("kind" in before && "kind" in after && before.kind !== after.kind) add("kind-changed", before.id, "a record keeps its kind; add a new record");
      if ("evidence" in before && "evidence" in after) {
        const kept = new Set(after.evidence.map((e) => e.id));
        for (const e of before.evidence) if (!kept.has(e.id)) add("evidence-removed", e.id, "evidence is never deleted; mark it superseded");
      }
    }
  }
  return out;
}
