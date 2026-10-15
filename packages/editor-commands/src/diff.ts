import { canonicalize, type CalculatedStatistic, type Content, type Json } from "@carboy/recipe-core";
import { isObject, type Obj } from "./util.js";

// Semantic diff keyed by entity ID (EDITOR_COMMANDS §7), not a JSON Patch:
// a reviewer needs "Cascade: 28 g → 21 g". Labels carry display names (user
// text, display only). Statistics compare recalculated values; "cannot
// compute" stays visible as such, never as zero.

export type EntityType = "recipe" | "target" | "statistic_stated" | "ingredient" | "addition" | "stage" | "step" | "flow" | "note";

export interface FieldChange {
  readonly path: string;
  readonly before?: Json;
  readonly after?: Json;
}

export interface EntityChange {
  readonly type: EntityType;
  readonly id: string;
  readonly change: "added" | "removed" | "changed" | "moved";
  readonly label: { readonly [key: string]: string };
  readonly fields?: readonly FieldChange[];
}

export interface StatisticChange {
  readonly statistic: string;
  readonly before: CalculatedStatistic | { readonly absent: true };
  readonly after: CalculatedStatistic | { readonly absent: true };
}

export interface Diff {
  readonly entities: readonly EntityChange[];
  readonly statistics: readonly StatisticChange[];
}

const same = (a: unknown, b: unknown) => canonicalize((a ?? null) as Json) === canonicalize((b ?? null) as Json);
const arr = (o: unknown, key: string): Obj[] => (isObject(o) && Array.isArray(o[key]) ? (o[key] as Obj[]) : []);

export function diffContent(
  before: Content,
  after: Content,
  statsBefore: { readonly [k: string]: CalculatedStatistic },
  statsAfter: { readonly [k: string]: CalculatedStatistic },
): Diff {
  const b = before as unknown as Obj;
  const a = after as unknown as Obj;
  const entities: EntityChange[] = [];
  const names = (c: Obj) => new Map(arr(c, "ingredients").map((g) => [g["id"], String(g["name"] ?? "")]));
  const stageLabel = (c: Obj) => new Map(arr(c["process"], "stages").map((s) => [s["id"], String(s["name"] ?? s["kind"] ?? "")]));
  const ingB = names(b), ingA = names(a), stB = stageLabel(b), stA = stageLabel(a);

  // Recipe-level members.
  const recipeFields = ["name", "beverage", "calculation_settings"].filter((k) => !same(b[k], a[k])).map((k) => field(k, b[k], a[k]));
  if (recipeFields.length) entities.push({ type: "recipe", id: "recipe", change: "changed", label: { name: String(a["name"] ?? "") }, fields: recipeFields });

  // Keyed members: targets and stated statistics.
  keyed(entities, "target", isObject(b["targets"]) ? b["targets"] : {}, isObject(a["targets"]) ? a["targets"] : {});
  keyed(entities, "statistic_stated", isObject(b["statistics"]) ? b["statistics"] : {}, isObject(a["statistics"]) ? a["statistics"] : {});

  // Entities with IDs.
  byId(entities, "ingredient", arr(b, "ingredients"), arr(a, "ingredients"), (e) => ({ name: String(e["name"] ?? "") }));
  byId(entities, "addition", arr(b, "additions"), arr(a, "additions"), (e, side) => ({
    ingredient: (side === "before" ? ingB : ingA).get(e["ingredient"]) ?? "",
    stage: (side === "before" ? stB : stA).get(e["stage"]) ?? "",
  }));
  byId(entities, "stage", arr(b["process"], "stages"), arr(a["process"], "stages"), (e) => ({ name: String(e["name"] ?? e["kind"] ?? "") }), ["steps"]);
  const steps = (c: Obj) => arr(c["process"], "stages").flatMap((s) => arr(s, "steps").map((st) => ({ ...st, _stage: s["id"] })));
  byId(entities, "step", steps(b), steps(a), (e, side) => ({ name: String(e["name"] ?? ""), stage: (side === "before" ? stB : stA).get(e["_stage"]) ?? "" }));
  byId(entities, "flow", arr(b["process"], "flows"), arr(a["process"], "flows"), (e, side) => ({ from: (side === "before" ? stB : stA).get(e["from"]) ?? "", to: (side === "before" ? stB : stA).get(e["to"]) ?? "" }));
  byId(entities, "note", arr(b, "notes"), arr(a, "notes"), () => ({}));

  const statistics: StatisticChange[] = [];
  for (const k of [...new Set([...Object.keys(statsBefore), ...Object.keys(statsAfter)])].sort()) {
    const x = statsBefore[k], y = statsAfter[k];
    if (!same(x, y)) statistics.push({ statistic: k, before: x ?? { absent: true }, after: y ?? { absent: true } });
  }
  return { entities, statistics };
}

function field(path: string, before: unknown, after: unknown): FieldChange {
  return { path, ...(before !== undefined ? { before: before as Json } : {}), ...(after !== undefined ? { after: after as Json } : {}) };
}

function keyed(out: EntityChange[], type: EntityType, b: Obj, a: Obj): void {
  for (const k of [...new Set([...Object.keys(b), ...Object.keys(a)])]) {
    if (same(b[k], a[k])) continue;
    const change = b[k] === undefined ? "added" : a[k] === undefined ? "removed" : "changed";
    out.push({ type, id: k, change, label: { name: k }, fields: [field("", b[k], a[k])] });
  }
}

/** Compare by ID: added, removed, changed members, or moved (relative order changed among entities present in both). */
function byId(out: EntityChange[], type: EntityType, b: Obj[], a: Obj[], label: (e: Obj, side: "before" | "after") => { [k: string]: string }, ignore: string[] = []): void {
  const bIds = b.map((e) => e["id"]), aIds = a.map((e) => e["id"]);
  const common = aIds.filter((id) => bIds.includes(id));
  const orderB = bIds.filter((id) => common.includes(id));
  for (const e of a) {
    const prev = b.find((x) => x["id"] === e["id"]);
    if (!prev) {
      out.push({ type, id: String(e["id"]), change: "added", label: label(e, "after") });
      continue;
    }
    const keys = [...new Set([...Object.keys(prev), ...Object.keys(e)])].filter((k) => k !== "_stage" && !ignore.includes(k));
    const fields = keys.filter((k) => !same(prev[k], e[k])).map((k) => field(k, prev[k], e[k]));
    const moved = common.indexOf(e["id"]) !== orderB.indexOf(e["id"]) || (e["_stage"] !== undefined && prev["_stage"] !== e["_stage"]);
    if (fields.length) out.push({ type, id: String(e["id"]), change: "changed", label: label(e, "after"), fields });
    else if (moved) out.push({ type, id: String(e["id"]), change: "moved", label: label(e, "after") });
  }
  for (const e of b) if (!aIds.includes(e["id"])) out.push({ type, id: String(e["id"]), change: "removed", label: label(e, "before") });
}
